import { beforeEach, describe, expect, it, vi } from "vitest";

// A local-only deployment configures no Redis. `redis` and the rate limiters are
// null, so the blob actions must refuse rather than dereference null, while
// fetchMetadata still works (rate limiting simply becomes a no-op).
const headersGet = vi.hoisted(() => vi.fn<(name: string) => string | null>());
const getLinkPreview = vi.hoisted(() => vi.fn<(url: string, opts?: unknown) => Promise<unknown>>());

vi.mock("@/lib/redis", () => ({ redis: null }));
vi.mock("@/lib/ratelimit", () => ({ blobLimiter: null, metadataLimiter: null }));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: headersGet }),
}));
vi.mock("link-preview-js", () => ({ getLinkPreview }));

const { getBlob, putBlob, fetchMetadata } = await import("@/lib/actions");

const VALID_ID = "a".repeat(64);
const VALID_PUT = { blobId: VALID_ID, ciphertext: "A".repeat(40), expectedVersion: 0, writeToken: "b".repeat(64) };

beforeEach(() => {
  vi.clearAllMocks();
  headersGet.mockReturnValue(null);
});

describe("blob actions without Redis", () => {
  it("getBlob refuses when remote storage is not configured", async () => {
    await expect(getBlob(VALID_ID)).rejects.toThrow(/not configured/i);
  });

  it("putBlob refuses when remote storage is not configured", async () => {
    await expect(putBlob(VALID_PUT)).rejects.toThrow(/not configured/i);
  });
});

describe("fetchMetadata without Redis", () => {
  it("still resolves metadata with rate limiting disabled", async () => {
    getLinkPreview.mockResolvedValue({ title: "Hello", description: "World", images: ["img"] });
    expect(await fetchMetadata("https://example.com")).toEqual({
      title: "Hello",
      description: "World",
      image: "img",
    });
  });
});
