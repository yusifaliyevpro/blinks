import { Redis } from "@upstash/redis";
import { serverEnv } from "./env.server";

// Instantiated from the Vercel KV / Upstash env vars, server-side only.
export const redis = new Redis({
  url: serverEnv.KV_REST_API_URL,
  token: serverEnv.KV_REST_API_TOKEN,
});
