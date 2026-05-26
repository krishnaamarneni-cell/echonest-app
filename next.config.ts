import type { NextConfig } from "next";
import withSerwistInit from "@serwist/next";

const nextConfig: NextConfig = {
  images: {
    // Skip Vercel's /_next/image optimizer. The Hobby tier caps optimized
    // image transformations per month and once it's hit every <Image>
    // returns HTTP 402 (OPTIMIZED_IMAGE_REQUEST_PAYMENT_REQUIRED). Cover
    // art here is already tiny (YouTube hqdefault is 480x360 JPEG, ~20KB),
    // so optimizing it isn't worth the paywall risk.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**',
      },
    ],
  },
};

// Serwist generates /public/sw.js at build time from src/app/sw.ts.
// That service worker caches the app shell so EchoNest opens & navigates
// with NO internet after the first successful visit. Disabled in dev so
// stale caches don't get in the way of hot reload.
const withSerwist = withSerwistInit({
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  disable: process.env.NODE_ENV === "development",
  reloadOnOnline: true,
});

export default withSerwist(nextConfig);
