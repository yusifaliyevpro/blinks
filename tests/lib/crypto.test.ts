import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearSession,
  decryptJSON,
  decryptVault,
  deriveVault,
  encryptJSON,
  generatePassword,
  loadBackendPreference,
  loadSession,
  saveBackendPreference,
  saveSession,
} from "@/lib/crypto";
import type { VaultData } from "@/lib/types";

// deriveVault runs a real Argon2id pass (64 MiB / 3 iters). It's deliberately
// slow, so derive shared vaults once and reuse them across the suite.
const PW_A = "correct horse battery staple";
const PW_B = "a-completely-different-password";

let vaultA: Awaited<ReturnType<typeof deriveVault>>;
let vaultA2: Awaited<ReturnType<typeof deriveVault>>;
let vaultB: Awaited<ReturnType<typeof deriveVault>>;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("deriveVault", () => {
  beforeEach(async () => {
    vaultA ??= await deriveVault(PW_A);
    vaultA2 ??= await deriveVault(PW_A);
    vaultB ??= await deriveVault(PW_B);
  }, 30_000);

  it("derives a 64-char lowercase-hex blobId", () => {
    expect(vaultA.blobId).toMatch(/^[0-9a-f]{64}$/);
  });

  it("derives a 32-byte encryption key", () => {
    expect(vaultA.encKeyBytes).toBeInstanceOf(Uint8Array);
    expect(vaultA.encKeyBytes.byteLength).toBe(32);
  });

  it("derives a 64-char lowercase-hex writeToken", () => {
    expect(vaultA.writeToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic — the same password yields the same blobId, key bytes, and writeToken", () => {
    expect(vaultA2.blobId).toBe(vaultA.blobId);
    expect([...vaultA2.encKeyBytes]).toEqual([...vaultA.encKeyBytes]);
    expect(vaultA2.writeToken).toBe(vaultA.writeToken);
  });

  it("maps different passwords to different blobIds, keys, and writeTokens", () => {
    expect(vaultB.blobId).not.toBe(vaultA.blobId);
    expect([...vaultB.encKeyBytes]).not.toEqual([...vaultA.encKeyBytes]);
    expect(vaultB.writeToken).not.toBe(vaultA.writeToken);
  });

  it("domain-separates the three derivations (blobId, key, writeToken all differ)", () => {
    const keyHex = [...vaultA.encKeyBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    expect(vaultA.blobId).not.toBe(keyHex);
    // writeToken must be independent of both the blobId and the encryption key —
    // otherwise it would leak the key or be guessable from the (bearer) blobId.
    expect(vaultA.writeToken).not.toBe(vaultA.blobId);
    expect(vaultA.writeToken).not.toBe(keyHex);
  });

  it("exposes a non-extractable AES-GCM CryptoKey", () => {
    expect(vaultA.key).toBeInstanceOf(CryptoKey);
    expect(vaultA.key.extractable).toBe(false);
    expect(vaultA.key.type).toBe("secret");
    expect(vaultA.key.algorithm.name).toBe("AES-GCM");
  });
});

describe("encryptJSON / decryptJSON", () => {
  it("round-trips an arbitrary JSON value", async () => {
    const value = { a: 1, b: "two", c: [3, 4, { d: true }], e: null };
    const ct = await encryptJSON(vaultA.key, value);
    const back = await decryptJSON<typeof value>(vaultA.key, ct);
    expect(back).toEqual(value);
  });

  it("round-trips a full VaultData payload via decryptVault", async () => {
    const data: VaultData = {
      title: "My links",
      links: [
        { id: "1", url: "https://example.com", title: "Example", description: "d", image: "", createdAt: 1 },
        { id: "2", url: "https://test.org/x", title: "Test", description: "", image: "https://i/x.png", createdAt: 2 },
      ],
    };
    const ct = await encryptJSON(vaultA.key, data);
    expect(await decryptVault(vaultA.key, ct)).toEqual(data);
  });

  it("produces base64 output (iv || ciphertext)", async () => {
    const ct = await encryptJSON(vaultA.key, { x: 1 });
    expect(ct).toMatch(/^[A-Za-z0-9+/]+=*$/);
    // 12-byte IV + GCM tag means even the smallest payload is well over 16 bytes.
    expect(atob(ct).length).toBeGreaterThan(16);
  });

  it("is non-deterministic — a random IV makes each ciphertext unique", async () => {
    const value = { same: "payload" };
    const a = await encryptJSON(vaultA.key, value);
    const b = await encryptJSON(vaultA.key, value);
    expect(a).not.toBe(b);
    expect(await decryptJSON(vaultA.key, a)).toEqual(value);
    expect(await decryptJSON(vaultA.key, b)).toEqual(value);
  });

  it("round-trips a large, highly compressible payload", async () => {
    const links = Array.from({ length: 500 }, (_, i) => ({
      id: String(i),
      url: `https://example.com/path/${i}`,
      title: "Repeated title ".repeat(5),
      description: "Repeated description ".repeat(10),
      image: "",
      createdAt: i,
    }));
    const data: VaultData = { title: "big", links };
    const ct = await encryptJSON(vaultA.key, data);
    // gzip should keep the blob far smaller than the raw JSON of repetitive text.
    expect(atob(ct).length).toBeLessThan(JSON.stringify(data).length);
    expect(await decryptVault(vaultA.key, ct)).toEqual(data);
  });

  it("round-trips unicode content intact", async () => {
    const value = { t: "héllo 世界 🌍 один момент" };
    const ct = await encryptJSON(vaultA.key, value);
    expect(await decryptJSON(vaultA.key, ct)).toEqual(value);
  });

  it("fails authentication when decrypted with the wrong key", async () => {
    const ct = await encryptJSON(vaultA.key, { secret: true });
    await expect(decryptJSON(vaultB.key, ct)).rejects.toBeInstanceOf(Error);
  });

  it("fails when the ciphertext is tampered with", async () => {
    const ct = await encryptJSON(vaultA.key, { secret: true });
    // Flip a byte well past the IV, re-encode, and expect the GCM tag to reject it.
    const bytes = Uint8Array.from(atob(ct), (c) => c.charCodeAt(0));
    bytes[bytes.length - 1] ^= 0xff;
    const tampered = btoa(String.fromCharCode(...bytes));
    await expect(decryptJSON(vaultA.key, tampered)).rejects.toBeInstanceOf(Error);
  });
});

describe("session persistence", () => {
  it("returns null when nothing is stored", async () => {
    expect(await loadSession()).toBeNull();
  });

  it("saves and reconstructs a working key and writeToken from the raw bytes", async () => {
    saveSession(vaultA.blobId, vaultA.encKeyBytes, vaultA.writeToken, "redis");

    const session = await loadSession();
    expect(session).not.toBeNull();
    expect(session!.blobId).toBe(vaultA.blobId);
    expect(session!.writeToken).toBe(vaultA.writeToken);

    // The reconstructed key must decrypt data sealed by the original derived key.
    const ct = await encryptJSON(vaultA.key, { proof: "of-work" });
    expect(await decryptJSON(session!.key, ct)).toEqual({ proof: "of-work" });
  });

  it("persists and restores the chosen backend", async () => {
    saveSession(vaultA.blobId, vaultA.encKeyBytes, vaultA.writeToken, "local");
    expect((await loadSession())!.backend).toBe("local");
  });

  it("defaults to the redis backend for an older session with no stored backend", async () => {
    saveSession(vaultA.blobId, vaultA.encKeyBytes, vaultA.writeToken, "local");
    sessionStorage.removeItem("blinks.backend");
    expect((await loadSession())!.backend).toBe("redis");
  });

  it("stores the key as hex, never the JWK/exportable form", () => {
    saveSession(vaultA.blobId, vaultA.encKeyBytes, vaultA.writeToken, "redis");
    const stored = sessionStorage.getItem("blinks.encKey");
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
  });

  it("clearSession removes all stored fields", async () => {
    saveSession(vaultA.blobId, vaultA.encKeyBytes, vaultA.writeToken, "redis");
    clearSession();
    expect(sessionStorage.getItem("blinks.blobId")).toBeNull();
    expect(sessionStorage.getItem("blinks.encKey")).toBeNull();
    expect(sessionStorage.getItem("blinks.writeToken")).toBeNull();
    expect(sessionStorage.getItem("blinks.backend")).toBeNull();
    expect(await loadSession()).toBeNull();
  });

  it("returns null (and clears) when any field is missing", async () => {
    sessionStorage.setItem("blinks.blobId", vaultA.blobId);
    expect(await loadSession()).toBeNull();

    // blobId + key but no writeToken must also fail closed.
    sessionStorage.clear();
    saveSession(vaultA.blobId, vaultA.encKeyBytes, vaultA.writeToken, "redis");
    sessionStorage.removeItem("blinks.writeToken");
    expect(await loadSession()).toBeNull();
  });
});

describe("backend preference", () => {
  it("returns null when no preference has been saved", () => {
    expect(loadBackendPreference()).toBeNull();
  });

  it("round-trips a saved preference", () => {
    saveBackendPreference("local");
    expect(loadBackendPreference()).toBe("local");
    saveBackendPreference("redis");
    expect(loadBackendPreference()).toBe("redis");
  });

  it("ignores an unrecognized stored value", () => {
    localStorage.setItem("blinks.backend.pref", "sqlite");
    expect(loadBackendPreference()).toBeNull();
  });

  it("persists independently of the session (survives clearSession)", () => {
    saveBackendPreference("local");
    clearSession();
    expect(loadBackendPreference()).toBe("local");
  });
});

describe("generatePassword", () => {
  const CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/~";

  it("defaults to 200 characters", () => {
    expect(generatePassword()).toHaveLength(200);
  });

  it("honours a custom length, including short and zero", () => {
    expect(generatePassword(1)).toHaveLength(1);
    expect(generatePassword(37)).toHaveLength(37);
    expect(generatePassword(0)).toHaveLength(0);
  });

  it("only emits characters from the documented charset", () => {
    const pw = generatePassword(500);
    for (const ch of pw) expect(CHARSET).toContain(ch);
  });

  it("is effectively unique across calls (CSPRNG-backed)", () => {
    const a = generatePassword();
    const b = generatePassword();
    expect(a).not.toBe(b);
  });

  it("draws from the CSPRNG via crypto.getRandomValues", () => {
    const spy = vi.spyOn(crypto, "getRandomValues");
    generatePassword(50);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("covers a broad slice of the charset over a long password", () => {
    const pw = generatePassword(4000);
    const distinct = new Set(pw).size;
    // With 4000 draws over ~90 symbols, nearly the whole set should appear.
    expect(distinct).toBeGreaterThan(70);
  });
});
