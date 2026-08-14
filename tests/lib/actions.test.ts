import { beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";

// Mock every server-only dependency so the actions run in isolation: no real
// Redis, no rate-limiter, no request headers, no network fetch.
const hget = vi.hoisted(() => vi.fn<(...args: string[]) => Promise<string | null>>());
const hgetall = vi.hoisted(() => vi.fn<(id: string) => Promise<Record<string, unknown> | null>>());
const evalScript = vi.hoisted(() => vi.fn<(script: string, keys: string[], args: unknown[]) => Promise<unknown>>());
const blobLimit = vi.hoisted(() => vi.fn<(key: string) => Promise<{ success: boolean }>>());
const metaLimit = vi.hoisted(() => vi.fn<(key: string) => Promise<{ success: boolean }>>());
const headersGet = vi.hoisted(() => vi.fn<(name: string) => string | null>());
const getLinkPreview = vi.hoisted(() => vi.fn<(url: string, opts?: unknown) => Promise<unknown>>());

vi.mock("@/lib/redis", () => ({
  redis: { hgetall, hget, eval: evalScript },
}));
vi.mock("@/lib/ratelimit", () => ({
  blobLimiter: { limit: blobLimit },
  metadataLimiter: { limit: metaLimit },
}));
vi.mock("next/headers", () => ({
  headers: async () => ({ get: headersGet }),
}));
vi.mock("link-preview-js", () => ({ getLinkPreview }));

const { getBlob, putBlob, fetchMetadata } = await import("@/lib/actions");

const VALID_ID = "a".repeat(64);

beforeEach(() => {
  vi.clearAllMocks();
  // Default: within limits, no IP header present.
  blobLimit.mockResolvedValue({ success: true });
  metaLimit.mockResolvedValue({ success: true });
  headersGet.mockReturnValue(null);
});

describe("getBlob", () => {
  it("returns null when the hash has no ciphertext", async () => {
    hgetall.mockResolvedValue(null);
    expect(await getBlob(VALID_ID)).toBeNull();

    hgetall.mockResolvedValue({ v: 2 });
    expect(await getBlob(VALID_ID)).toBeNull();
  });

  it("returns ciphertext and a numeric version", async () => {
    hgetall.mockResolvedValue({ c: "cipher", v: "5" });
    expect(await getBlob(VALID_ID)).toEqual({ ciphertext: "cipher", version: 5 });
  });

  it("rejects an invalid blobId before touching Redis", async () => {
    await expect(getBlob("not-hex")).rejects.toBeInstanceOf(ZodError);
    expect(hgetall).not.toHaveBeenCalled();
  });

  it("throws and short-circuits when rate-limited", async () => {
    blobLimit.mockResolvedValue({ success: false });
    await expect(getBlob(VALID_ID)).rejects.toThrow(/rate limit/i);
    expect(hgetall).not.toHaveBeenCalled();
  });

  it("derives the rate-limit key from the first forwarded IP", async () => {
    headersGet.mockImplementation((name: string) =>
      name === "x-vercel-forwarded-for" ? "203.0.113.5, 70.0.0.1" : null,
    );
    hgetall.mockResolvedValue({ c: "x", v: 1 });
    await getBlob(VALID_ID);
    expect(blobLimit).toHaveBeenCalledWith("203.0.113.5");
  });
});

describe("putBlob", () => {
  const CIPHERTEXT = "A".repeat(40);
  const TOKEN = "b".repeat(64);
  const input = { blobId: VALID_ID, ciphertext: CIPHERTEXT, expectedVersion: 3, writeToken: TOKEN };

  it("maps an ok CAS result to the new version and forwards the write token", async () => {
    evalScript.mockResolvedValue(["ok", 4]);
    expect(await putBlob(input)).toEqual({ version: 4 });
    // The write token is passed to the Lua script as the third arg (proof of possession).
    expect(evalScript).toHaveBeenCalledWith(expect.any(String), [`blinks:blob:${VALID_ID}`], [CIPHERTEXT, 3, TOKEN]);
  });

  it("maps a conflict with current data to a conflict result", async () => {
    evalScript.mockResolvedValue(["conflict", 7, "other-cipher"]);
    expect(await putBlob(input)).toEqual({
      conflict: true,
      current: { ciphertext: "other-cipher", version: 7 },
    });
  });

  it("maps a conflict with no stored blob to current: null", async () => {
    evalScript.mockResolvedValue(["conflict", 0, null]);
    expect(await putBlob(input)).toEqual({ conflict: true, current: null });
  });

  it("throws (never silently succeeds) when the write token is rejected", async () => {
    evalScript.mockResolvedValue(["unauthorized"]);
    await expect(putBlob(input)).rejects.toThrow(/not authorized/i);
  });

  it("rejects invalid input before touching Redis", async () => {
    await expect(putBlob({ ...input, blobId: "bad" })).rejects.toBeInstanceOf(ZodError);
    await expect(putBlob({ ...input, expectedVersion: -1 })).rejects.toBeInstanceOf(ZodError);
    await expect(putBlob({ ...input, ciphertext: "short" })).rejects.toBeInstanceOf(ZodError);
    await expect(putBlob({ ...input, writeToken: "bad" })).rejects.toBeInstanceOf(ZodError);
    expect(evalScript).not.toHaveBeenCalled();
  });

  it("throws when rate-limited", async () => {
    blobLimit.mockResolvedValue({ success: false });
    await expect(putBlob(input)).rejects.toThrow(/rate limit/i);
    expect(evalScript).not.toHaveBeenCalled();
  });
});

describe("fetchMetadata", () => {
  it("returns title, description, and first image from the preview", async () => {
    getLinkPreview.mockResolvedValue({
      title: "Real Title",
      description: "A description",
      images: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
    });
    expect(await fetchMetadata("https://example.com/post")).toEqual({
      title: "Real Title",
      description: "A description",
      image: "https://cdn.example/a.png",
    });
  });

  it("passes the SSRF resolver to link-preview-js", async () => {
    getLinkPreview.mockResolvedValue({ title: "t", description: "", images: [] });
    await fetchMetadata("https://example.com");
    expect(getLinkPreview).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ resolveDNSHost: expect.any(Function) }),
    );
  });

  it("uses manual redirects so every hop is re-validated by the SSRF gate", async () => {
    // "follow" lets an http target 302 into the private network without re-checking;
    // "manual" + handleRedirects makes link-preview-js re-run resolveDNSHost per hop.
    getLinkPreview.mockResolvedValue({ title: "t", description: "", images: [] });
    await fetchMetadata("https://example.com");
    expect(getLinkPreview).toHaveBeenCalledWith(
      "https://example.com",
      expect.objectContaining({ followRedirects: "manual", handleRedirects: expect.any(Function) }),
    );
  });

  it("falls back to the hostname on a bot-challenge interstitial title", async () => {
    getLinkPreview.mockResolvedValue({ title: "Just a moment...", description: "x", images: ["https://i/x"] });
    expect(await fetchMetadata("https://www.protected.com/x")).toEqual({
      title: "protected.com",
      description: "",
      image: "",
    });
  });

  it("falls back to the hostname when there is no title", async () => {
    getLinkPreview.mockResolvedValue({ description: "", images: [] });
    expect(await fetchMetadata("https://www.example.com/x")).toEqual({
      title: "example.com",
      description: "",
      image: "",
    });
  });

  it("degrades to the hostname when the fetch throws (blocked/timeout)", async () => {
    getLinkPreview.mockRejectedValue(new Error("blocked"));
    const meta = await fetchMetadata("https://example.org/page");
    expect(meta).toEqual({ title: "example.org", description: "", image: "" });
  });

  it("rejects a non-URL input before fetching", async () => {
    await expect(fetchMetadata("not a url")).rejects.toBeInstanceOf(ZodError);
    expect(getLinkPreview).not.toHaveBeenCalled();
  });

  it("throws when the metadata limiter is exhausted", async () => {
    metaLimit.mockResolvedValue({ success: false });
    await expect(fetchMetadata("https://example.com")).rejects.toThrow(/rate limit/i);
    expect(getLinkPreview).not.toHaveBeenCalled();
  });
});
