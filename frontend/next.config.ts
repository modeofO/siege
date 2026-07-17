import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Build with webpack (see package.json build script): Turbopack's runtime
  // wasm-chunk loader double-applies the Vercel deployment id — it URL-encodes
  // the chunk's existing `?dpl=` into the .wasm path and appends another,
  // producing `/_next/static/chunks/x.wasm%3Fdpl%3D...?dpl=...` → 404 and
  // "WebAssembly: HTTP status code is not ok" in production. Reproduced
  // locally on Next 16.2.6 and 16.2.10 with NEXT_DEPLOYMENT_ID set; webpack's
  // loader handles the deployment id correctly. Revisit when the Turbopack
  // bug is fixed upstream.
  // Keep the wasm-bindgen packages out of the server bundle entirely — SSR
  // never runs them (Controller is browser-only constructed) and webpack's
  // SSR wasm emit resolves at inconsistent chunk depths (ENOENT at prerender).
  serverExternalPackages: [
    "@cartridge/controller",
    "@cartridge/connector",
    "@cartridge/controller-wasm",
    "@dojoengine/torii-wasm",
    "@dojoengine/sdk",
  ],
  webpack: (config, { isServer }) => {
    // Cartridge controller-wasm and Dojo torii-wasm ship wasm-bindgen ESM
    // imports of .wasm files; webpack 5 requires opting in.
    config.experiments = { ...config.experiments, asyncWebAssembly: true };
    // Server bundles resolve wasm relative to .next/server/, so hop up one
    // level to the shared static/wasm output — otherwise prerender fails with
    // ENOENT .next/server/static/wasm/<hash>.wasm.
    config.output.webassemblyModuleFilename =
      (isServer ? "../" : "") + "static/wasm/[modulehash].wasm";
    return config;
  },
};

export default nextConfig;
