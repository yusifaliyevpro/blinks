import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LinkCard, type DisplayLink } from "@/components/link-card";

// next/image pulls in the Next runtime; a plain <img> is all these tests need.
vi.mock("next/image", () => ({
  default: ({ src, alt, onError }: { src: string; alt: string; onError?: () => void }) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={alt} data-testid="og-image" onError={onError} />;
  },
}));

function makeLink(over: Partial<DisplayLink> = {}): DisplayLink {
  return {
    id: "1",
    url: "https://www.example.com/article/",
    title: "Example Article",
    description: "A short description",
    image: "",
    createdAt: 1,
    ...over,
  };
}

function renderCard(over: Partial<DisplayLink> = {}, onDelete = vi.fn<(id: string) => void>()) {
  const link = makeLink(over);
  render(<LinkCard link={link} index={0} onDelete={onDelete} />);
  return { link, onDelete };
}

describe("LinkCard — content", () => {
  it("renders title, description, and the prettified URL", () => {
    renderCard();
    expect(screen.getByText("Example Article")).toBeInTheDocument();
    expect(screen.getByText("A short description")).toBeInTheDocument();
    // prettyUrl strips protocol, www., and the trailing slash.
    expect(screen.getByText("example.com/article")).toBeInTheDocument();
  });

  it("links out safely in a new tab", () => {
    renderCard();
    const anchor = screen.getByRole("link");
    expect(anchor).toHaveAttribute("href", "https://www.example.com/article/");
    expect(anchor).toHaveAttribute("target", "_blank");
    expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("omits the description paragraph when there is none", () => {
    renderCard({ description: "" });
    expect(screen.queryByText("A short description")).not.toBeInTheDocument();
  });

  it("shows a loading state (spinner + host) while pending with no title", () => {
    renderCard({ pending: true, title: "", url: "https://www.pending.dev/x" });
    expect(screen.getByText("pending.dev")).toBeInTheDocument();
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
  });
});

describe("LinkCard — image", () => {
  it("renders the OG image when present", () => {
    renderCard({ image: "https://cdn.example/og.png" });
    expect(screen.getByTestId("og-image")).toHaveAttribute("src", "https://cdn.example/og.png");
  });

  it("hides the image after a load error", () => {
    renderCard({ image: "https://cdn.example/broken.png" });
    const img = screen.getByTestId("og-image");
    fireEvent.error(img);
    expect(screen.queryByTestId("og-image")).not.toBeInTheDocument();
  });

  it("shows no image when the link has none", () => {
    renderCard({ image: "" });
    expect(screen.queryByTestId("og-image")).not.toBeInTheDocument();
  });
});

describe("LinkCard — two-step delete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("arms on the first click and deletes on the second", () => {
    const onDelete = vi.fn<(id: string) => void>();
    render(<LinkCard link={makeLink()} index={0} onDelete={onDelete} />);

    const btn = screen.getByRole("button", { name: /delete link/i });
    fireEvent.click(btn);
    expect(onDelete).not.toHaveBeenCalled();
    // Now armed: the accessible name flips to the confirm state.
    const confirm = screen.getByRole("button", { name: /confirm delete/i });
    fireEvent.click(confirm);
    expect(onDelete).toHaveBeenCalledExactlyOnceWith("1");
  });

  it("disarms itself after 3s without a second click", () => {
    const onDelete = vi.fn<(id: string) => void>();
    render(<LinkCard link={makeLink()} index={0} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: /delete link/i }));
    expect(screen.getByRole("button", { name: /confirm delete/i })).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.getByRole("button", { name: /^delete link$/i })).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("keeps the delete button out of the tab order (safety trade-off)", () => {
    render(<LinkCard link={makeLink()} index={0} onDelete={vi.fn<(id: string) => void>()} />);
    expect(screen.getByRole("button", { name: /delete link/i })).toHaveAttribute("tabindex", "-1");
  });
});
