import * as z from "zod/mini";

const urlSchema = z.url();

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

// Accept a real link only: an http(s) URL with a dotted hostname (has a TLD), so
// bare words like "hello" — which normalize into a technically-valid
// https://hello — are rejected. The explicit protocol check is a hard XSS guard:
// `z.url()` accepts `javascript:`/`data:`/`vbscript:` (and a `javascript://a.b`
// form even has a dotted host), and this url is later rendered as an anchor
// `href`. Enforcing the scheme here means safety no longer depends solely on
// normalizeUrl prepending https:// upstream.
export function isValidLink(url: string): boolean {
  if (!urlSchema.safeParse(url).success) return false;
  try {
    const u = new URL(url);
    return (u.protocol === "https:" || u.protocol === "http:") && u.hostname.includes(".");
  } catch {
    return false;
  }
}

// Canonical form for matching an already-saved link: lowercased host, trailing
// slash dropped, so minor cosmetic differences still count as the same link.
export function canonicalKey(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.host.toLowerCase()}${u.pathname.replace(/\/$/, "")}${u.search}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Host + path, without protocol or trailing slash, for a compact URL line.
export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "");
    return u.hostname.replace(/^www\./, "") + path + u.search;
  } catch {
    return url;
  }
}
