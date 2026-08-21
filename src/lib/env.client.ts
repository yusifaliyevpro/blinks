import { z } from "zod";

export const clientEnvSchema = z.object({
  // Fixed, non-secret KDF salt. Referenced explicitly (not spread) so Next
  // inlines it into the client bundle.
  NEXT_PUBLIC_KDF_SALT: z.string().min(16),
  // "true" re-enables password managers on the password field (off by default).
  NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS: z.string().optional(),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_KDF_SALT: process.env.NEXT_PUBLIC_KDF_SALT,
  NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS: process.env.NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS,
});

export const allowPasswordManagers = clientEnv.NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS === "true";
