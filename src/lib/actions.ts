"use server";

import { getLinkPreview } from "link-preview-js";
import { headers } from "next/headers";
import { resolvePublicHost, USER_AGENT } from "./net";
import { blobLimiter, metadataLimiter } from "./ratelimit";
import { redis } from "./redis";
import { blobIdSchema, putBlobSchema, urlSchema } from "./schemas";
import { PUT_BLOB_CAS, type CasResult } from "./scripts";
import type { GetBlobResult, LinkMetadata, PutBlobInput, PutBlobResult } from "./types";

// SECURITY (deployment assumption): rate limiting keys off the client IP taken
// from these forwarded headers, most-trusted first. On Vercel, `x-vercel-forwarded-for`
// is set by the platform and cannot be spoofed by the client, so it's authoritative.
// If you FORK and deploy elsewhere, `x-forwarded-for`/`x-real-ip` are client-spoofable
// unless your proxy overwrites them — meaning the per-IP rate limits can be trivially
// bypassed. Make sure your edge/proxy sets a trustworthy client-IP header and put it
// first in this list (or the limits are cosmetic).
const IP_HEADERS = ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] as const;

// Namespace the blob under `blinks:*` (like the rate-limit keys) so the vault can
// share a Redis DB with another project without colliding. Storage-only: the raw
// blobId still comes from the client's HKDF output; this only prefixes the key.
const blobKey = (id: string): string => `blinks:blob:${id}`;

async function clientIp(): Promise<string> {
  const h = await headers();
  for (const name of IP_HEADERS) {
    const value = h.get(name);
    if (value) return value.split(",")[0].trim();
  }
  return "0.0.0.0";
}

// Null limiter (Redis not configured) means nothing to rate-limit against — skip.
async function rateLimit(limiter: typeof blobLimiter): Promise<void> {
  if (!limiter) return;
  const { success } = await limiter.limit(await clientIp());
  if (!success) throw new Error("Rate limit exceeded. Try again shortly.");
}

export async function getBlob(blobId: string): Promise<GetBlobResult> {
  const id = blobIdSchema.parse(blobId);
  if (!redis) throw new Error("Remote storage is not configured.");
  await rateLimit(blobLimiter);

  const data = await redis.hgetall<{ c: string; v: number | string }>(blobKey(id));
  if (!data?.c) return null;
  return { ciphertext: data.c, version: Number(data.v) };
}

export async function putBlob(input: PutBlobInput): Promise<PutBlobResult> {
  const { blobId, ciphertext, expectedVersion, writeToken } = putBlobSchema.parse(input);
  if (!redis) throw new Error("Remote storage is not configured.");
  await rateLimit(blobLimiter);

  const result = await redis.eval(PUT_BLOB_CAS, [blobKey(blobId)], [ciphertext, expectedVersion, writeToken]);
  // Shape is fixed by PUT_BLOB_CAS (see scripts.ts).
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const cas = result as CasResult;

  // Wrong/absent write token for an existing blob — reject without leaking why.
  if (cas[0] === "unauthorized") throw new Error("Not authorized to write this vault.");
  if (cas[0] === "ok") return { version: cas[1] };

  const [, version, current] = cas;
  return {
    conflict: true,
    current: current ? { ciphertext: current, version } : null,
  };
}

function fallbackTitle(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// Bot-protection interstitials (Cloudflare, DDoS-Guard, …) serve junk titles
// like "Just a moment…" to datacenter IPs — detect so we don't store them.
const CHALLENGE_TITLE =
  /^(just a moment|attention required|access denied|checking your browser|verifying you are human|please wait|security check|are you a robot|ddos-guard|один момент)/i;

function looksLikeBotChallenge(title: string): boolean {
  return CHALLENGE_TITLE.test(title.trim());
}

export async function fetchMetadata(url: string): Promise<LinkMetadata> {
  const clean = urlSchema.parse(url);
  await rateLimit(metadataLimiter);

  try {
    // resolveDNSHost is the SSRF gate — rejects private/loopback hosts before fetch.
    // followRedirects: "manual" + handleRedirects makes link-preview-js re-run the
    // gate on every redirect hop (its "follow" path skips re-validation, so an http
    // target could 302 into the private network / cloud metadata — SSRF bypass).
    const preview = await getLinkPreview(clean, {
      timeout: 5_000,
      followRedirects: "manual",
      handleRedirects: () => true,
      headers: { "user-agent": USER_AGENT, "accept-language": "en-US,en;q=0.9" },
      resolveDNSHost: resolvePublicHost,
    });

    const rawTitle = "title" in preview ? (preview.title ?? "") : "";
    if (looksLikeBotChallenge(rawTitle)) {
      // No real metadata behind the challenge — fall back to the hostname.
      return { title: fallbackTitle(clean), description: "", image: "" };
    }

    const title = rawTitle || fallbackTitle(clean);
    const description = "description" in preview ? (preview.description ?? "") : "";
    const image = "images" in preview && preview.images.length > 0 ? preview.images[0] : "";

    return { title, description, image };
  } catch {
    // Unreachable / blocked / timed out — degrade gracefully, never leak why.
    return { title: fallbackTitle(clean), description: "", image: "" };
  }
}
