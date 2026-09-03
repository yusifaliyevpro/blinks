import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultIO } from "@/components/vault-io";
import type { LinkItem } from "@/lib/types";

// Toasts are a global side effect — assert on the mock, not the DOM.
const toast = vi.hoisted(() =>
  Object.assign(vi.fn<(message: string) => void>(), { error: vi.fn<(message: string) => void>() }),
);
vi.mock("sonner", () => ({ toast }));

function link(over: Partial<LinkItem> = {}): LinkItem {
  return { id: "seed", url: "https://seed.com", title: "Seed", description: "", image: "", createdAt: 1, ...over };
}

// Download plumbing: capture the Blob handed to createObjectURL and the anchor's
// download filename, without letting the click actually navigate.
let objectUrls: Blob[];
let downloadName: string;
let clickSpy: ReturnType<typeof vi.spyOn>;
let createObjectURL: ReturnType<typeof vi.fn<(blob: Blob) => string>>;
let revokeObjectURL: ReturnType<typeof vi.fn<(url: string) => void>>;

function renderIO(over: Partial<Parameters<typeof VaultIO>[0]> = {}) {
  const onImport = vi.fn<(links: LinkItem[]) => void>();
  const getLinks = over.getLinks ?? (() => []);
  const getTitle = over.getTitle ?? (() => "T");
  render(<VaultIO getLinks={getLinks} getTitle={getTitle} onImport={onImport} />);
  return { onImport, getLinks, getTitle };
}

// Fire a JSON file through the hidden import input and let the async handler run.
async function importFile(contents: string, name = "import.json") {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
  const file = new File([contents], name, { type: "application/json" });
  await act(async () => {
    fireEvent.change(input, { target: { files: [file] } });
  });
  return input;
}

beforeEach(() => {
  objectUrls = [];
  downloadName = "";
  createObjectURL = vi.fn<(blob: Blob) => string>((blob) => {
    objectUrls.push(blob);
    return "blob:mock";
  });
  revokeObjectURL = vi.fn<(url: string) => void>();
  URL.createObjectURL = createObjectURL;
  URL.revokeObjectURL = revokeObjectURL;
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloadName = this.download;
  });
});

afterEach(() => {
  clickSpy.mockRestore();
  vi.clearAllMocks();
});

describe("VaultIO — export", () => {
  it("toasts and does not download when there are no links", () => {
    renderIO({ getLinks: () => [] });
    fireEvent.click(screen.getByRole("button", { name: /export links/i }));
    expect(toast).toHaveBeenCalledWith("Nothing to export yet.");
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
  });

  it("downloads the links (only) as pretty JSON", async () => {
    const links = [link({ id: "1", url: "https://a.com", title: "A" })];
    renderIO({ getLinks: () => links, getTitle: () => "Reading" });
    fireEvent.click(screen.getByRole("button", { name: /export links/i }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const text = await objectUrls[0].text();
    expect(JSON.parse(text)).toEqual(links);
    // Title is never part of the export payload.
    expect(text).not.toContain("Reading");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mock");
  });

  it("names the file from a slugified title plus the date", () => {
    renderIO({ getLinks: () => [link()], getTitle: () => "My Reading List!" });
    fireEvent.click(screen.getByRole("button", { name: /export links/i }));
    expect(downloadName).toMatch(/^my-reading-list-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("falls back to 'blinks' when the title has no slug-able characters", () => {
    renderIO({ getLinks: () => [link()], getTitle: () => "***" });
    fireEvent.click(screen.getByRole("button", { name: /export links/i }));
    expect(downloadName).toMatch(/^blinks-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe("VaultIO — import validation", () => {
  it("rejects a file that isn't valid JSON", async () => {
    const { onImport } = renderIO();
    await importFile("this is not json {");
    expect(toast.error).toHaveBeenCalledWith("Import failed — the file isn't valid JSON.");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("rejects JSON that isn't a Blinks export (not an array)", async () => {
    const { onImport } = renderIO();
    await importFile(JSON.stringify({ links: [] }));
    expect(toast.error).toHaveBeenCalledWith("Import failed — the file isn't a valid Blinks export.");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("rejects an array whose entries lack a url", async () => {
    const { onImport } = renderIO();
    await importFile(JSON.stringify([{ title: "no url" }]));
    expect(toast.error).toHaveBeenCalledWith("Import failed — the file isn't a valid Blinks export.");
    expect(onImport).not.toHaveBeenCalled();
  });
});

describe("VaultIO — import mapping and dedup", () => {
  it("imports valid links, minting fresh ids and applying defaults", async () => {
    const { onImport } = renderIO();
    await importFile(JSON.stringify([{ url: "https://new.com" }]));

    expect(onImport).toHaveBeenCalledOnce();
    const added = onImport.mock.calls[0][0];
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      url: "https://new.com",
      title: "https://new.com", // title || url fallback
      description: "",
      image: "",
    });
    expect(added[0].id).toEqual(expect.any(String));
    expect(added[0].createdAt).toEqual(expect.any(Number));
  });

  it("preserves provided metadata and prepends https:// to a bare host", async () => {
    const { onImport } = renderIO();
    await importFile(
      JSON.stringify([
        { url: "example.org/x", title: "Ex", description: "d", image: "https://i/x.png", createdAt: 42 },
      ]),
    );
    expect(onImport.mock.calls[0][0][0]).toMatchObject({
      url: "https://example.org/x",
      title: "Ex",
      description: "d",
      image: "https://i/x.png",
      createdAt: 42,
    });
  });

  it("skips links already saved (dedup against existing, ignoring case/slash)", async () => {
    const { onImport } = renderIO({ getLinks: () => [link({ url: "https://dup.com/page" })] });
    await importFile(JSON.stringify([{ url: "https://DUP.com/page/" }, { url: "https://fresh.com" }]));

    const added = onImport.mock.calls[0][0];
    expect(added.map((l) => l.url)).toEqual(["https://fresh.com"]);
  });

  it("de-dups repeated links within the file itself", async () => {
    const { onImport } = renderIO();
    await importFile(JSON.stringify([{ url: "https://same.com/a" }, { url: "https://same.com/a/" }]));
    expect(onImport.mock.calls[0][0]).toHaveLength(1);
  });

  it("skips invalid and dangerous links (href XSS guard)", async () => {
    const { onImport } = renderIO();
    await importFile(JSON.stringify([{ url: "javascript:alert(1)" }, { url: "hello" }, { url: "https://ok.com" }]));
    expect(onImport.mock.calls[0][0].map((l) => l.url)).toEqual(["https://ok.com"]);
  });

  it("toasts and does not import when everything is already saved", async () => {
    const { onImport } = renderIO({ getLinks: () => [link({ url: "https://dup.com" })] });
    await importFile(JSON.stringify([{ url: "https://dup.com" }]));
    expect(toast).toHaveBeenCalledWith("Nothing to import — every link is already saved.");
    expect(onImport).not.toHaveBeenCalled();
  });

  it("resets the input value so re-picking the same file re-fires onChange", async () => {
    renderIO();
    const input = await importFile(JSON.stringify([{ url: "https://x.com" }]));
    expect(input.value).toBe("");
  });
});
