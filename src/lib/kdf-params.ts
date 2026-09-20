import type { IArgon2Options } from "hash-wasm";

// Argon2id cost, shared by the worker and the main-thread fallback. Above the
// server-side norm (it runs once per unlock, in one user's browser) but capped by
// how long a user will wait: raising these is the only lever on offline guessing.
export const ARGON2 = {
  parallelism: 1,
  iterations: 3,
  memorySize: 131_072, // KiB → 128 MiB
  // memorySize: 65_536, // KiB → 64 MiB
  hashLength: 32,
} as const satisfies Pick<IArgon2Options, "parallelism" | "iterations" | "memorySize" | "hashLength">;
