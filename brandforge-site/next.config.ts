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
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
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
