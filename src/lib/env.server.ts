import z from "zod";
import { clientEnvSchema } from "./env.client";

const serverEnvSchema = z.object({
  ...clientEnvSchema.shape,
  VERCEL_BLOB: z.string().min(3),
});

type ServerEnv = z.infer<typeof serverEnvSchema>;

export const serverEnv = serverEnvSchema.parse(process.env);

declare global {
  namespace NodeJS {
    interface ProcessEnv extends ServerEnv {}
  }
}
