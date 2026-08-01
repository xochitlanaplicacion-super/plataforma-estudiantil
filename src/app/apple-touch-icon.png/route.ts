import { getInstitucionConfig } from '@/lib/actions/institucion';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const config = await getInstitucionConfig();
    const origin = new URL(request.url).origin;
    let targetUrl = config.favicon_url || config.logo_url || '/images/logo_placeholder.svg';

    if (targetUrl.startsWith('/')) {
      targetUrl = `${origin}${targetUrl}`;
    }

    if (targetUrl.startsWith('http://') || targetUrl.startsWith('https://')) {
      try {
        const imageRes = await fetch(targetUrl, { cache: 'no-store' });
        if (imageRes.ok) {
          const imageBuffer = await imageRes.arrayBuffer();
          const contentType = imageRes.headers.get('content-type') || 'image/png';
          return new Response(imageBuffer, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=3600, s-maxage=86400',
            },
          });
        }
      } catch {
        // Fallback al redirect si falla el fetch directo
      }
      return NextResponse.redirect(targetUrl, 307);
    }
  } catch (error) {
    console.error('Error sirviendo apple-touch-icon.png dinámico:', error);
  }

  const origin = new URL(request.url).origin;
  return NextResponse.redirect(new URL('/images/logo_placeholder.svg', origin), 307);
}
