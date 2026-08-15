# Blinks

A private, single-user, **zero-knowledge encrypted link manager**. The user saves
links (with OG metadata) behind one password; everything is encrypted in the
browser, and whatever store holds the vault only ever sees an opaque ciphertext
blob. No accounts, no server-side password check, no plaintext ever leaves the
client. Dark-mode only, deployed on Vercel.

The encrypted vault can live in either of **two storage backends**, chosen at
unlock — **Redis** (remote, Upstash server) or **Local** (this browser's
IndexedDB, offline, single-device). The crypto and the blob format are identical
either way; only the write destination changes. When no Redis credentials are
configured, Local is the only option and the app runs with no backend service at
all.

## Before you start

- **Read `node_modules/next/AGENTS.md`** before doing anything Next.js-specific
  (App Router, server actions, caching, config). This project runs **Next.js 16**
  with React 19 + React Compiler — patterns differ from older Next.
- After changing code, keep it green: `pnpm tsc --noEmit --incremental false`,
  `pnpm lint` (oxlint, type-aware), `pnpm fmt` (oxfmt), `pnpm test` (vitest).
  `pnpm check` runs greenly (tsc + fmt + lint + vitest). `react-doctor --verbose`
  catches React Compiler bailouts.
- Package manager is **pnpm**. Don't add dependencies casually — the workspace
  enforces a supply-chain policy (`minimumReleaseAge`, `trustPolicy`).
- **Keep comments to a minimum.** Don't restate what the code plainly says. Only
  write a comment when the reasoning is genuinely non-obvious (a security
  trade-off, a subtle race, a workaround) — and keep it short, ideally one line.

### Testing workflow (follow this exactly)

Tests live in `tests/` (mirrors `src/`: `tests/lib/*.test.ts` run in Node,
`tests/components/*.test.tsx` in happy-dom). **Vitest only** — never reach for
Playwright or a real browser. Two distinct flows, depending on the request:

- **Regression / bug fix → test-driven.** First write a test that reproduces the
  reported bug. Run it and **confirm it fails** (red) for the right reason — this
  proves the test actually captures the regression. Only then fix the code, and
  re-run until it passes (green). Don't fix first and backfill a test.
- **New feature → feature first, tests after confirmation.** Implement the
  feature and let the user try it. **Wait for the user to confirm** the behaviour
  is what they want, then add tests that lock in that confirmed behaviour. Don't
  write tests for a feature whose shape the user hasn't signed off on yet.

## Stack

- **Next.js 16** (App Router, `reactCompiler`, `cacheComponents`, `typedRoutes`),
  **React 19**, **TypeScript** (tsgo), **Tailwind CSS v4** (`@theme` tokens in
  `globals.css` — no `tailwind.config`).
- **Upstash Redis** (`@upstash/redis`) + **`@upstash/ratelimit`**, server-side only.
- **hash-wasm** (Argon2id KDF, runs in the browser), **Web Crypto** (AES-GCM, HKDF).
- **zod** for server-action validation; **`zod/mini`** on the client (smaller bundle).
- **motion** (list animations only), **react-icons** (Feather `Fi*`), **link-preview-js**
  (server-side OG metadata), **sonner** (toast notices, themed to our tokens).
- Fonts self-hosted via `next/font/google`: **Inter** (UI) + **Instrument Serif**
  (`--font-display`, the wordmark/title).

## Architecture

- **Crypto — `src/lib/crypto.ts` (client only).** `password + NEXT_PUBLIC_KDF_SALT`
  → Argon2id → one master → HKDF (three distinct `info` labels) → non-extractable
  AES-GCM key (`encKey`) + hex `blobId` (storage key) + hex `writeToken` (write auth).
  Payload is **gzip-compressed (`CompressionStream`) before AES-GCM encryption**.
  The raw key bytes + `writeToken` + chosen backend persist in `sessionStorage`
  (survive refresh, clear on tab close). Also holds the CSPRNG password generator.
