import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VaultApp } from "@/components/vault-app";

type Session = { blobId: string; key: CryptoKey };

const loadSession = vi.hoisted(() => vi.fn<() => Promise<Session | null>>());
const decryptVault = vi.hoisted(() =>
  vi.fn<(key: CryptoKey, ct: string) => Promise<{ title: string; links: unknown[] }>>(),
);
const clearSession = vi.hoisted(() => vi.fn<() => void>());
const getBlob = vi.hoisted(() => vi.fn<(id: string) => Promise<{ ciphertext: string; version: number } | null>>());

vi.mock("@/lib/crypto", () => ({ loadSession, decryptVault, clearSession }));
vi.mock("@/lib/actions", () => ({ getBlob }));

// Replace the heavy children with markers so this suite exercises only the
// phase machine (checking → locked → unlocked) and its wiring.
vi.mock("@/components/password-screen", () => ({
  PasswordScreen: ({ onUnlock }: { onUnlock: (u: unknown) => void }) => (
    <button
      type="button"
      onClick={() => onUnlock({ session: { blobId: "x", key: {} }, title: "Unlocked!", links: [], version: 0 })}
    >
      password-screen
    </button>
  ),
}));
vi.mock("@/components/links-view", () => ({
  LinksView: ({ initialTitle, onLogout }: { initialTitle: string; onLogout: () => void }) => (
    <div>
      <span>links-view: {initialTitle}</span>
      <button type="button" onClick={onLogout}>
        logout
      </button>
    </div>
  ),
}));

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- inert placeholder key, only ever handed to mocked crypto
const fakeSession: Session = { blobId: "b".repeat(64), key: {} as CryptoKey };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("VaultApp — phase machine", () => {
  it("falls back to the locked screen when there is no stored session", async () => {
    loadSession.mockResolvedValue(null);
    render(<VaultApp />);
    expect(await screen.findByText("password-screen")).toBeInTheDocument();
    expect(getBlob).not.toHaveBeenCalled();
  });

  it("auto-unlocks from a stored session and decrypts the vault", async () => {
    loadSession.mockResolvedValue(fakeSession);
    getBlob.mockResolvedValue({ ciphertext: "ct", version: 3 });
    decryptVault.mockResolvedValue({ title: "Restored", links: [] });

    render(<VaultApp />);
    expect(await screen.findByText("links-view: Restored")).toBeInTheDocument();
    expect(decryptVault).toHaveBeenCalledWith(fakeSession.key, "ct");
  });

  it("unlocks to an empty vault when the stored session has no blob yet", async () => {
    loadSession.mockResolvedValue(fakeSession);
    getBlob.mockResolvedValue(null);

    render(<VaultApp />);
    expect(await screen.findByText(/^links-view:/)).toBeInTheDocument();
    expect(decryptVault).not.toHaveBeenCalled();
  });

  it("clears the session and locks when the stored key no longer decrypts", async () => {
    loadSession.mockResolvedValue(fakeSession);
    getBlob.mockResolvedValue({ ciphertext: "ct", version: 1 });
    decryptVault.mockRejectedValue(new Error("stale key"));

    render(<VaultApp />);
    expect(await screen.findByText("password-screen")).toBeInTheDocument();
    expect(clearSession).toHaveBeenCalledOnce();
  });

  it("transitions to the vault after a manual unlock", async () => {
    loadSession.mockResolvedValue(null);
    render(<VaultApp />);

    fireEvent.click(await screen.findByText("password-screen"));
    expect(await screen.findByText("links-view: Unlocked!")).toBeInTheDocument();
  });

  it("logs out back to the password screen, clearing the session", async () => {
    loadSession.mockResolvedValue(fakeSession);
    getBlob.mockResolvedValue(null);
    render(<VaultApp />);

    fireEvent.click(await screen.findByText("logout"));
    await waitFor(() => expect(screen.getByText("password-screen")).toBeInTheDocument());
    expect(clearSession).toHaveBeenCalledOnce();
  });
});
