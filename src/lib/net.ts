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
  if (a === 192 && b === 0 && c === 0) return true;
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function isPrivateV6(ip: string): boolean {
  const a = ip.toLowerCase();
  if (a === "::1" || a === "::") return true;
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // ULA
  if (a.startsWith("fe8") || a.startsWith("fe9") || a.startsWith("fea") || a.startsWith("feb")) {
    return true; // link-local
  }
  const mapped = a.match(/::ffff:(\d+\.\d+\.\d+\.\d+)/); // IPv4-mapped
  if (mapped) return isPrivateV4(mapped[1]);
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