- **Storage model.** The entire vault is a single blob: `AES-GCM(gzip(JSON({ title, links })))`,
  stored under fields `c` (ciphertext) + `v` (version) + `t` (`writeToken`) — a
  Redis hash in the remote backend, an IndexedDB record keyed by `blobId` in the
  local one. Every mutation re-encrypts and writes the whole thing under
  **optimistic concurrency** (version-guarded compare-and-set). The `blobId` is a
  bearer id sent on every read, so writes are additionally gated by `writeToken`
  (an independent HKDF output that can't decrypt anything): the CAS rejects an
  overwrite whose token doesn't match the one stored on first write, so a leaked
  `blobId` alone can't corrupt/wipe the vault. `t` is never returned to clients. We
  deliberately keep one opaque blob (hides even link count / per-item timing) — see
  the compression note below.
- **Storage backends — `src/lib/store.ts` (router).** `getBlob(backend, …)` /
  `putBlob(backend, …)` dispatch to either the server actions (`"redis"`) or
  IndexedDB (`"local"`, `src/lib/local-store.ts`). Both honour the same version
  CAS + write-token contract, so the commit loop is backend-agnostic. `local-store`
  runs the CAS inside one `readwrite` transaction and requests
  `navigator.storage.persist()` (it holds the only copy). **`fetchMetadata` still
  needs the server even in local mode** — OG fetching can't run in the browser
  (CORS + the SSRF guard), so offline it degrades to the hostname fallback.
- **Server actions — `src/lib/actions.ts` (`"use server"`).** `getBlob`, `putBlob`,
  `fetchMetadata`. All inputs zod-validated; per-IP rate-limited (IP from
  `x-vercel-forwarded-for` → `x-forwarded-for` → `x-real-ip`). `putBlob` uses an
  atomic Lua CAS (`scripts.ts`) — REST Redis has no `WATCH`, so the script is the
  atomic unit. When Redis isn't configured, `redis`/limiters are `null`:
  `getBlob`/`putBlob` throw (never called in local mode) and rate-limiting no-ops.
  `fetchMetadata` uses link-preview-js with `net.ts`'s `resolvePublicHost` as an
  **SSRF guard** (rejects private/loopback/link-local).
- **Client UI.** `vault-app` (phase machine: checking → locked → unlocked; takes
  `redisAvailable` from the server) → `password-screen` or `links-view`.
  `password-screen` shows a **Redis/Local segmented toggle** (only when Redis is
  available; else Local is forced), preselected from the cross-tab preference in
  `src/lib/preferences.ts` (localStorage). `links-view` owns the vault commit
  (`useOptimistic` + `startTransition`, conflict-retry). `link-card`, `vault-title`
  (debounced autosave), `logo` (animated eye).
- **Security.** Static CSP in `next.config.ts` (needs `'wasm-unsafe-eval'` for the
  Argon2id WASM; `'unsafe-eval'` dev-only). `noindex` headers + metadata. Env
  validated in `env.client.ts` / `env.server.ts`. **Never log URLs, ciphertext,
  passwords, or request bodies.**

### Env vars

`KV_REST_API_URL`, `KV_REST_API_TOKEN` (Upstash) — **optional**; omit both to run
local-only (IndexedDB, no remote backend). Their presence is exposed to the client
as `redisAvailable` (from `env.server.ts`, passed through `page.tsx`) and gates the
backend toggle. `NEXT_PUBLIC_KDF_SALT` (fixed, non-secret, must be identical
everywhere or existing data becomes unreachable). `NEXT_PUBLIC_ALLOW_PASSWORD_MANAGERS`
(`"true"` re-enables password managers on the password field; off by default).

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
- **Feedback: inline for field-level state, toasts for transient notices.**
  Inline patterns (prefer for anything tied to a control): input shake + red border
  on error/invalid, a brief fading accent check for "saved", an accent ring
  `pulse-highlight` for a duplicate, a per-card spinner while metadata loads.
  **Sonner** (`<Toaster theme="dark" position="bottom-right" />` in `layout.tsx`)
  handles transient notices — save/import/delete failures and neutral notices
  ("nothing to export") — replacing the old inline error banner. Toasts are themed
  to match the inputs (the `panel` surface + `border`) by overriding Sonner's dark
  CSS variables in `globals.css` (`--normal-bg` etc., at `body …` specificity to
  beat Sonner's own dark rule); every toast type shares one look. Still no modals.
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
