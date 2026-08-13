import { defineConfig } from "greenly";

export default defineConfig({
  name: "Blinks",
  checks: [
    { name: "TypeScript", command: "pnpm tsc --noEmit --incremental false" },
    { name: "Oxfmt", command: "pnpm fmt:check", onFail: "pnpm fmt" },
    { name: "Oxlint", command: "pnpm lint" },
  ],
});
