import z from "zod";

// blobId is 32 bytes, hex-encoded → 64 lowercase hex chars.
export const blobIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

// writeToken is 32 bytes, hex-encoded → 64 lowercase hex chars (same shape as
// blobId, independent derivation). Proves password possession for writes.
export const writeTokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

// base64(iv || ciphertext). Constrained to the base64 alphabet (+ padding) and a
// realistic minimum length (12-byte IV + 16-byte GCM tag alone base64s well past
// 20 chars) so obviously-malformed writes are rejected before Redis. Capped to
// keep a single blob sane.
export const ciphertextSchema = z
  .string()
  .min(20)
  .max(3_000_000)
  .regex(/^[A-Za-z0-9+/]+={0,2}$/);

export const versionSchema = z.number().int().min(0);

export const urlSchema = z.url().max(2048);

export const putBlobSchema = z.object({
  blobId: blobIdSchema,
  ciphertext: ciphertextSchema,
  expectedVersion: versionSchema,
  writeToken: writeTokenSchema,
});

export type PutBlobInput = z.infer<typeof putBlobSchema>;
