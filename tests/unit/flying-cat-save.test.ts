import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ session: vi.fn(), from: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: mocks.session }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), unstable_noStore: vi.fn() }));

import { upsertEjercicio } from '@/lib/actions/academic';
import { createFlyingCatContent, type FlyingCatContent } from '@/lib/activities/flying-cat';

function fixture(): FlyingCatContent {
  return { ...createFlyingCatContent(), items: [{ id: 'q1', prompt: 'Profesional que diagnostica y trata las enfermedades de los animales domésticos y de granja.', options: ['Veterinario', 'Piloto'], correctIndex: 0, feedback: 'El veterinario protege la salud de los animales.' }] };
}

beforeEach(() => {
  mocks.from.mockImplementation((table: string) => {
    if (table === 'tenant_features') {
      const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), maybeSingle: vi.fn().mockResolvedValue({ data: { timezone: 'America/Mexico_City' }, error: null }) };
      return query;
    }
    if (table === 'ejercicios') return { upsert: mocks.upsert };
    throw new Error(`Unexpected table: ${table}`);
  });
  mocks.upsert.mockImplementation((row: Record<string, unknown>) => ({ select: () => ({ single: async () => ({ data: { ...row, id: 'exercise-a' }, error: null }) }) }));
  mocks.session.mockResolvedValue({ user: { id: 'teacher-a' }, profile: { rol: 'profesor' }, tenantId: 'tenant-a', supabase: { from: mocks.from }, admin: { from: mocks.from } });
});

describe('Flying Cat server-side exercise save validation', () => {
  it('rejects malformed JSON before any query or write', async () => {
    const response = await upsertEjercicio({ tipo: 'flying_cat', contenido: '{"items":' });
    expect(response.error?.message).toContain('JSON válido');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('validates raw fields before defaults and rejects missing settings', async () => {
    const raw: any = fixture(); delete raw.settings;
    const response = await upsertEjercicio({ tipo: 'flying_cat', contenido: JSON.stringify(raw) });
    expect(response.error?.message).toContain('dificultad');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects out-of-range answers and excessive concepts without silently truncating', async () => {
    const raw = fixture(); raw.items[0].options = ['Veterinario', 'Piloto', 'Dentista', 'Bombero', 'Ingeniero']; raw.items[0].correctIndex = 4;
    const response = await upsertEjercicio({ tipo: 'flying_cat', contenido: raw });
    expect(response.error?.message).toContain('2 y 4');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it.each(['object', 'serialized'] as const)('saves valid %s content canonically with unchanged session roles', async (format) => {
    const content = fixture();
    const response = await upsertEjercicio({ tipo: 'flying_cat', titulo: 'Profesiones', contenido: format === 'object' ? content : JSON.stringify(content) });
    expect(response.error).toBeNull();
    expect(mocks.session).toHaveBeenCalledWith(['profesor', 'admin', 'superuser']);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'flying_cat', created_by: 'teacher-a', contenido: JSON.stringify(content) }));
    expect(content.items[0].correctIndex).toBe(0);
  });

  it.each([true, false])('saves a simple manual definition without explanation with showFeedback=%s', async (showFeedback) => {
    const content: any = fixture();
    content.showFeedback = showFeedback;
    content.items[0] = { id: 'doctor', prompt: 'Es in trabajo donde usan medicina', options: ['Doctor', 'Chef', 'Journalist'], correctIndex: 0 };
    const response = await upsertEjercicio({ tipo: 'flying_cat', titulo: 'Jobs', contenido: JSON.stringify(content) });
    expect(response.error).toBeNull();
    const saved = JSON.parse(mocks.upsert.mock.calls[0][0].contenido);
    expect(saved).toMatchObject({ showFeedback, items: [{ prompt: 'Es in trabajo donde usan medicina', correctIndex: 0, options: ['Doctor', 'Chef', 'Journalist'], feedback: '' }] });
  });

  it.each([42, null, 'x'.repeat(2001)])('rejects malformed or overlong explanation at the server: %s', async (feedback) => {
    const content: any = fixture(); content.items[0].feedback = feedback;
    const response = await upsertEjercicio({ tipo: 'flying_cat', contenido: JSON.stringify(content) });
    expect(response.error?.message).toContain('explicación opcional');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('does not impose the new schema on any other existing exercise type', async () => {
    const response = await upsertEjercicio({ tipo: 'opcion_multiple', titulo: 'Repaso', contenido: '{"items":[]}' });
    expect(response.error).toBeNull();
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'opcion_multiple', contenido: '{"items":[]}' }));
  });
});
