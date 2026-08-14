import { Redis } from "@upstash/redis";
import { serverEnv } from "./env.server";

export const redis = new Redis({
  url: serverEnv.KV_REST_API_URL,
  token: serverEnv.KV_REST_API_TOKEN,
});
