/* eslint-disable @next/next/no-img-element */
import { ImageResponse } from 'next/og';

/**
 * Dynamic Open Graph image for social-media link previews.
 *
 * Lives at /og-image.png (matches the path referenced in layout.tsx).
 * Generated at the edge as a 1200×630 PNG so every link shared on
 * WhatsApp, iMessage, X, LinkedIn, Slack, Discord, Facebook, etc.
 * renders a real preview card instead of just a URL.
 */
export const runtime = 'edge';

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          width: '1200px',
          height: '630px',
          background:
            'linear-gradient(135deg, #0a0a0a 0%, #1a0b2e 35%, #2e1065 70%, #4c1d95 100%)',
          position: 'relative',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          color: 'white',
          padding: '80px',
        }}
      >
        {/* Decorative blobs */}
        <div
          style={{
            position: 'absolute',
            top: '-160px',
            left: '-160px',
            width: '500px',
            height: '500px',
            borderRadius: '9999px',
            background: 'rgba(139, 92, 246, 0.45)',
            filter: 'blur(80px)',
            display: 'flex',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: '-160px',
            right: '-160px',
            width: '450px',
            height: '450px',
            borderRadius: '9999px',
            background: 'rgba(236, 72, 153, 0.35)',
            filter: 'blur(80px)',
            display: 'flex',
          }}
        />

        {/* Logo glyph */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
            marginBottom: '48px',
          }}
        >
          <div
            style={{
              width: '110px',
              height: '110px',
              borderRadius: '28px',
              background:
                'linear-gradient(135deg, #8b5cf6 0%, #ec4899 50%, #f97316 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 25px 70px rgba(139, 92, 246, 0.5)',
            }}
          >
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none">
              <path
                d="M9 18V5l12-2v13"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="6" cy="18" r="3" fill="white" />
              <circle cx="18" cy="16" r="3" fill="white" />
            </svg>
          </div>
          <div
            style={{
              fontSize: '88px',
              fontWeight: 800,
              letterSpacing: '-0.04em',
              display: 'flex',
            }}
          >
            EchoNest
          </div>
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: '52px',
            fontWeight: 700,
            textAlign: 'center',
            letterSpacing: '-0.02em',
            lineHeight: 1.1,
            maxWidth: '900px',
            display: 'flex',
            background:
              'linear-gradient(120deg, #f5f3ff 0%, #fce7f3 50%, #fed7aa 100%)',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Your music, everywhere.
        </div>

        {/* Subhead */}
        <div
          style={{
            marginTop: '32px',
            fontSize: '26px',
            color: 'rgba(255, 255, 255, 0.7)',
            textAlign: 'center',
            maxWidth: '850px',
            lineHeight: 1.4,
            display: 'flex',
          }}
        >
          Free personal library · YouTube + your uploads · background play on iPhone
        </div>

        {/* Footer hint */}
        <div
          style={{
            position: 'absolute',
            bottom: '40px',
            fontSize: '20px',
            color: 'rgba(255, 255, 255, 0.5)',
            letterSpacing: '0.05em',
            display: 'flex',
          }}
        >
          echonest-app.vercel.app
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    },
  );
}
