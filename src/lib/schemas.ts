import * as z from "zod/mini";

// blobId is 32 bytes, hex-encoded → 64 lowercase hex chars.
export const blobIdSchema = z.compile(z.string().check(z.regex(/^[0-9a-f]{64}$/)));

// writeToken is 32 bytes, hex-encoded → 64 lowercase hex chars (same shape as
// blobId, independent derivation). Proves password possession for writes.
export const writeTokenSchema = z.string().check(z.regex(/^[0-9a-f]{64}$/));

// base64(iv || ciphertext), validated as real base64 by zod. Floored at a
// realistic minimum (a 12-byte IV + 16-byte GCM tag alone base64s well past 20
// chars) and capped to keep a single blob sane.
export const ciphertextSchema = z.base64().check(z.minLength(20), z.maxLength(3_000_000));

export const versionSchema = z.int().check(z.minimum(0));

export const urlSchema = z.compile(z.url().check(z.maxLength(2048)));

export const putBlobSchema = z.compile(
  z.object({
    blobId: blobIdSchema,
    ciphertext: ciphertextSchema,
    expectedVersion: versionSchema,
    writeToken: writeTokenSchema,
  }),
);
