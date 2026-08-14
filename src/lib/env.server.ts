import z from "zod";
import { clientEnvSchema } from "./env.client";

const serverEnvSchema = z.object({
  ...clientEnvSchema.shape,
  // Only the REST credentials are used — @upstash/redis talks over REST, so the
  // native-protocol vars (KV_URL / REDIS_URL) and the read-only token aren't needed.
  KV_REST_API_TOKEN: z.string().min(3),
  KV_REST_API_URL: z.string().min(3),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

export const serverEnv = serverEnvSchema.parse(process.env);

declare global {
  namespace NodeJS {
    interface ProcessEnv extends ServerEnv {}
  }
}
