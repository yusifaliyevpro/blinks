import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "nextjs", "unicorn", "import", "react", "react-perf", "vitest"],
  categories: {
    suspicious: "warn",
  },
  options: {
    typeAware: true,
    typeCheck: true,
  },
  rules: {
    eqeqeq: "warn",
    "no-throw-literal": "warn",
    "import/no-unassigned-import": [
      "warn",
      {
        allow: ["**/globals.css", "**/env.server", "dotenv/config", "server-only", "@sanity/client", "swiper/css"],
      },
    ],
    "react/react-in-jsx-scope": "off",
    "unicorn/prefer-node-protocol": "warn",
    "typescript/consistent-type-imports": "warn",
  },
  overrides: [
    {
      // Worker.postMessage takes no targetOrigin; the rule only fits window.postMessage.
      files: ["src/lib/kdf.ts", "src/lib/kdf.worker.ts"],
      rules: { "unicorn/require-post-message-target-origin": "off" },
    },
  ],
});
