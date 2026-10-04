import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), enabled: vi.fn(), insert: vi.fn() }));
vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.session }));
vi.mock('@/utils/aiServiceValidation', () => ({ checkAIServiceStatus: mocks.enabled, aiServiceDisabledResponse: () => new Response('Disabled', { status: 402 }) }));
import { POST } from '@/app/api/exercises/generate-flying-cat/route';

const aiItem = {
  prompt: 'Profesional que diagnostica y trata las enfermedades de los animales domésticos y de granja.',
  options: ['Veterinario', 'Piloto', 'Bombero', 'Dentista'], correctIndex: 0,
  feedback: 'El veterinario protege la salud de los animales.',
};
const request = (body: unknown) => new Request('https://school.test/api/exercises/generate-flying-cat', { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
  mocks.session.mockResolvedValue({ user: { id: 'teacher-a' }, tenantId: 'tenant-a', supabase: { from: () => ({ insert: mocks.insert }) } });
  mocks.insert.mockResolvedValue({ error: null }); mocks.enabled.mockResolvedValue(true);
  vi.stubEnv('OPENROUTER_API_KEY', 'test-not-a-secret');
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [aiItem] }) } }], usage: { prompt_tokens: 100, completion_tokens: 200 } }))));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Flying Cat AI uses server identity and strict response validation', () => {
  it('authenticates teacher role, logs actual tenant, and preserves correct concept after shuffling', async () => {
    const response = await POST(request({ prompt: 'Profesiones de primaria', numPreguntas: 1, userId: 'attacker', tenantId: 'other-school' }));
    expect(response.status).toBe(200);
    expect(mocks.session).toHaveBeenCalledWith(['profesor', 'admin', 'superuser']);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ tenant_id: 'tenant-a', user_id: 'teacher-a', total_tokens: 300 }));
    const { items } = await response.json();
    expect(items[0].options[items[0].correctIndex]).toBe('Veterinario');
    const sent = JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string);
    expect(sent.messages[0].content).toContain('MÁXIMO DOS PALABRAS');
    expect(sent.messages[0].content).toContain('aleatoriamente');
    expect(sent.messages[0].content).toContain('35 a 110 palabras');
  });

  it('does not call AI for unauthenticated or disabled tenant', async () => {
    mocks.session.mockRejectedValueOnce(new Error('No autenticado'));
    expect((await POST(request({ prompt: 'Tema', numPreguntas: 1 }))).status).toBe(401);
    mocks.enabled.mockResolvedValue(false);
    expect((await POST(request({ prompt: 'Tema', numPreguntas: 1 }))).status).toBe(402);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects invalid option counts instead of truncating away the correct answer', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ items: [{ ...aiItem, options: [...aiItem.options, 'Doctor'], correctIndex: 4 }] }) } }] })));
    const response = await POST(request({ prompt: 'Tema', numPreguntas: 1 }));
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('2 y 4');
  });

  it('rejects wrong number of definitions and invalid requested counts', async () => {
    expect((await POST(request({ prompt: 'Tema', numPreguntas: 2 }))).status).toBe(502);
    expect((await POST(request({ prompt: 'Tema', numPreguntas: 21 }))).status).toBe(400);
  });
});
