import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultTitle } from "@/components/vault-title";

// Autosave is debounced at 3s and the "saved" check clears after 1.5s, so the
// whole component is timer-driven — use fake timers and fireEvent (synchronous,
// no inter-keystroke delays) to keep these deterministic and fast.
function setup(
  onSave: (title: string) => Promise<void> = vi.fn<(title: string) => Promise<void>>().mockResolvedValue(undefined),
  initialTitle = "Start",
) {
  render(<VaultTitle initialTitle={initialTitle} onSave={onSave} />);
  return { onSave, input: screen.getByRole("textbox", { name: /vault title/i }) };
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe("VaultTitle", () => {
  it("renders the initial title", () => {
    const { input } = setup(undefined, "My vault");
    expect(input).toHaveValue("My vault");
  });

  it("mirrors the title into document.title", () => {
    setup(undefined, "Reading list");
    expect(document.title).toBe("Reading list | Blinks");
  });

  it("autosaves the trimmed value 3s after typing stops", async () => {
    const { onSave, input } = setup();
    type(input, "  Hello  ");
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Hello");
  });

  it("saves immediately on Enter", async () => {
    const { onSave, input } = setup();
    type(input, "Quick");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onSave).toHaveBeenCalledExactlyOnceWith("Quick");
  });

  it("does not save when the value is unchanged", async () => {
    const { onSave, input } = setup(undefined, "Same");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("debounces — only the final value is saved after rapid edits", async () => {
    const { onSave, input } = setup();
    type(input, "a");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    type(input, "abc");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onSave).toHaveBeenCalledExactlyOnceWith("abc");
  });

  it("flashes the saved check after a successful save", async () => {
    const { input } = setup();
    const check = document.querySelector("svg[aria-hidden='true']")!;
    expect(check).toHaveClass("opacity-0");

    type(input, "Done");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(check).toHaveClass("opacity-100");
  });

  it("truncates to the 80-char maximum before saving", async () => {
    const { onSave, input } = setup();
    type(input, "x".repeat(90));
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onSave).toHaveBeenCalledExactlyOnceWith("x".repeat(80));
  });

  it("keeps the draft (does not mark saved) when onSave rejects", async () => {
    const onSave = vi.fn<(title: string) => Promise<void>>().mockRejectedValue(new Error("nope"));
    const { input } = setup(onSave);
    type(input, "Retry me");
    await act(async () => {
      fireEvent.keyDown(input, { key: "Enter" });
    });
    expect(onSave).toHaveBeenCalledOnce();
    expect(document.querySelector("svg[aria-hidden='true']")).toHaveClass("opacity-0");
    expect(input).toHaveValue("Retry me");
  });
});
