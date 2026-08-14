import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LinksView } from "@/components/links-view";
import type { LinkItem } from "@/lib/types";

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} />;
  },
}));

type Meta = { title: string; description: string; image: string };
type PutResult = { version: number } | { conflict: true; current: { ciphertext: string; version: number } | null };
type PutInput = { blobId: string; ciphertext: string; expectedVersion: number };

const fetchMetadata = vi.hoisted(() => vi.fn<(url: string) => Promise<Meta>>());
const putBlob = vi.hoisted(() => vi.fn<(input: PutInput) => Promise<PutResult>>());
vi.mock("@/lib/actions", () => ({ fetchMetadata, putBlob }));

// Make the "ciphertext" a transparent JSON round-trip so a commit's payload can
// be inspected directly, and conflict-rebasing can decrypt it back.
vi.mock("@/lib/crypto", () => ({
  encryptJSON: vi.fn<(key: CryptoKey, value: unknown) => Promise<string>>(async (_key, value) => JSON.stringify(value)),
  decryptVault: vi.fn<(key: CryptoKey, ct: string) => Promise<unknown>>(async (_key, ct) => JSON.parse(ct)),
}));

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- inert placeholder key, only ever handed to mocked crypto
const session = { blobId: "a".repeat(64), key: {} as CryptoKey };

function link(over: Partial<LinkItem> = {}): LinkItem {
  return { id: "seed", url: "https://seed.com", title: "Seed", description: "", image: "", createdAt: 1, ...over };
}

function renderView(props: Partial<Parameters<typeof LinksView>[0]> = {}) {
  const onLogout = vi.fn<() => void>();
  render(
    <LinksView
      session={session}
      initialTitle={props.initialTitle ?? "T"}
      initialLinks={props.initialLinks ?? []}
      initialVersion={props.initialVersion ?? 0}
      onLogout={onLogout}
    />,
  );
  return { onLogout, input: screen.getByPlaceholderText(/paste a link/i) };
}

// The last vault payload handed to putBlob, decoded.
function lastCommitted() {
  const calls = putBlob.mock.calls;
  return JSON.parse(calls[calls.length - 1][0].ciphertext);
}

async function addLink(input: HTMLElement, url: string) {
  fireEvent.change(input, { target: { value: url } });
  await act(async () => {
    fireEvent.submit(input.closest("form")!);
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMetadata.mockResolvedValue({ title: "Fetched Title", description: "Fetched desc", image: "" });
  putBlob.mockResolvedValue({ version: 1 });
});

describe("LinksView — rendering", () => {
  it("shows the empty state with no links", () => {
    renderView();
    expect(screen.getByText(/nothing saved yet/i)).toBeInTheDocument();
  });

  it("renders seeded links", () => {
    renderView({ initialLinks: [link({ id: "1", title: "Hello", url: "https://hello.com" })] });
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.queryByText(/nothing saved yet/i)).not.toBeInTheDocument();
  });
});

describe("LinksView — adding", () => {
  it("adds a valid link, fetches metadata, and commits the vault", async () => {
    const { input } = renderView();
    await addLink(input, "https://new.com");

    await waitFor(() => expect(putBlob).toHaveBeenCalled());
    expect(fetchMetadata).toHaveBeenCalledWith("https://new.com");

    const committed = lastCommitted();
    expect(committed.links).toHaveLength(1);
    expect(committed.links[0]).toMatchObject({
      url: "https://new.com",
      title: "Fetched Title",
      description: "Fetched desc",
    });
    expect(input).toHaveValue("");
  });

  it("prepends https:// to a bare domain before saving", async () => {
    const { input } = renderView();
    await addLink(input, "example.org");
    await waitFor(() => expect(putBlob).toHaveBeenCalled());
    expect(fetchMetadata).toHaveBeenCalledWith("https://example.org");
  });

  it("rejects a bare word (no TLD) — shakes and does not commit", async () => {
    const { input } = renderView();
    await addLink(input, "hello");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(putBlob).not.toHaveBeenCalled();
    expect(fetchMetadata).not.toHaveBeenCalled();
  });

  it("falls back to the URL as the title when metadata has none", async () => {
    fetchMetadata.mockResolvedValue({ title: "", description: "", image: "" });
    const { input } = renderView();
    await addLink(input, "https://notitle.com");
    await waitFor(() => expect(putBlob).toHaveBeenCalled());
    expect(lastCommitted().links[0].title).toBe("https://notitle.com");
  });

  it("still commits (with fallbacks) when metadata fetch throws", async () => {
    fetchMetadata.mockRejectedValue(new Error("network"));
    const { input } = renderView();
    await addLink(input, "https://flaky.com");
    await waitFor(() => expect(putBlob).toHaveBeenCalled());
    expect(lastCommitted().links[0]).toMatchObject({ url: "https://flaky.com", title: "https://flaky.com" });
  });
});

describe("LinksView — duplicates", () => {
  it("does not add a link that is already saved (ignoring trailing slash/case)", async () => {
    const { input } = renderView({
      initialLinks: [link({ id: "1", url: "https://dup.com/page", title: "Dup" })],
    });
    await addLink(input, "https://DUP.com/page/");

    expect(putBlob).not.toHaveBeenCalled();
    expect(fetchMetadata).not.toHaveBeenCalled();
    // Still exactly one matching card.
    expect(screen.getAllByText("Dup")).toHaveLength(1);
  });
});

describe("LinksView — deleting", () => {
  it("removes a link and commits the shortened vault", async () => {
    const { input: _input } = renderView({
      initialLinks: [link({ id: "1", url: "https://gone.com", title: "Gone" })],
    });

    // Two-step delete: arm, then confirm.
    fireEvent.click(screen.getByRole("button", { name: /delete link/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /confirm delete/i }));
    });

    await waitFor(() => expect(putBlob).toHaveBeenCalled());
    expect(lastCommitted().links).toHaveLength(0);
  });
});

describe("LinksView — logout", () => {
  it("invokes onLogout when the log-out button is clicked", () => {
    const { onLogout } = renderView();
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});

describe("LinksView — optimistic concurrency", () => {
  it("re-fetches, rebases, and retries on a version conflict", async () => {
    // First write conflicts against a newer server state holding one link;
    // the retry must merge the new link on top of it.
    putBlob
      .mockResolvedValueOnce({
        conflict: true,
        current: {
          ciphertext: JSON.stringify({ title: "T", links: [link({ id: "srv", url: "https://server.com" })] }),
          version: 5,
        },
      })
      .mockResolvedValueOnce({ version: 6 });

    const { input } = renderView();
    await addLink(input, "https://mine.com");

    await waitFor(() => expect(putBlob).toHaveBeenCalledTimes(2));
    // Second attempt was guarded against the server's version.
    expect(putBlob.mock.calls[1][0].expectedVersion).toBe(5);

    const committed = lastCommitted();
    const urls = committed.links.map((l: LinkItem) => l.url);
    expect(urls).toContain("https://mine.com");
    expect(urls).toContain("https://server.com");
  });

  it("surfaces an inline, dismissable error when every retry conflicts", async () => {
    putBlob.mockResolvedValue({ conflict: true, current: null });
    const { input } = renderView();
    await addLink(input, "https://loop.com");

    const err = await screen.findByText(/could not save after several attempts/i);
    expect(err).toBeInTheDocument();
    // The whole banner is a dismiss button.
    fireEvent.click(err.closest("button")!);
    expect(screen.queryByText(/could not save after several attempts/i)).not.toBeInTheDocument();
  });
});
