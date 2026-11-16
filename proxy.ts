import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Refreshes the Supabase auth session cookie on each request so server and
// client stay in sync.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // The staging page enforces its own separate configuration and does not use
  // the shared application's session. This exact-path bypass is not authorization.
  const publicSamples = ['/arena', '/demo', '/lab-rush.html', '/offline.html', '/question-import', '/classroom-staging'];
  if ((request.method === 'GET' || request.method === 'HEAD') && publicSamples.includes(request.nextUrl.pathname)) {
    return response;
  }

  // A self-contained sample can run before a backend is configured. Do not
  // bypass session refresh for any other route when configuration is missing.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    const publicPreview = ['/', '/games'];
    if (request.method === 'GET' || request.method === 'HEAD') {
      if (request.nextUrl.pathname === '/tycoon') return NextResponse.redirect(new URL('/demo', request.url));
      if (publicPreview.includes(request.nextUrl.pathname)) return response;
    }
    if (request.method === 'GET' || request.method === 'HEAD') {
      return new NextResponse(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Game unavailable · HSC Legends</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101329;color:#fff;font-family:system-ui,sans-serif}main{max-width:32rem;padding:2rem}p{color:#c9cde4;line-height:1.6}a{display:inline-block;margin-top:1rem;padding:1rem 1.25rem;border-radius:.8rem;background:#a3f3d2;color:#142939;font-weight:800;text-decoration:none}</style></head><body><main><h1>Connected games are unavailable</h1><p>You can still play an offline sample while the game services are being set up.</p><a href="/demo">Play the sample →</a></main></body></html>`, {
        status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
      });
    }
    return new NextResponse('Account and connected games are not configured.', { status: 503 });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  await supabase.auth.getUser();
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|manifest.webmanifest|sw.js).*)'],
};
