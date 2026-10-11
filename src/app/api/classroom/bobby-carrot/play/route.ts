import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requireTenantSession } from '@/lib/tenant/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Serve Bobby Carrot only inside the authenticated teacher repertoire. */
export async function GET() {
  try {
    await requireTenantSession(['profesor']);
    const template = await readFile(resolve(process.cwd(), 'src/lib/games/bobby-carrot/template.html'), 'utf8');
    const html = template
      .replace('<head>', '<head><base href="/games/bobby-carrot/">')
      .replace('<html lang="es">', '<html lang="es" data-bobby-platform="true" data-bobby-asset-root="/games/bobby-carrot">');
    return new Response(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
        'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const status = message === 'No autenticado'
      ? 401
      : /No autorizado|inactivo|suspendida|institución/i.test(message)
        ? 403
        : 503;
    return new Response(
      status === 401
        ? 'Inicia sesión como profesor para abrir el juego.'
        : status === 403
          ? 'Este juego sólo está disponible para profesores autorizados de una institución activa.'
          : 'No se pudo abrir el juego. Vuelve al repertorio e intenta nuevamente.',
      {
        status,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'private, no-store',
        },
      },
    );
  }
}
