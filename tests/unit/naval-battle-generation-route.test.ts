import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), enabled: vi.fn(), insert: vi.fn(), from: vi.fn(), abortSignal: vi.fn() }));
vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.session }));
vi.mock('@/utils/aiServiceValidation', () => ({ checkAIServiceStatus: mocks.enabled, aiServiceDisabledResponse: () => new Response('Disabled', { status: 402 }) }));
import { POST } from '@/app/api/exercises/generate-naval-battle/route';

const item = {
  type: 'multiple_choice', prompt: '¿Qué planeta está más cerca del Sol?', options: ['Mercurio', 'Venus', 'Tierra', 'Marte'], correctIndex: 0,
  explanation: 'Mercurio es el planeta con la órbita más próxima al Sol.',
};
const body = { prompt: 'Sistema Solar primaria', mode: 'multiple_choice', optionCount: 4, count: 1, excludedPrompts: [] };
const request = (value: unknown, signal?: AbortSignal) => new Request('https://school.test/api/exercises/generate-naval-battle', { method: 'POST', body: JSON.stringify(value), headers: { 'Content-Type': 'application/json' }, signal });
const reply = (questions: unknown[] = [item]) => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: questions }) } }], usage: { prompt_tokens: 10, completion_tokens: 20 } }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.from.mockReturnValue({ insert: mocks.insert });
  mocks.session.mockResolvedValue({ user: { id: 'teacher-a' }, tenantId: 'tenant-a', supabase: { from: mocks.from } });
  mocks.insert.mockReturnValue({ abortSignal: mocks.abortSignal });
  mocks.abortSignal.mockResolvedValue({ error: null });
  mocks.enabled.mockResolvedValue(true);
  vi.stubEnv('OPENROUTER_SLIDES_API_KEY', '');
  vi.stubEnv('OPENROUTER_API_KEY', 'test-not-a-secret');
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => reply()));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Teacher-only Naval Battle AI route', () => {
  it('authorizes only teachers before any provider call or body parsing', async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(mocks.session).toHaveBeenCalledWith(['profesor']);
    expect(mocks.session.mock.invocationCallOrder[0]).toBeLessThan(mocks.enabled.mock.invocationCallOrder[0]);
    expect(mocks.enabled.mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(fetch).mock.invocationCallOrder[0]);
    const { items } = await response.json();
    expect(items[0].options[items[0].correctIndex]).toBe('Mercurio');
  });

  it('records usage using the authenticated session tenant/user, ignoring supplied identities', async () => {
    const response = await POST(request({ ...body, tenantId: 'attacker-school', userId: 'attacker', user_metadata: { rol: 'profesor' } }));
    expect(response.status).toBe(200);
    expect(mocks.from).toHaveBeenCalledWith('ai_token_usage');
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-a', user_id: 'teacher-a', prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }));
    expect(mocks.abortSignal).toHaveBeenCalledWith(expect.any(AbortSignal));
    expect(await response.text()).not.toContain('test-not-a-secret');
  });

  it.each([
    ['No autenticado', 401], ['No autorizado', 403], ['Usuario inactivo', 403],
    ['Institución suspendida', 403], ['Perfil sin institución asignada', 403], ['Institución no encontrada', 403],
  ])('blocks %s before reading malformed requests or calling AI', async (reason, status) => {
    mocks.session.mockRejectedValueOnce(new Error(reason as string));
    const invalid = new Request('https://school.test/api', { method: 'POST', body: '{bad JSON' });
    expect((await POST(invalid)).status).toBe(status);
    expect(mocks.enabled).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('blocks AI when the authenticated institution has disabled it', async () => {
    mocks.enabled.mockResolvedValueOnce(false);
    const response = await POST(request(body));
    expect(response.status).toBe(402);
    expect((await response.json()).error).toContain('no está habilitado para esta institución');
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    { ...body, prompt: '' }, { ...body, prompt: 'x'.repeat(12_001) },
    { ...body, mode: 'none' }, { ...body, optionCount: 1 }, { ...body, optionCount: 7 },
    { ...body, optionCount: '4' }, { ...body, count: 0 }, { ...body, count: 13 },
    { ...body, count: '1' }, { ...body, count: 1.5 },
    { ...body, excludedPrompts: 'wrong' }, { ...body, excludedPrompts: Array.from({ length: 81 }, () => 'Used') },
    { ...body, excludedPrompts: ['x'.repeat(1001)] }, { ...body, excludedPrompts: [1] },
    null, [],
  ])('rejects invalid form contracts without spending AI tokens: %j', async (value) => {
    expect((await POST(request(value))).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid JSON with a clear request error', async () => {
    const response = await POST(new Request('https://school.test/api', { method: 'POST', body: '{broken' }));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('JSON válido');
  });

  it('caps actual chunked request bytes without relying on Content-Length', async () => {
    const response = await POST(new Request('https://school.test/api', { method: 'POST', body: JSON.stringify({ ...body, unused: '🌊'.repeat(31_000) }) }));
    expect(response.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects excessive Content-Length before reading body bytes', async () => {
    const response = await POST(new Request('https://school.test/api', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Length': '120001' } }));
    expect(response.status).toBe(413);
  });

  it('records generation and internal repair separately without replacing tenant identity', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(reply([{ ...item, explanation: '' }])).mockResolvedValueOnce(reply());
    const response = await POST(request({ ...body, userId: 'attacker' }));
    expect(response.status).toBe(200);
    expect(mocks.insert).toHaveBeenCalledTimes(2);
    for (const [row] of mocks.insert.mock.calls) expect(row).toMatchObject({ tenant_id: 'tenant-a', user_id: 'teacher-a', total_tokens: 30 });
  });

  it('rejects repeated questions after one repair and never returns a shorter or recycled batch', async () => {
    const response = await POST(request({ ...body, excludedPrompts: [item.prompt] }));
    expect(response.status).toBe(502);
    expect(fetch).toHaveBeenCalledTimes(2);
    const result = await response.json();
    expect(result.error).toContain('Tus preguntas actuales se conservan');
    expect(result.items).toBeUndefined();
  });

  it('does not start provider generation when the request was canceled', async () => {
    const controller = new AbortController(); controller.abort();
    expect((await POST(request(body, controller.signal))).status).toBe(408);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns a safe provider-unavailable error, not upstream secrets', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response('private context test-not-a-secret', { status: 500 }));
    const response = await POST(request(body));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('test-not-a-secret');
  });

  it('does not expose a secret or make provider calls when configuration is missing', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    const response = await POST(request(body));
    expect(response.status).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('keeps a valid generated question if optional RLS usage logging fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.abortSignal.mockResolvedValueOnce({ error: { code: '42501', message: 'sensitive row policy content' } });
    expect((await POST(request(body))).status).toBe(200);
    expect(consoleError).toHaveBeenCalledWith('No se registró el consumo IA de Batalla Naval:', '42501');
    consoleError.mockRestore();
  });
});
