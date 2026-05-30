import { ImageResponse } from 'next/og';

// Dynamic share card (no PII — just the streak number). Rendered for link previews.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const streak = (searchParams.get('streak') ?? '0').replace(/\D/g, '').slice(0, 4) || '0';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(135deg,#312e81,#4f46e5)', color: 'white',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 34, letterSpacing: 6, opacity: 0.85, fontWeight: 700 }}>
          HSC LEGENDS
        </div>
        <div style={{ display: 'flex', fontSize: 260, fontWeight: 900, lineHeight: 1 }}>{streak}</div>
        <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, letterSpacing: 4 }}>DAY STREAK 🔥</div>
        <div style={{ display: 'flex', marginTop: 28, fontSize: 30, opacity: 0.85 }}>Can you beat it?</div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
