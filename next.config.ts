import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self)",
          },
          {
            key: "Content-Security-Policy",
            value: `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' ${process.env.NODE_ENV === "development" ? "'unsafe-eval'" : ""} https://challenges.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://api.protomaps.com https://protomaps.github.io; font-src 'self' https://protomaps.github.io; connect-src 'self' https://api.protomaps.com https://protomaps.github.io https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests`,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
