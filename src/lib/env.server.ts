import z from "zod";
import { clientEnvSchema } from "./env.client";

const serverEnvSchema = z.object({
  ...clientEnvSchema.shape,
  KV_REST_API_READ_ONLY_TOKEN: z.string().min(3),
  KV_REST_API_TOKEN: z.string().min(3),
  KV_REST_API_URL: z.string().min(3),
  KV_URL: z.string().min(3),
  REDIS_URL: z.string().min(3),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

export const serverEnv = serverEnvSchema.parse(process.env);

declare global {
  namespace NodeJS {
    interface ProcessEnv extends ServerEnv {}
  }
}
