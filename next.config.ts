import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import {
  AGORA_CSP_CONNECT_SOURCES,
  LIVE_TASTING_HEADER_ROUTES,
  LIVE_TASTING_PERMISSIONS_POLICY
} from "./src/lib/security-headers";

const isDevelopment = process.env.NODE_ENV === "development";
const supabaseOrigin = (() => {
  try { return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin; }
  catch { return ""; }
})();
const supabaseSocket = supabaseOrigin.replace(/^http/, "ws");
const defaultConnectSources = [
  "'self'",
  ...(supabaseOrigin ? [supabaseOrigin, supabaseSocket] : []),
  "https://*.ingest.sentry.io",
  "https://*.ingest.us.sentry.io"
];

function createContentSecurityPolicy(extraConnectSources: readonly string[] = []) {
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDevelopment ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data: https:",
    "font-src 'self' data:",
    `connect-src ${[...defaultConnectSources, ...extraConnectSources].join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDevelopment ? [] : ["upgrade-insecure-requests"])
  ].join("; ");
}

const contentSecurityPolicy = createContentSecurityPolicy();
const liveTastingCsp = createContentSecurityPolicy(AGORA_CSP_CONNECT_SOURCES);

const liveTastingHeaders = [
  { key: "Permissions-Policy", value: LIVE_TASTING_PERMISSIONS_POLICY },
  { key: "Content-Security-Policy", value: liveTastingCsp }
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  output: "standalone",
  headers: async () => [
    {
      source: "/audio/vintage-timer/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/brand/vintage-fork-timer-mark.png",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/brand/loading-wallpaper.jpg",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/brand/opening-animation-app.mp4",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/brand/opening-animation-web.mp4",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }]
    },
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: contentSecurityPolicy }
      ]
    },
    ...LIVE_TASTING_HEADER_ROUTES.map(source => ({ source, headers: liveTastingHeaders }))
  ]
};

export default withSentryConfig(nextConfig, {
  silent: true,
  webpack: { treeshake: { removeDebugLogging: true } },
  sourcemaps: { disable: !process.env.SENTRY_AUTH_TOKEN }
});
