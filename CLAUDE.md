# Blinks

A private, single-user, **zero-knowledge encrypted link manager**. The user saves
links (with OG metadata) behind one password; everything is encrypted in the
browser, and the server (Upstash Redis) only ever stores an opaque ciphertext
blob. No accounts, no server-side password check, no plaintext ever leaves the
client. Dark-mode only, deployed on Vercel.

## Before you start

- **Read `node_modules/next/AGENTS.md`** before doing anything Next.js-specific
  (App Router, server actions, caching, config). This project runs **Next.js 16**
  with React 19 + React Compiler — patterns differ from older Next.
- After changing code, keep it green: `pnpm tsc --noEmit --incremental false`,
  `pnpm lint` (oxlint, type-aware), `pnpm fmt` (oxfmt). `pnpm check` runs greenly
  (tsc + fmt + lint). `react-doctor --verbose` catches React Compiler bailouts.
- Package manager is **pnpm**. Don't add dependencies casually — the workspace
  enforces a supply-chain policy (`minimumReleaseAge`, `trustPolicy`).

## Stack

- **Next.js 16** (App Router, `reactCompiler`, `cacheComponents`, `typedRoutes`),
  **React 19**, **TypeScript** (tsgo), **Tailwind CSS v4** (`@theme` tokens in
  `globals.css` — no `tailwind.config`).
- **Upstash Redis** (`@upstash/redis`) + **`@upstash/ratelimit`**, server-side only.
- **hash-wasm** (Argon2id KDF, runs in the browser), **Web Crypto** (AES-GCM, HKDF).
- **zod** for server-action validation; **`zod/mini`** on the client (smaller bundle).
- **motion** (list animations only), **react-icons** (Feather `Fi*`), **link-preview-js**
  (server-side OG metadata).
- Fonts self-hosted via `next/font/google`: **Inter** (UI) + **Instrument Serif**
  (`--font-display`, the wordmark/title).

## Architecture

- **Crypto — `src/lib/crypto.ts` (client only).** `password + NEXT_PUBLIC_KDF_SALT`
  → Argon2id → one master → HKDF (distinct `info` labels) → non-extractable
  AES-GCM key (`encKey`) + hex `blobId` (Redis key). Payload is **gzip-compressed
  (`CompressionStream`) before AES-GCM encryption**. The raw key bytes persist in
  `sessionStorage` (survive refresh, clear on tab close). Also holds the CSPRNG
  password generator.
- **Storage model.** The entire vault is a single blob: `AES-GCM(gzip(JSON({ title, links })))`,
  stored in a Redis hash with fields `c` (ciphertext) + `v` (version). Every
  mutation re-encrypts and writes the whole thing under **optimistic concurrency**
  (version-guarded compare-and-set). We deliberately keep one opaque blob (hides
  even link count / per-item timing) — see the compression note below.
- **Server actions — `src/lib/actions.ts` (`"use server"`).** `getBlob`, `putBlob`,
  `fetchMetadata`. All inputs zod-validated; per-IP rate-limited (IP from
  `x-vercel-forwarded-for` → `x-forwarded-for` → `x-real-ip`). `putBlob` uses an
  atomic Lua CAS (`scripts.ts`) — REST Redis has no `WATCH`, so the script is the
  atomic unit. `fetchMetadata` uses link-preview-js with `net.ts`'s
  `resolvePublicHost` as an **SSRF guard** (rejects private/loopback/link-local).
- **Client UI.** `vault-app` (phase machine: checking → locked → unlocked) →
  `password-screen` or `links-view`. `links-view` owns the vault commit
  (`useOptimistic` + `startTransition`, conflict-retry). `link-card`, `vault-title`
  (debounced autosave), `logo` (animated eye).
- **Security.** Static CSP in `next.config.ts` (needs `'wasm-unsafe-eval'` for the
  Argon2id WASM; `'unsafe-eval'` dev-only). `noindex` headers + metadata. Env
  validated in `env.client.ts` / `env.server.ts`. **Never log URLs, ciphertext,
  passwords, or request bodies.**

### Env vars

`KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash). `NEXT_PUBLIC_KDF_SALT` (fixed,
non-secret, must be identical everywhere or existing data becomes unreachable).
`NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS` (`"true"` re-enables password managers on the
password field; off by default).

## Design principles — keep this style in every session

The look is **dark-mode-only, minimalist, refined, and intentional. It must NOT
look like generic AI slop.** Concretely:

- **Palette:** neutral dark surfaces via Tailwind `@theme` tokens (`bg`, `panel`,
  `elevated`, `hover`, `border`, `text`, `muted`, `accent`). **Use the tokens —
  never hardcode colors** (the only exception is self-contained static assets like
  `public/logo.svg` that can't inherit `currentColor`). **One restrained accent**
  (indigo `#6366f1`); everything else is monochrome. No second accent.
- **Forbidden:** gradients, mesh/noise backgrounds, glow/neon, decorative drop
  shadows, emoji, and any "gradient-and-emoji" flourish. Flat, clean surfaces.
- **Typography:** Inter for UI; Instrument Serif (`font-display`) for the wordmark
  and the vault title only. Sentence case. Generous spacing, hairline `border`
  borders, tight tracking on the display face.
- **Motion:** the `motion` library is used **only** for list add/delete
  (`AnimatePresence` + `layout`). Everything else is pure Tailwind/CSS transitions.
  Keep enter/exit smooth and quick.
- **Icons:** react-icons Feather (`Fi*`) or minimal inline SVG with a consistent
  stroke weight. Never hand-draw complex icon paths.
- **Feedback is subtle and inline — no toasts.** Patterns already in use: input
  shake + red border on error/invalid, a brief fading accent check for "saved", an
  accent ring `pulse-highlight` for a duplicate, a per-card spinner while metadata
  loads. Prefer these over banners/modals.
- **Micro-interactions:** icon buttons sit _inside_ inputs (trailing); they use
  `onMouseDown` `preventDefault` so clicking them never steals focus from the input.
  Custom scrollbar is thin, themed, `scrollbar-gutter: stable`, no arrow buttons.
- **Centering:** keep the primary control optically centered by making secondary
  bits (wordmark, char counter, title) `absolute` satellites rather than pushing
  the control around.
- **Accessibility is considered but pragmatic** — occasionally traded for safety on
  purpose (e.g. the delete button is intentionally not keyboard-focusable and uses
  a two-step confirm to prevent accidental deletes). Document such trade-offs.

When adding UI, match the existing components' density, spacing, and idioms rather
than introducing a new visual language. Always read some other components to get
a view of existing design tokens.
