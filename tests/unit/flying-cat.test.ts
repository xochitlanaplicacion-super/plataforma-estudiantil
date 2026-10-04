import { describe, expect, it } from 'vitest';
import { createFlyingCatContent, normalizeFlyingCatContent, shuffleFlyingCatOptions, validateFlyingCatContent, type FlyingCatContent } from '@/lib/activities/flying-cat';

function fixture(): FlyingCatContent {
  return {
    ...createFlyingCatContent(),
    items: [{ id: 'question-1', prompt: 'Profesional que diagnostica y trata las enfermedades de los animales domésticos y de granja.', options: ['Veterinario', 'Bombero', 'Piloto', 'Dentista'], correctIndex: 0, feedback: 'El veterinario se dedica a la salud de los animales.' }],
  };
}

describe('Flying Cat definitions, compact concepts and safe JSON', () => {
  it('accepts detailed definitions with up to four short concepts and feedback', () => {
    expect(validateFlyingCatContent(fixture())).toBeNull();
    const content = fixture(); content.items[0].options = ['Veterinario', 'Piloto'];
    expect(validateFlyingCatContent(content)).toBeNull();
  });

  it('does not silently truncate five options or remap an out-of-range answer', () => {
    const content = fixture();
    content.items[0].options.push('Doctor'); content.items[0].correctIndex = 4;
    const normalized = normalizeFlyingCatContent(content);
    expect(normalized.items[0].options).toHaveLength(5);
    expect(normalized.items[0].correctIndex).toBe(4);
    expect(validateFlyingCatContent(normalized)).toContain('2 y 4');
    content.items[0].options.pop();
    expect(validateFlyingCatContent(content)).toContain('correctIndex');
  });

  it('rejects long cards, duplicate concepts, short prompts and missing feedback', () => {
    const content = fixture();
    content.items[0].options[1] = 'Persona que vuela';
    expect(validateFlyingCatContent(content)).toContain('2 palabras');
    content.items[0].options[1] = 'VETERINARIO';
    expect(validateFlyingCatContent(content)).toContain('repetirse');
    content.items[0].options[1] = 'Ingeniero'; content.items[0].prompt = '¿Animal?';
    expect(validateFlyingCatContent(content)).toContain('30 a 1600');
    content.items[0].prompt = fixture().items[0].prompt; content.items[0].feedback = '';
    expect(validateFlyingCatContent(content)).toContain('explicación');
  });

  it('rejects malformed raw JSON rather than filling in an answer or IDs', () => {
    const content: any = fixture();
    delete content.items[0].correctIndex;
    expect(validateFlyingCatContent(content)).toContain('correctIndex');
    expect(normalizeFlyingCatContent(content).items[0].correctIndex).toBe(-1);
    content.items[0].correctIndex = 0; delete content.items[0].id;
    expect(validateFlyingCatContent(content)).toContain('id');
  });

  it('preserves excessive question count so import/save validation can reject it', () => {
    const content = fixture();
    content.items = Array.from({ length: 21 }, (_, index) => ({ ...content.items[0], id: `item-${index}` }));
    expect(normalizeFlyingCatContent(content).items).toHaveLength(21);
    expect(validateFlyingCatContent(content)).toContain('1 y 20');
  });

  it('keeps question IDs compatible with the historical answer trace', () => {
    const content = fixture();
    content.items[0].id = 'x'.repeat(80);
    expect(validateFlyingCatContent(content)).toBeNull();
    content.items[0].id += 'x';
    expect(validateFlyingCatContent(content)).toContain('80 caracteres');
    content.items[0].id = ' q1 ';
    expect(validateFlyingCatContent(content)).toContain('espacios');
  });

  it('shuffles without mutating source and keeps the correct concept for every draw', () => {
    const item = fixture().items[0];
    const original = [...item.options];
    for (const value of [0, 0.2, 0.5, 0.8, 0.999999, 1]) {
      const shuffled = shuffleFlyingCatOptions(item, () => value);
      expect(shuffled.options[shuffled.correctIndex]).toBe('Veterinario');
      expect([...shuffled.options].sort()).toEqual([...original].sort());
    }
    expect(shuffleFlyingCatOptions(item, () => 0).options).not.toEqual(original);
    expect(item.options).toEqual(original);
    expect(item.correctIndex).toBe(0);
  });
});
