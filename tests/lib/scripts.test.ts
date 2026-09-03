import { describe, expect, it } from "vitest";
import { PUT_BLOB_CAS } from "@/lib/scripts";

// The CAS is a Lua string executed inside Redis (Upstash REST has no WATCH, so
// the script is the atomic unit). Running it for real needs an embedded Lua VM —
// a dependency the workspace's supply-chain policy rules out — so its two halves
// are covered elsewhere: the JS result-mapping in actions.test.ts (mocked eval),
// and the full decision table (token-before-version, CAS, first-write token
// adoption) in local-store.test.ts, which mirrors this exact logic.
//
// These tests guard the SCRIPT SOURCE itself, so a careless edit can't silently
// reorder the token/version checks or drop a stored field without failing.
const at = (needle: string) => PUT_BLOB_CAS.indexOf(needle);

describe("PUT_BLOB_CAS — Lua source invariants", () => {
  it("loads the stored token and current version up front", () => {
    expect(PUT_BLOB_CAS).toContain("local storedToken = redis.call('HGET', key, 't')");
    expect(PUT_BLOB_CAS).toContain("redis.call('HGET', key, 'v')");
    // A missing version defaults to 0 so a first write from expectedVersion 0 succeeds.
    expect(PUT_BLOB_CAS).toContain("or 0");
  });

  it("checks the write token BEFORE the version (unauthorized beats conflict)", () => {
    const tokenGuard = at("storedToken and storedToken ~= token");
    const versionGuard = at("current ~= expected");
    const unauthorized = at("return { 'unauthorized' }");

    expect(tokenGuard).toBeGreaterThan(-1);
    expect(versionGuard).toBeGreaterThan(-1);
    // Token guard (and its early return) must come before the version guard.
    expect(tokenGuard).toBeLessThan(versionGuard);
    expect(unauthorized).toBeGreaterThan(tokenGuard);
    expect(unauthorized).toBeLessThan(versionGuard);
  });

  it("only writes after both guards pass, and bumps the version", () => {
    const versionGuard = at("current ~= expected");
    const write = at("redis.call('HSET'");
    expect(write).toBeGreaterThan(versionGuard);
    expect(PUT_BLOB_CAS).toContain("local next = current + 1");
  });

  it("persists all three fields on write (ciphertext, version, token)", () => {
    expect(PUT_BLOB_CAS).toMatch(/HSET', key, 'c', ciphertext, 'v', next, 't', token/);
  });

  it("returns exactly the documented result tuples", () => {
    expect(PUT_BLOB_CAS).toContain("return { 'ok', next }");
    expect(PUT_BLOB_CAS).toContain("return { 'conflict', current, redis.call('HGET', key, 'c') }");
    expect(PUT_BLOB_CAS).toContain("return { 'unauthorized' }");
  });
});
