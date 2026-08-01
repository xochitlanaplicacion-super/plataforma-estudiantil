import { getInstitucionConfig } from '@/lib/actions/institucion';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getInstitucionConfig();
    const targetUrl = config.favicon_url || config.logo_url;

    if (targetUrl && (targetUrl.startsWith('http://') || targetUrl.startsWith('https://'))) {
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
      return NextResponse.redirect(targetUrl, 307);
    }
  } catch (error) {
    console.error('Error sirviendo apple-touch-icon.png dinámico:', error);
  }

  return NextResponse.redirect(new URL('/images/logo_placeholder.svg', process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://localhost:3000'), 307);
}
