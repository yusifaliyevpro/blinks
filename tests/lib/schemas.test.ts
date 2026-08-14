import { describe, expect, it } from "vitest";
import { blobIdSchema, ciphertextSchema, putBlobSchema, urlSchema, versionSchema } from "@/lib/schemas";

describe("blobIdSchema", () => {
  it("accepts exactly 64 lowercase hex chars", () => {
    expect(blobIdSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(blobIdSchema.safeParse("0123456789abcdef".repeat(4)).success).toBe(true);
  });

  it("rejects the wrong length", () => {
    expect(blobIdSchema.safeParse("a".repeat(63)).success).toBe(false);
    expect(blobIdSchema.safeParse("a".repeat(65)).success).toBe(false);
    expect(blobIdSchema.safeParse("").success).toBe(false);
  });

  it("rejects uppercase and non-hex characters", () => {
    expect(blobIdSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(blobIdSchema.safeParse("g".repeat(64)).success).toBe(false);
    expect(blobIdSchema.safeParse(`${"a".repeat(63)} `).success).toBe(false);
  });
});

describe("ciphertextSchema", () => {
  it("accepts a non-empty string within the cap", () => {
    expect(ciphertextSchema.safeParse("x").success).toBe(true);
    expect(ciphertextSchema.safeParse("a".repeat(3_000_000)).success).toBe(true);
  });

  it("rejects an empty string", () => {
    expect(ciphertextSchema.safeParse("").success).toBe(false);
  });

  it("rejects a string over the 3,000,000-char cap", () => {
    expect(ciphertextSchema.safeParse("a".repeat(3_000_001)).success).toBe(false);
  });
});

describe("versionSchema", () => {
  it("accepts non-negative integers", () => {
    expect(versionSchema.safeParse(0).success).toBe(true);
    expect(versionSchema.safeParse(42).success).toBe(true);
  });

  it("rejects negatives, floats, and non-numbers", () => {
    expect(versionSchema.safeParse(-1).success).toBe(false);
    expect(versionSchema.safeParse(1.5).success).toBe(false);
    expect(versionSchema.safeParse("3").success).toBe(false);
  });
});

describe("urlSchema", () => {
  it("accepts valid URLs up to 2048 chars", () => {
    expect(urlSchema.safeParse("https://example.com").success).toBe(true);
    expect(urlSchema.safeParse(`https://example.com/${"a".repeat(2020)}`).success).toBe(true);
  });

  it("rejects non-URLs and over-long URLs", () => {
    expect(urlSchema.safeParse("not-a-url").success).toBe(false);
    expect(urlSchema.safeParse(`https://example.com/${"a".repeat(2048)}`).success).toBe(false);
  });
});

describe("putBlobSchema", () => {
  const valid = {
    blobId: "a".repeat(64),
    ciphertext: "cipher",
    expectedVersion: 3,
  };

  it("accepts a well-formed input and infers the shape", () => {
    const parsed = putBlobSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it("rejects when any field is invalid", () => {
    expect(putBlobSchema.safeParse({ ...valid, blobId: "short" }).success).toBe(false);
    expect(putBlobSchema.safeParse({ ...valid, ciphertext: "" }).success).toBe(false);
    expect(putBlobSchema.safeParse({ ...valid, expectedVersion: -1 }).success).toBe(false);
  });

  it("rejects missing fields", () => {
    expect(putBlobSchema.safeParse({ blobId: valid.blobId }).success).toBe(false);
  });
});
