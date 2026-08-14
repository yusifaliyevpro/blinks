// SSRF guard for server-side metadata fetching. `resolvePublicHost` is
// link-preview-js's `resolveDNSHost` callback: it throws if the host resolves to
// a private/loopback/link-local/reserved range, blocking the request. No logging.

import { lookup } from "node:dns/promises";

export const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

function isPrivateV4(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // malformed → treat as unsafe
  }
  const [a, b, c] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 192 && b === 0 && c === 0) return true; // IETF protocol assignments
  if (a === 192 && b === 0 && c === 2) return true; // TEST-NET-1 (documentation)
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast / reserved
  return false;
}

// A pair of 16-bit hextets → dotted IPv4 (for the IPv4 embedded in the low 32 bits).
function hextetsToV4(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

// Expand an IPv6 string (with optional `::` compression and a trailing embedded
// IPv4) into exactly eight 16-bit groups, so range checks are numeric and exact
// instead of prefix-string guesses. Returns null on anything malformed.
function expandV6(ip: string): number[] | null {
  let s = ip.toLowerCase().trim();
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone); // drop any scope/zone id

  // Fold a trailing dotted IPv4 (::ffff:1.2.3.4, 64:ff9b::1.2.3.4) into two hextets.
  const v4 = s.match(/^(.*:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (v4) {
    const p = v4[2].split(".").map(Number);
    if (p.some((n) => Number.isNaN(n) || n > 255)) return null;
    s = `${v4[1]}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 ? (halves[1] ? halves[1].split(":") : []) : [];
  if (halves.length === 1 && head.length !== 8) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  const groups = halves.length === 2 ? [...head, ...Array<string>(missing).fill("0"), ...tail] : head;

  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(Number.parseInt(g, 16));
  }
  return out.length === 8 ? out : null;
}

function isPrivateV6(ip: string): boolean {
  const g = expandV6(ip);
  if (!g) return true; // unparseable → treat as unsafe
  const [g0, g1] = g;

  if (g.every((h) => h === 0)) return true; // :: unspecified
  if (g.slice(0, 7).every((h) => h === 0) && g[7] === 1) return true; // ::1 loopback
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast
  if (g0 === 0x0100 && g1 === 0 && g[2] === 0 && g[3] === 0) return true; // 100::/64 discard-only
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // 2001:db8::/32 documentation
  if (g0 === 0x2001 && g1 <= 0x01ff) return true; // 2001::/23 IETF protocol (incl. Teredo, ORCHID)
  if (g0 === 0x64 && g1 === 0xff9b) return true; // NAT64 well-known 64:ff9b::/96 (can embed anything)

  // 6to4 (2002::/16) embeds the IPv4 in the first two hextets after the prefix.
  if (g0 === 0x2002) return isPrivateV4(hextetsToV4(g1, g[2]));

  // IPv4-mapped (::ffff:0:0/96) and deprecated IPv4-compatible (::/96) — apply the
  // v4 policy to the embedded address in the low 32 bits.
  if (g0 === 0 && g1 === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && (g[5] === 0 || g[5] === 0xffff)) {
    return isPrivateV4(hextetsToV4(g[6], g[7]));
  }

  return false;
}

function isPrivateAddr(address: string, family: number): boolean {
  return family === 6 ? isPrivateV6(address) : isPrivateV4(address);
}

export async function resolvePublicHost(rawUrl: string): Promise<string> {
  const { protocol, hostname, port } = new URL(rawUrl);
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("Unsupported protocol");
  }
  // Only the default web ports — a metadata fetcher has no reason to hit arbitrary
  // ports, and refusing them stops this action being used to port-scan public hosts.
  if (port !== "" && port !== "80" && port !== "443") {
    throw new Error("Blocked port");
  }
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) {
    throw new Error("Blocked host");
  }

  const addresses = await lookup(hostname, { all: true });
  if (addresses.length === 0) throw new Error("DNS resolution failed");
  for (const { address, family } of addresses) {
    if (isPrivateAddr(address, family)) throw new Error("Blocked address");
  }
  return addresses[0].address;
}
