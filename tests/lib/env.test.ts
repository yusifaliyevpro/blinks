import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `redisAvailable` is derived at module load from the REST credentials, and it
// drives the whole backend picker (false → Local is the only option). env.server
// parses process.env on import, so reset the module registry and re-import for
// each combination. NEXT_PUBLIC_KDF_SALT is always present (vitest config).
const URL_KEY = "KV_REST_API_URL";
const TOKEN_KEY = "KV_REST_API_TOKEN";

let savedUrl: string | undefined;
let savedToken: string | undefined;

async function loadRedisAvailable(url?: string, token?: string): Promise<boolean> {
  if (url === undefined) delete process.env[URL_KEY];
  else process.env[URL_KEY] = url;
  if (token === undefined) delete process.env[TOKEN_KEY];
  else process.env[TOKEN_KEY] = token;

  vi.resetModules();
  return (await import("@/lib/env.server")).redisAvailable;
}

beforeEach(() => {
  savedUrl = process.env[URL_KEY];
  savedToken = process.env[TOKEN_KEY];
});

afterEach(() => {
  if (savedUrl === undefined) delete process.env[URL_KEY];
  else process.env[URL_KEY] = savedUrl;
  if (savedToken === undefined) delete process.env[TOKEN_KEY];
  else process.env[TOKEN_KEY] = savedToken;
});

describe("redisAvailable", () => {
  it("is true only when both REST credentials are set", async () => {
    expect(await loadRedisAvailable("https://x.upstash.io", "tok")).toBe(true);
  });

  it("is false when only the URL is set", async () => {
    expect(await loadRedisAvailable("https://x.upstash.io", undefined)).toBe(false);
  });

  it("is false when only the token is set", async () => {
    expect(await loadRedisAvailable(undefined, "tok")).toBe(false);
  });

  it("is false when neither is set (local-only deployment)", async () => {
    expect(await loadRedisAvailable(undefined, undefined)).toBe(false);
  });
});
