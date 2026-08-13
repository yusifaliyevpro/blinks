import type { NextConfig } from "next";

// Static CSP so it holds under static prerendering (a per-request nonce would
// mismatch the build-time HTML and get every script blocked in production).
// Third-party/external script origins are fully blocked — only same-origin
// scripts run. `'unsafe-inline'` is required for Next's inline bootstrap; it's
// not a practical risk here since the app renders no user-supplied HTML (React
// escapes everything, no dangerouslySetInnerHTML, no eval of link data).
// `'wasm-unsafe-eval'` lets the Argon2id WASM (hash-wasm) compile without
// opening general JS eval. `'unsafe-eval'` is dev-only (React Fast Refresh).
const isDev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const nextConfig: NextConfig = {
  reactCompiler: true,
  typedRoutes: true,
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    useOffline: true,
    useTypeScriptCli: true,
    turbopackRustReactCompiler: true,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), browsing-topics=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
