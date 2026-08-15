import { Redis } from "@upstash/redis";
import { serverEnv } from "./env.server";

// Null when the REST credentials aren't set (local-only deployment). Callers that
// need the remote store must guard on this.
export const redis =
  serverEnv.KV_REST_API_URL && serverEnv.KV_REST_API_TOKEN
    ? new Redis({ url: serverEnv.KV_REST_API_URL, token: serverEnv.KV_REST_API_TOKEN })
    : null;
