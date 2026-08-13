import z from "zod";

export const clientEnvSchema = z.object({
  // Fixed, non-secret KDF salt. Public by design (NEXT_PUBLIC_) so key
  // derivation is stable across browsers. Must be referenced explicitly
  // below (not spread) so Next inlines it into the client bundle.
  NEXT_PUBLIC_KDF_SALT: z.string().min(16),
  // Set to "true" to let browser / third-party password managers use the
  // password field. Defaults to off (managers are discouraged).
  NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS: z.string().optional(),
});

export const clientEnv = clientEnvSchema.parse({
  NEXT_PUBLIC_KDF_SALT: process.env.NEXT_PUBLIC_KDF_SALT,
  NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS: process.env.NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS,
});

export const allowPasswordManagers = clientEnv.NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS === "true";
