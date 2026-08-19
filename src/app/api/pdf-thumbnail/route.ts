import { NextRequest, NextResponse } from 'next/server';
import { requireTenantSession } from '@/lib/tenant/context';

export const dynamic = 'force-dynamic';

/**
 * API Route: /api/pdf-thumbnail?path=carpeta/archivo.pdf
 *
 * Acts as a same-origin proxy to Supabase Storage, forwarding
 * HTTP Range headers so pdfjs-dist can use partial content requests.
 * This means only the cross-reference table + page 1 data are fetched
 * (~30-80 KB instead of the full file).
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  try {
    const { supabase: supabaseAdmin, tenantId } = await requireTenantSession();
    if (!path.startsWith(`${tenantId}/`)) {
      return NextResponse.json({ error: 'File outside institution' }, { status: 403 });
    }
    // 1. Generate a short-lived signed URL server-side (bypasses CORS from browser)
    const { data: signedData, error: signedError } = await supabaseAdmin.storage
      .from('material-apoyo')
      .createSignedUrl(path, 3600);

    if (signedError || !signedData?.signedUrl) {
      console.error('PDF proxy: could not create signed URL', signedError?.message);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // 2. Forward any Range header from pdfjs-dist so it can do partial fetches
    const rangeHeader = request.headers.get('range');
    const fetchHeaders: HeadersInit = {};
    if (rangeHeader) {
      fetchHeaders['Range'] = rangeHeader;
    }

    // 3. Proxy the request to Supabase
    const upstream = await fetch(signedData.signedUrl, {
      headers: fetchHeaders,
    });

    // 4. Build response headers, propagating the ones pdfjs-dist needs
    const responseHeaders = new Headers();
    responseHeaders.set('Content-Type', 'application/pdf');
    responseHeaders.set('Accept-Ranges', 'bytes');
    // Allow pdfjs-dist's web worker (same origin) to read the response
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    // Cache at browser level for 1 hour so repeated renders don't re-download
    responseHeaders.set('Cache-Control', 'public, max-age=3600, immutable');

    const contentLength = upstream.headers.get('content-length');
    if (contentLength) responseHeaders.set('Content-Length', contentLength);

    const contentRange = upstream.headers.get('content-range');
    if (contentRange) responseHeaders.set('Content-Range', contentRange);

    // 5. Stream the (possibly partial) body back
    return new NextResponse(upstream.body, {
      status: upstream.status,   // 206 Partial Content when Range was requested
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error('PDF proxy error:', err.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// Handle preflight (OPTIONS) for CORS in case needed
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Type',
    },
  });
}
