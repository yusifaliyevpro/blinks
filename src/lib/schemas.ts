import z from "zod";

// blobId is 32 bytes, hex-encoded → 64 lowercase hex chars.
export const blobIdSchema = z.string().regex(/^[0-9a-f]{64}$/);

// base64(iv || ciphertext). Capped to keep a single blob sane.
export const ciphertextSchema = z.string().min(1).max(3_000_000);

export const versionSchema = z.number().int().min(0);

export const urlSchema = z.url().max(2048);

export const putBlobSchema = z.object({
  blobId: blobIdSchema,
  ciphertext: ciphertextSchema,
  expectedVersion: versionSchema,
});

export type PutBlobInput = z.infer<typeof putBlobSchema>;
