"use server";

import { getLinkPreview } from "link-preview-js";
import { headers } from "next/headers";
import { resolvePublicHost, USER_AGENT } from "./net";
import { blobLimiter, metadataLimiter } from "./ratelimit";
import { redis } from "./redis";
import { blobIdSchema, putBlobSchema, urlSchema } from "./schemas";
import { PUT_BLOB_CAS, type CasResult } from "./scripts";
import type { GetBlobResult, LinkMetadata, PutBlobResult } from "./types";

const IP_HEADERS = ["x-vercel-forwarded-for", "x-forwarded-for", "x-real-ip"] as const;

async function clientIp(): Promise<string> {
  const h = await headers();
  for (const name of IP_HEADERS) {
    const value = h.get(name);
    if (value) return value.split(",")[0].trim();
  }
  return "0.0.0.0";
}

async function rateLimit(limiter: typeof blobLimiter): Promise<void> {
  const { success } = await limiter.limit(await clientIp());
  if (!success) throw new Error("Rate limit exceeded. Try again shortly.");
}

export async function getBlob(blobId: string): Promise<GetBlobResult> {
  const id = blobIdSchema.parse(blobId);
  await rateLimit(blobLimiter);

  const data = await redis.hgetall<{ c: string; v: number | string }>(id);
  if (!data?.c) return null;
  return { ciphertext: data.c, version: Number(data.v) };
}

export async function putBlob(input: {
  blobId: string;
  ciphertext: string;
  expectedVersion: number;
}): Promise<PutBlobResult> {
  const { blobId, ciphertext, expectedVersion } = putBlobSchema.parse(input);
  await rateLimit(blobLimiter);

  const result = await redis.eval(PUT_BLOB_CAS, [blobId], [ciphertext, expectedVersion]);
  // Shape is fixed by PUT_BLOB_CAS (see scripts.ts).
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  const [status, version, current] = result as CasResult;

  if (status === "ok") return { version };
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

export async function fetchMetadata(url: string): Promise<LinkMetadata> {
  const clean = urlSchema.parse(url);
  await rateLimit(metadataLimiter);

  try {
    // link-preview-js fetches + parses OG/Twitter/HTML metadata. `resolveDNSHost`
    // is our SSRF gate: it rejects hosts that resolve to private/loopback ranges
    // before any request is made. 5s timeout, follows redirects.
    const preview = await getLinkPreview(clean, {
      timeout: 5_000,
      followRedirects: "follow",
      headers: { "user-agent": USER_AGENT, "accept-language": "en-US,en;q=0.9" },
      resolveDNSHost: resolvePublicHost,
    });

    const title = ("title" in preview && preview.title) || fallbackTitle(clean);
    const description = "description" in preview ? (preview.description ?? "") : "";
    const image = "images" in preview && preview.images.length > 0 ? preview.images[0] : "";

    return { title, description, image };
  } catch {
    // Unreachable / blocked / timed out — degrade gracefully, never leak why.
    return { title: fallbackTitle(clean), description: "", image: "" };
  }
}
