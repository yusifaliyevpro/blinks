// Client-side, zero-knowledge crypto — never runs on the server.
//
//   password ──Argon2id──▶ master ──HKDF(info=enc)───▶ AES-GCM key (encKey)
//                                ├──HKDF(info=id)────▶ blobId (Redis key)
//                                └──HKDF(info=write)─▶ writeToken (write auth)
//
// One Argon2id pass, three HKDF-SHA256 outputs (distinct `info` labels). A wrong
// password yields a wrong blobId (Redis miss) or fails AES-GCM auth. `writeToken`
// is an independent secret (can't decrypt anything) that proves password
// possession to the server so a leaked blobId alone can't overwrite the vault.

import { argon2id } from "hash-wasm";
import { clientEnv } from "./env.client";
import type { StorageBackend, VaultData } from "./types";

const te = new TextEncoder();
const td = new TextDecoder();

// Argon2id: 64 MiB / 3 iterations / 1 lane. Runs once per unlock.
const KDF = {
  parallelism: 1,
  iterations: 3,
  memorySize: 65_536, // KiB → 64 MiB
  hashLength: 32,
} as const;

const ENC_INFO = te.encode("blinks:enc-key:v1");
const ID_INFO = te.encode("blinks:blob-id:v1");
const WRITE_INFO = te.encode("blinks:write-token:v1");

const IV_BYTES = 12;

const SS_ID = "blinks.blobId";
const SS_KEY = "blinks.encKey";
const SS_WRITE = "blinks.writeToken";
const SS_BACKEND = "blinks.backend";

export type Session = {
  blobId: string;
  key: CryptoKey;
  writeToken: string;
  backend: StorageBackend;
};

// The raw derivation output. `backend` is a runtime choice (not derived), so it's
// added when the Session is assembled at unlock, not here.
export type Vault = {
  blobId: string;
  key: CryptoKey;
  writeToken: string;
  encKeyBytes: Uint8Array;
};

function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toBase64(bytes: Uint8Array): string {
  let s = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(s);
}

function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Copy into a fresh ArrayBuffer-backed view so WebCrypto's BufferSource type fits.
function ab(view: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy;
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", ab(data)));
}

async function hkdf(master: CryptoKey, salt: Uint8Array, info: Uint8Array, bits: number): Promise<Uint8Array> {
  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: ab(salt), info: ab(info) },
    master,
    bits,
  );
  return new Uint8Array(derived);
}

// Non-extractable: the key can't be read back out. Session persistence stores
// the raw derived bytes we already hold, not an export of this key.
async function importAesKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", ab(raw), { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function deriveVault(password: string): Promise<Vault> {
  const argonSalt = await sha256(te.encode(clientEnv.NEXT_PUBLIC_KDF_SALT));

  const masterBytes = await argon2id({
    password,
    salt: argonSalt,
    ...KDF,
    outputType: "binary",
  });

  const master = await crypto.subtle.importKey("raw", ab(masterBytes), "HKDF", false, ["deriveBits"]);

  // Independent derivations from the same key — race, don't waterfall.
  const [encKeyBytes, blobIdBytes, writeTokenBytes] = await Promise.all([
    hkdf(master, argonSalt, ENC_INFO, 256),
    hkdf(master, argonSalt, ID_INFO, 256),
    hkdf(master, argonSalt, WRITE_INFO, 256),
  ]);

  const key = await importAesKey(encKeyBytes);
  return { blobId: toHex(blobIdBytes), key, writeToken: toHex(writeTokenBytes), encKeyBytes };
}

// gzip before encrypting (URLs/text compress well) — same single-blob model.
async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([ab(bytes)]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([ab(bytes)]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export async function encryptJSON(key: CryptoKey, value: unknown): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const data = await compress(te.encode(JSON.stringify(value)));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, ab(data)));
  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);
  return toBase64(packed);
}

export async function decryptVault(key: CryptoKey, ciphertext: string): Promise<VaultData> {
  return decryptJSON<VaultData>(key, ciphertext);
}

export async function decryptJSON<T>(key: CryptoKey, ciphertext: string): Promise<T> {
  const packed = fromBase64(ciphertext);
  const iv = packed.subarray(0, IV_BYTES);
  const ct = packed.subarray(IV_BYTES);
  const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: ab(iv) }, key, ab(ct)));
  const json = td.decode(await decompress(plain));
  // Caller declares the shape it stored under this key.
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return JSON.parse(json) as T;
}

// --- Session persistence (sessionStorage: survives refresh, clears on close) ---

export function saveSession(
  blobId: string,
  encKeyBytes: Uint8Array,
  writeToken: string,
  backend: StorageBackend,
): void {
  sessionStorage.setItem(SS_ID, blobId);
  sessionStorage.setItem(SS_KEY, toHex(encKeyBytes));
  sessionStorage.setItem(SS_WRITE, writeToken);
  sessionStorage.setItem(SS_BACKEND, backend);
}

export async function loadSession(): Promise<Session | null> {
  const blobId = sessionStorage.getItem(SS_ID);
  const keyHex = sessionStorage.getItem(SS_KEY);
  const writeToken = sessionStorage.getItem(SS_WRITE);
  if (!blobId || !keyHex || !writeToken) return null;
  // Older sessions predate the backend field — default to the remote store.
  const backend: StorageBackend = sessionStorage.getItem(SS_BACKEND) === "local" ? "local" : "redis";
  try {
    const key = await importAesKey(fromHex(keyHex));
    return { blobId, key, writeToken, backend };
  } catch {
    clearSession();
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SS_ID);
  sessionStorage.removeItem(SS_KEY);
  sessionStorage.removeItem(SS_WRITE);
  sessionStorage.removeItem(SS_BACKEND);
}

// --- Random password generator ---

const PASSWORD_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+[]{}|;:,.<>?/~";

// CSPRNG-backed, uniform over the charset via rejection sampling (no modulo bias).
export function generatePassword(length = 200): string {
  const chars = PASSWORD_CHARSET;
  const n = chars.length;
  const limit = Math.floor(0x1_0000_0000 / n) * n; // largest unbiased uint32
  const out: string[] = [];
  const buf = new Uint32Array(256);

  while (out.length < length) {
    crypto.getRandomValues(buf);
    for (let i = 0; i < buf.length && out.length < length; i++) {
      const v = buf[i];
      if (v < limit) out.push(chars[v % n]);
    }
  }
  return out.join("");
}
