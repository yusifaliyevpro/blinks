import { describe, expect, it } from "vitest";
import {
  blobIdSchema,
  ciphertextSchema,
  putBlobSchema,
  urlSchema,
  versionSchema,
  writeTokenSchema,
} from "@/lib/schemas";

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
  it("accepts base64 (with optional padding) within the cap", () => {
    expect(ciphertextSchema.safeParse("A".repeat(40)).success).toBe(true);
    expect(ciphertextSchema.safeParse(`${"A".repeat(22)}==`).success).toBe(true);
    expect(ciphertextSchema.safeParse(`${"AB+/".repeat(6)}`).success).toBe(true);
    expect(ciphertextSchema.safeParse("a".repeat(3_000_000)).success).toBe(true);
  });

  it("rejects an empty or too-short string", () => {
    expect(ciphertextSchema.safeParse("").success).toBe(false);
    expect(ciphertextSchema.safeParse("x").success).toBe(false);
    expect(ciphertextSchema.safeParse("A".repeat(19)).success).toBe(false);
  });

  it("rejects strings outside the base64 alphabet", () => {
    // Spaces, control chars, and other punctuation must not slip through.
    expect(ciphertextSchema.safeParse(`${"A".repeat(20)} `).success).toBe(false);
    expect(ciphertextSchema.safeParse(`not-base64-${"A".repeat(20)}`).success).toBe(false);
    expect(ciphertextSchema.safeParse(`<script>${"A".repeat(20)}`).success).toBe(false);
    expect(ciphertextSchema.safeParse(`=${"A".repeat(20)}`).success).toBe(false);
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

describe("writeTokenSchema", () => {
  it("accepts exactly 64 lowercase hex chars", () => {
    expect(writeTokenSchema.safeParse("a".repeat(64)).success).toBe(true);
    expect(writeTokenSchema.safeParse("0123456789abcdef".repeat(4)).success).toBe(true);
  });

  it("rejects the wrong length, uppercase, and non-hex", () => {
    expect(writeTokenSchema.safeParse("a".repeat(63)).success).toBe(false);
    expect(writeTokenSchema.safeParse("A".repeat(64)).success).toBe(false);
    expect(writeTokenSchema.safeParse("g".repeat(64)).success).toBe(false);
    expect(writeTokenSchema.safeParse("").success).toBe(false);
  });
});

describe("putBlobSchema", () => {
  const valid = {
    blobId: "a".repeat(64),
    ciphertext: "A".repeat(40),
    expectedVersion: 3,
    writeToken: "b".repeat(64),
  };

  it("accepts a well-formed input and infers the shape", () => {
    const parsed = putBlobSchema.parse(valid);
    expect(parsed).toEqual(valid);
  });

  it("rejects when any field is invalid", () => {
    expect(putBlobSchema.safeParse({ ...valid, blobId: "short" }).success).toBe(false);
    expect(putBlobSchema.safeParse({ ...valid, ciphertext: "" }).success).toBe(false);
    expect(putBlobSchema.safeParse({ ...valid, expectedVersion: -1 }).success).toBe(false);
    expect(putBlobSchema.safeParse({ ...valid, writeToken: "nope" }).success).toBe(false);
  });

  it("rejects missing fields, including the write token", () => {
    expect(putBlobSchema.safeParse({ blobId: valid.blobId }).success).toBe(false);
    const { writeToken: _omit, ...noToken } = valid;
    expect(putBlobSchema.safeParse(noToken).success).toBe(false);
  });
});
