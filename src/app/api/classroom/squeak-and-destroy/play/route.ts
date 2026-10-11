import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { requireTenantSession } from '@/lib/tenant/context';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serve Squeak & Destroy only through the teacher classroom session. The
 * bundled game stays in /public so its relative assets can be cached by the
 * browser, while the launch document itself is not a public entry point.
 */
export async function GET() {
  try {
    await requireTenantSession(['profesor']);
    const template = await readFile(resolve(process.cwd(), 'src/lib/games/squeak-and-destroy/template.html'), 'utf8');
    const html = template
      .replace('<html lang="hu">', '<html lang="es" data-squeak-platform="true" data-squeak-asset-root="/games/squeak-and-destroy">')
      .replace('<head>', '<head><base href="/games/squeak-and-destroy/">');
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
