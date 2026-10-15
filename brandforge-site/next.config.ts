import type { NextConfig } from "next";

// Baseline hardening headers. Deliberately minimal: the clickjacking directives
// (frame-ancestors + X-Frame-Options) close the real gap — tricking a signed-in
// user into clicking embedded proposal/accept controls. No script/style CSP yet:
// Next.js hydration relies on inline scripts, so a full policy needs a nonce
// design first (open item, not silently half-done).
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'self'",
  },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  // The server-side carousel renderer is a native module, and it reads its fonts from public/fonts at run time.
  // The voice-over model runs on the server through onnxruntime's native build, so those stay real node modules too.
  serverExternalPackages: ["@napi-rs/canvas", "kokoro-js", "@huggingface/transformers", "onnxruntime-node", "phonemizer"],
  outputFileTracingIncludes: {
    "/api/**": ["./public/fonts/**"],
    // The speech runtime's native module loads its shared library at run time, which file tracing cannot see.
    "/api/voice": ["./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime.so.1", "./node_modules/onnxruntime-node/bin/napi-v3/linux/x64/libonnxruntime_providers_shared.so", "./node_modules/kokoro-js/voices/**"],
  },
  // The servers run Linux on x64: the speech runtime's builds for other systems, and its browser-only files, stay out of the
  // functions so they fit the size limit.
  outputFileTracingExcludes: {
    "*": [
      "node_modules/onnxruntime-node/bin/napi-v3/darwin/**",
      "node_modules/onnxruntime-node/bin/napi-v3/win32/**",
      "node_modules/onnxruntime-node/bin/napi-v3/linux/arm64/**",
      "node_modules/@huggingface/transformers/dist/*.wasm",
      "node_modules/@huggingface/transformers/dist/*.map",
    ],
  },
  // The standalone Blueprint page is gone: the same research and planning run inside chat.
  // Old links (including saved-blueprint return emails) land in the chat.
  async redirects() {
    return [
      { source: "/blueprint", destination: "/chat", permanent: false },
      // The overview page is part of the front page now.
      { source: "/overview", destination: "/", permanent: true },
      // Free tools live inside Create and Distribute now; Connect became Settings > Integrations.
      { source: "/tools/:slug", destination: "/create", permanent: false },
      { source: "/connect", destination: "/settings#integrations", permanent: false },
      // Fewer pages, less noise: these said what the front page and pricing say now.
      { source: "/features", destination: "/", permanent: true },
      { source: "/enterprise", destination: "/pricing", permanent: true },
      { source: "/developers", destination: "/apply", permanent: true },
      { source: "/investors", destination: "/", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
