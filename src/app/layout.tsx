import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

const SITE_URL = 'https://echonest-app.vercel.app';
const SHARE_TITLE = 'EchoNest — your music, everywhere';
const SHARE_DESC =
  'Free personal music library. Drop in a YouTube link or upload audio — everything plays from your phone with full lock-screen + background controls. No ads, no signup needed.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'EchoNest — Your Personal Music',
  description: SHARE_DESC,
  applicationName: 'EchoNest',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'EchoNest',
    statusBarStyle: 'black-translucent',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  // Open Graph / Twitter cards — what shows up when the link is shared
  // on WhatsApp, iMessage, X, LinkedIn, Slack, Discord, etc.
  openGraph: {
    type: 'website',
    url: SITE_URL,
    siteName: 'EchoNest',
    title: SHARE_TITLE,
    description: SHARE_DESC,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'EchoNest — your music, everywhere',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: SHARE_TITLE,
    description: SHARE_DESC,
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  themeColor: '#8b5cf6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} dark`}
    >
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="EchoNest" />
      </head>
      <body>{children}</body>
    </html>
  );
}
