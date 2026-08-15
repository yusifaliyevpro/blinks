import { Ratelimit } from "@upstash/ratelimit";
import { redis } from "./redis";

// Null when Redis isn't configured — there's no shared store to rate-limit against.
// Guards the fetchMetadata action so it can't be abused as an open fetch proxy.
export const metadataLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, "60 s"),
      prefix: "blinks:rl:meta",
      analytics: false,
    })
  : null;

// Coarse per-IP cap on blob reads/writes. Generous — this is a single-user app.
export const blobLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(120, "60 s"),
      prefix: "blinks:rl:blob",
      analytics: false,
    })
  : null;
