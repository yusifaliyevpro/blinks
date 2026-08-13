import type { NextConfig } from "next";

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
};

export default nextConfig;
