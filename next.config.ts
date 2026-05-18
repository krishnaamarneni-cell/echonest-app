import type { NextConfig } from "next";

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

export default nextConfig;
