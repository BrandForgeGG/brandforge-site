import { ImageResponse } from 'next/og';

export const runtime = 'edge';

// GET /og?title=...&line=... : the 1200x630 picture that shows when a BrandForge page is shared. Drawn from the page's own
// title and line, so every page previews as itself instead of as the home page. Cached hard: the same words, the same picture.
export function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const title = (searchParams.get('title') || 'AI and people, one workspace').replace(/\s+/g, ' ').slice(0, 90);
  const line = (searchParams.get('line') || 'Make it. Publish it. Trade it.').replace(/\s+/g, ' ').slice(0, 130);
  const size = title.length > 60 ? 58 : title.length > 36 ? 70 : 84;

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', background: '#0f0e0d', color: '#f4efe6', padding: '64px 72px', fontFamily: 'sans-serif', position: 'relative' }}>
        <div style={{ position: 'absolute', right: -160, top: -160, width: 520, height: 520, borderRadius: 520, background: 'radial-gradient(circle, rgba(255,106,43,0.55), rgba(255,106,43,0) 70%)', display: 'flex' }} />
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>
          <span>Brand</span>
          <span style={{ color: '#ff6a2b' }}>Forge</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', width: 84, height: 8, background: '#ff6a2b', borderRadius: 8, marginBottom: 32 }} />
          <div style={{ display: 'flex', fontSize: size, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, maxWidth: 1020 }}>{title}</div>
          <div style={{ display: 'flex', fontSize: 32, color: '#b9b2a6', marginTop: 28, lineHeight: 1.3, maxWidth: 980 }}>{line}</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: '#8f8a80' }}>
          <span>AI and people, one workspace</span>
          <span style={{ color: '#f4efe6' }}>brandforge.gg</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=86400, s-maxage=31536000, immutable' } },
  );
}
