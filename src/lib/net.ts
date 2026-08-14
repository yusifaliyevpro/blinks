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

// Two 16-bit hextets → dotted IPv4 (for IPv4-in-IPv6 embeddings).
function hextetsToV4(hi: string, lo: string): string {
  const h = Number.parseInt(hi, 16);
  const l = Number.parseInt(lo, 16);
  return `${h >> 8}.${h & 255}.${l >> 8}.${l & 255}`;
}

function isPrivateV6(ip: string): boolean {
  const a = ip.toLowerCase();
  if (a === "::1" || a === "::") return true;
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // ULA
  if (/^fe[89ab]/.test(a)) return true; // link-local fe80::/10
  if (a.startsWith("64:ff9b:")) return true; // NAT64 well-known prefix (can embed anything)

  // Embedded IPv4 written in dotted form (IPv4-mapped / -compatible / NAT64).
  const dotted = a.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
  if (dotted) return isPrivateV4(dotted[1]);

  // IPv4-mapped in hex form, e.g. ::ffff:7f00:1 (= 127.0.0.1).
  const mappedHex = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (mappedHex) return isPrivateV4(hextetsToV4(mappedHex[1], mappedHex[2]));

  // 6to4 (2002::/16) embeds the IPv4 in the first two hextets after the prefix.
  const sixToFour = a.match(/^2002:([0-9a-f]{1,4}):([0-9a-f]{1,4})/);
  if (sixToFour) return isPrivateV4(hextetsToV4(sixToFour[1], sixToFour[2]));

  return false;
}

function isPrivateAddr(address: string, family: number): boolean {
  return family === 6 ? isPrivateV6(address) : isPrivateV4(address);
}

export async function resolvePublicHost(rawUrl: string): Promise<string> {
  const { protocol, hostname } = new URL(rawUrl);
  if (protocol !== "http:" && protocol !== "https:") {
    throw new Error("Unsupported protocol");
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
