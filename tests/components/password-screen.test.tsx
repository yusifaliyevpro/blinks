import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PasswordScreen } from "@/components/password-screen";

type Derived = { blobId: string; key: CryptoKey; encKeyBytes: Uint8Array };

const deriveVault = vi.hoisted(() => vi.fn<(password: string) => Promise<Derived>>());
const decryptVault = vi.hoisted(() =>
  vi.fn<(key: CryptoKey, ct: string) => Promise<{ title: string; links: unknown[] }>>(),
);
const generatePassword = vi.hoisted(() => vi.fn<(length?: number) => string>());
const saveSession = vi.hoisted(() => vi.fn<(blobId: string, encKeyBytes: Uint8Array) => void>());
const getBlob = vi.hoisted(() => vi.fn<(id: string) => Promise<{ ciphertext: string; version: number } | null>>());

vi.mock("@/lib/crypto", () => ({ deriveVault, decryptVault, generatePassword, saveSession }));
vi.mock("@/lib/actions", () => ({ getBlob }));

const FAKE_VAULT: Derived = {
  blobId: "b".repeat(64),
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- inert placeholder key, only ever handed to mocked crypto
  key: {} as CryptoKey,
  encKeyBytes: new Uint8Array(32),
};

// Captured per-test so assertions reference a bound mock, not navigator's getter.
let clipboardWrite: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;

function renderScreen(onUnlock = vi.fn<(u: unknown) => void>()) {
  render(<PasswordScreen onUnlock={onUnlock} />);
  return { onUnlock, input: screen.getByPlaceholderText("Password") };
}

beforeEach(() => {
  vi.clearAllMocks();
  deriveVault.mockResolvedValue(FAKE_VAULT);
  clipboardWrite = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboardWrite },
    configurable: true,
  });
});

describe("PasswordScreen — presentation", () => {
  it("renders the wordmark and a password field", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Blinks" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Password")).toHaveAttribute("type", "password");
  });

  it("shows a character counter only once something is typed", () => {
    const { input } = renderScreen();
    expect(screen.queryByText("5")).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: "hello" } });
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("toggles password visibility", () => {
    const { input } = renderScreen();
    const toggle = screen.getByRole("button", { name: /show password/i });
    fireEvent.click(toggle);
    expect(input).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: /hide password/i })).toHaveAttribute("aria-pressed", "true");
  });

  it("disables password-manager autocomplete by default", () => {
    const { input } = renderScreen();
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("data-lpignore", "true");
  });
});

describe("PasswordScreen — generate", () => {
  it("fills a generated password and copies it to the clipboard", async () => {
    generatePassword.mockReturnValue("GENERATED-PASSWORD");
    const { input } = renderScreen();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /generate a strong random password/i }));
    });

    expect(generatePassword).toHaveBeenCalledWith(200);
    expect(input).toHaveValue("GENERATED-PASSWORD");
    expect(clipboardWrite).toHaveBeenCalledWith("GENERATED-PASSWORD");
  });
});

describe("PasswordScreen — unlock flow", () => {
  it("does nothing when submitted empty", async () => {
    const { onUnlock } = renderScreen();
    await act(async () => {
      fireEvent.submit(screen.getByPlaceholderText("Password").closest("form")!);
    });
    expect(deriveVault).not.toHaveBeenCalled();
    expect(onUnlock).not.toHaveBeenCalled();
  });

  it("unlocks an empty vault when no blob exists yet", async () => {
    getBlob.mockResolvedValue(null);
    const { onUnlock, input } = renderScreen();

    fireEvent.change(input, { target: { value: "pw" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });

    expect(saveSession).toHaveBeenCalledWith(FAKE_VAULT.blobId, FAKE_VAULT.encKeyBytes);
    expect(onUnlock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "",
        links: [],
        version: 0,
        session: { blobId: FAKE_VAULT.blobId, key: FAKE_VAULT.key },
      }),
    );
    expect(decryptVault).not.toHaveBeenCalled();
  });

  it("decrypts and unlocks an existing vault", async () => {
    getBlob.mockResolvedValue({ ciphertext: "ct", version: 4 });
    decryptVault.mockResolvedValue({ title: "Mine", links: [{ id: "1" }] });
    const { onUnlock, input } = renderScreen();

    fireEvent.change(input, { target: { value: "pw" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });

    expect(decryptVault).toHaveBeenCalledWith(FAKE_VAULT.key, "ct");
    expect(onUnlock).toHaveBeenCalledWith(expect.objectContaining({ title: "Mine", links: [{ id: "1" }], version: 4 }));
  });

  it("shakes and clears the field on a wrong password (decrypt throws)", async () => {
    getBlob.mockResolvedValue({ ciphertext: "ct", version: 1 });
    decryptVault.mockRejectedValue(new Error("auth failure"));
    const { onUnlock, input } = renderScreen();

    fireEvent.change(input, { target: { value: "wrong" } });
    await act(async () => {
      fireEvent.submit(input.closest("form")!);
    });

    await waitFor(() => expect(input).toHaveValue(""));
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(onUnlock).not.toHaveBeenCalled();
    expect(saveSession).not.toHaveBeenCalled();
  });
});
