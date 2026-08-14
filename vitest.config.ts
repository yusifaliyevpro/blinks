import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Public, non-secret KDF salt used only by the test run. Key derivation just has
// to be stable within a run — the value is irrelevant, only its presence/length.
const TEST_KDF_SALT = "test-kdf-salt-0123456789abcdef";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // Available to every project; env.client parses NEXT_PUBLIC_KDF_SALT at import.
    env: {
      NEXT_PUBLIC_KDF_SALT: TEST_KDF_SALT,
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/lib/**/*.test.ts"],
          setupFiles: ["./tests/setup.unit.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "ui",
          environment: "happy-dom",
          include: ["tests/components/**/*.test.tsx"],
          setupFiles: ["./tests/setup.ui.ts"],
        },
      },
    ],
  },
});
