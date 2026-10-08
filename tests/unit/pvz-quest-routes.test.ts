import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), read: vi.fn(), generate: vi.fn(), enabled: vi.fn() }));
vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.session }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.read }));
vi.mock('@/app/api/exercises/generate-naval-battle/route', () => ({ POST: mocks.generate }));
vi.mock('@/utils/aiServiceValidation', () => ({ checkAIServiceStatus: mocks.enabled }));
import { GET as play } from '@/app/api/classroom/pvz-quest/play/route';
import { POST as questions } from '@/app/api/classroom/pvz-quest/questions/route';
import { GET as status } from '@/app/api/classroom/pvz-quest/ai-status/route';

let identity = 0;
const body = { topic: 'Fracciones', level: 'Quinto de primaria', type: 'mixed', optionCount: 4, count: 2, exclude: ['Pregunta anterior'] };
const request = (value: unknown = body, headers: Record<string, string> = {}, signal?: AbortSignal) => new Request('https://school.test/api/classroom/pvz-quest/questions', {
  method: 'POST', body: JSON.stringify(value), signal, headers: { Origin: 'https://school.test', 'Content-Type': 'application/json', ...headers },
});
beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: `teacher-${++identity}` }, tenantId: 'school-a' });
  mocks.read.mockResolvedValue('<!doctype html><html lang="es"><head></head><body>Quest</body></html>');
  mocks.enabled.mockResolvedValue(true);
  mocks.generate.mockResolvedValue(Response.json({ items: [
    { id: 'one', type: 'multiple_choice', prompt: '¿Cuál?', options: ['A', 'B'], correctIndex: 1, explanation: 'B.' },
    { id: 'two', type: 'true_false', prompt: '¿Verdadero?', options: ['Verdadero', 'Falso'], correctIndex: 0, explanation: 'Sí.' },
  ] }));
});

describe('PvZ Quest teacher/tenant integration', () => {
  it('serves a private authenticated template with local asset base and safe framing', async () => {
    const response = await play(); const html = await response.text();
    expect(response.status).toBe(200);
    expect(mocks.session).toHaveBeenCalledWith(['profesor']);
    expect(mocks.session.mock.invocationCallOrder[0]).toBeLessThan(mocks.read.mock.invocationCallOrder[0]);
    expect(mocks.read).toHaveBeenCalledWith(expect.stringContaining('src/lib/games/pvz-quest/template.html'), 'utf8');
    expect(html).toContain('data-pvz-platform="true"');
    expect(html).toContain('<base href="/games/pvz-quest/classroom/">');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'self'");
  });
  it.each([['No autenticado', 401], ['No autorizado', 403], ['Usuario inactivo', 403], ['Institución suspendida', 403], ['Perfil sin institución asignada', 403]])('blocks %s before reading assets or sending AI', async (reason, code) => {
    mocks.session.mockRejectedValue(new Error(reason as string));
    expect((await play()).status).toBe(code);
    expect((await questions(request(null))).status).toBe(code);
    expect((await status()).status).toBe(code);
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.generate).not.toHaveBeenCalled(); expect(mocks.enabled).not.toHaveBeenCalled();
  });
  it('maps the reviewed tenant-gated IA contract without trusting submitted identities', async () => {
    const response = await questions(request({ ...body, tenantId: 'attacker', userId: 'attacker' }));
    expect(response.status).toBe(200);
    const forwarded = await mocks.generate.mock.calls[0][0].json();
    expect(forwarded).toEqual({ prompt: 'Fracciones\nNivel escolar: Quinto de primaria', mode: 'mixed', optionCount: 4, count: 2, excludedPrompts: ['Pregunta anterior'] });
    const result = await response.json();
    expect(result.questions.map((item: { type: string }) => item.type)).toEqual(['multiple', 'truefalse']);
    expect(result.questions[0].answerIndex).toBe(1);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
  });
  it.each([{ Origin: 'https://attacker.test' }, { Origin: '' }, { 'Sec-Fetch-Site': 'cross-site' }] as Record<string, string>[])('rejects cross-site IA spending: %j', async headers => {
    expect((await questions(request(body, headers))).status).toBe(403); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it.each([null, [], { ...body, type: '__proto__' }, { ...body, topic: '' }, { ...body, level: ' ' }, { ...body, topic: 'x'.repeat(11_501) }, { ...body, level: 'x'.repeat(201) }])('rejects malformed input before IA: %j', async value => {
    expect((await questions(request(value))).status).toBe(400); expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('limits bytes even without Content-Length and checks JSON type', async () => {
    expect((await questions(request({ ...body, unused: '🌊'.repeat(31_000) }))).status).toBe(413);
    expect((await questions(request(body, { 'Content-Type': 'text/plain' }))).status).toBe(415);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('returns provider failures without replacing the approved bank', async () => {
    mocks.generate.mockResolvedValueOnce(Response.json({ error: 'Servicio no disponible' }, { status: 503 }));
    const response = await questions(request()); expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Servicio no disponible' });
  });
  it('allows at most four generation batches per teacher/minute', async () => {
    mocks.generate.mockImplementation(async () => Response.json({ items: [] }));
    for (let index = 0; index < 4; index++) expect((await questions(request())).status).toBe(200);
    expect((await questions(request())).status).toBe(429); expect(mocks.generate).toHaveBeenCalledTimes(4);
  });
  it('does not generate after cancellation', async () => {
    const abort = new AbortController(); abort.abort();
    expect((await questions(request(body, {}, abort.signal))).status).toBe(408); expect(mocks.generate).not.toHaveBeenCalled();
  });
});
