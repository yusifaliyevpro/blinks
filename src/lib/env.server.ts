import * as z from "zod/mini";
import { clientEnvSchema } from "./env.client";

const serverEnvSchema = z.object({
  ...clientEnvSchema.shape,
  // Only the REST credentials are used — @upstash/redis talks over REST, so the
  // native-protocol vars (KV_URL / REDIS_URL) and the read-only token aren't needed.
  // Optional: omit both to run local-only (IndexedDB), with no remote backend.
  KV_REST_API_TOKEN: z.optional(z.string().check(z.minLength(3))),
  KV_REST_API_URL: z.optional(z.string().check(z.minLength(3))),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

export const serverEnv = serverEnvSchema.parse(process.env);

// Whether the Redis backend is configured. Drives the backend picker in the UI:
// when false, "Local" is the only option.
export const redisAvailable = Boolean(serverEnv.KV_REST_API_URL && serverEnv.KV_REST_API_TOKEN);

declare global {
  namespace NodeJS {
    interface ProcessEnv extends ServerEnv {}
  }
}
