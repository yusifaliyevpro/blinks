import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock DNS so we control exactly which addresses a host "resolves" to. The SSRF
// guard's job is to reject private/loopback/link-local/reserved results.
const lookup = vi.hoisted(() =>
  vi.fn<(host: string, opts: unknown) => Promise<{ address: string; family: number }[]>>(),
);
vi.mock("node:dns/promises", () => ({ lookup }));

const { resolvePublicHost, USER_AGENT } = await import("@/lib/net");

type Addr = { address: string; family: number };
function resolvesTo(...addrs: Addr[]) {
  lookup.mockResolvedValueOnce(addrs);
}

beforeEach(() => {
  lookup.mockReset();
});

describe("resolvePublicHost — protocol and host gating", () => {
  it("rejects non-http(s) protocols before any DNS lookup", async () => {
    await expect(resolvePublicHost("ftp://example.com")).rejects.toThrow("Unsupported protocol");
    await expect(resolvePublicHost("file:///etc/passwd")).rejects.toThrow("Unsupported protocol");
    expect(lookup).not.toHaveBeenCalled();
  });

  it("blocks localhost and .local / .localhost suffixes without a lookup", async () => {
    await expect(resolvePublicHost("http://localhost/x")).rejects.toThrow("Blocked host");
    await expect(resolvePublicHost("http://foo.localhost/x")).rejects.toThrow("Blocked host");
    await expect(resolvePublicHost("http://printer.local/x")).rejects.toThrow("Blocked host");
    expect(lookup).not.toHaveBeenCalled();
  });
});

describe("resolvePublicHost — public addresses pass", () => {
  it("returns the first resolved address for a public host", async () => {
    resolvesTo({ address: "93.184.216.34", family: 4 });
    await expect(resolvePublicHost("https://example.com")).resolves.toBe("93.184.216.34");
  });

  it("accepts a routable IPv6 address", async () => {
    resolvesTo({ address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 });
    await expect(resolvePublicHost("https://example.com")).resolves.toMatch(/^2606:/);
  });
});

describe("resolvePublicHost — SSRF ranges are blocked (IPv4)", () => {
  it.each([
    ["loopback", "127.0.0.1"],
    ["this-network 0.x", "0.0.0.0"],
    ["private 10.x", "10.1.2.3"],
    ["cloud metadata / link-local", "169.254.169.254"],
    ["private 172.16-31", "172.20.10.1"],
    ["private 192.168", "192.168.1.1"],
    ["CGNAT 100.64", "100.100.0.1"],
    ["ietf 192.0.0", "192.0.0.8"],
    ["benchmark 198.18", "198.18.0.1"],
    ["multicast/reserved >=224", "224.0.0.1"],
  ])("blocks %s (%s)", async (_label, ip) => {
    resolvesTo({ address: ip, family: 4 });
    await expect(resolvePublicHost("https://evil.example")).rejects.toThrow("Blocked address");
  });

  it("blocks a host that resolves to multiple addresses if ANY is private", async () => {
    resolvesTo({ address: "93.184.216.34", family: 4 }, { address: "127.0.0.1", family: 4 });
    await expect(resolvePublicHost("https://mixed.example")).rejects.toThrow("Blocked address");
  });

  it("treats a malformed IPv4 result as unsafe", async () => {
    resolvesTo({ address: "999.1.1", family: 4 });
    await expect(resolvePublicHost("https://weird.example")).rejects.toThrow("Blocked address");
  });
});

describe("resolvePublicHost — SSRF ranges are blocked (IPv6)", () => {
  it.each([
    ["loopback ::1", "::1"],
    ["unspecified ::", "::"],
    ["ULA fc00", "fc00::1"],
    ["ULA fd00", "fd12:3456::1"],
    ["link-local fe80", "fe80::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
  ])("blocks %s (%s)", async (_label, ip) => {
    resolvesTo({ address: ip, family: 6 });
    await expect(resolvePublicHost("https://evil6.example")).rejects.toThrow("Blocked address");
  });
});

describe("resolvePublicHost — resolution failures", () => {
  it("throws when DNS returns no addresses", async () => {
    resolvesTo();
    await expect(resolvePublicHost("https://nxdomain.example")).rejects.toThrow("DNS resolution failed");
  });
});

describe("USER_AGENT", () => {
  it("is a plausible browser UA string", () => {
    expect(USER_AGENT).toMatch(/Mozilla\/5\.0/);
    expect(USER_AGENT).toMatch(/Chrome\//);
  });
});
