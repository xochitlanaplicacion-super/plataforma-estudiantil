// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlyingCatEditor } from '@/components/activities/flying-cat/FlyingCatEditor';
import { createFlyingCatContent, type FlyingCatContent } from '@/lib/activities/flying-cat';

afterEach(cleanup);

function fixture(): FlyingCatContent {
  return { ...createFlyingCatContent(), items: [{ id: 'q1', prompt: 'Profesional que diagnostica y trata las enfermedades de los animales domésticos y de granja.', options: ['Veterinario', 'Piloto', 'Bombero', 'Dentista'], correctIndex: 0, feedback: 'El veterinario protege la salud de los animales.' }] };
}

describe('Flying Cat teacher editor', () => {
  it('imports the documented JSON example with validation', () => {
    const update = vi.fn();
    render(<FlyingCatEditor content={fixture()} updateContent={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Importar JSON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ver ejemplo JSON' }));
    fireEvent.click(screen.getByRole('button', { name: 'Validar e importar' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ version: 1, items: [expect.objectContaining({ options: ['Veterinario', 'Dentista', 'Bombero', 'Piloto'], correctIndex: 0 })] }));
    expect(screen.queryByRole('button', { name: 'Validar e importar' })).not.toBeInTheDocument();
  });

  it('rejects an excessive option import without changing teacher content', () => {
    const update = vi.fn(); const invalid = fixture(); invalid.items[0].options.push('Ingeniero'); invalid.items[0].correctIndex = 4;
    render(<FlyingCatEditor content={fixture()} updateContent={update} />);
    fireEvent.click(screen.getByRole('button', { name: 'Importar JSON' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON de Flying Cat' }), { target: { value: JSON.stringify(invalid) } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar e importar' }));
    expect(screen.getByRole('alert')).toHaveTextContent('entre 2 y 4 conceptos');
    expect(update).not.toHaveBeenCalled();
  });

  it('labels the manual explanation optional and imports a simple question without inventing one', () => {
    const update = vi.fn();
    const content: any = fixture();
    content.items[0] = { id: 'doctor', prompt: 'Es in trabajo donde usan medicina', options: ['Doctor', 'Chef', 'Journalist'], correctIndex: 0 };
    render(<FlyingCatEditor content={fixture()} updateContent={update} />);
    expect(screen.getByRole('textbox', { name: /Explicación de la respuesta \(opcional\)/ })).toBeVisible();
    expect(screen.getByText(/el alumno verá el concepto correcto sin explicación adicional/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Importar JSON' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'JSON de Flying Cat' }), { target: { value: JSON.stringify(content) } });
    fireEvent.click(screen.getByRole('button', { name: 'Validar e importar' }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ items: [expect.objectContaining({ prompt: 'Es in trabajo donde usan medicina', options: ['Doctor', 'Chef', 'Journalist'], correctIndex: 0, feedback: '' })] }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('requires explicit choice when the correct concept is removed, not a silent reassignment', () => {
    const changed = vi.fn();
    function EditorHarness() {
      const [content, setContent] = useState(fixture());
      return <FlyingCatEditor content={content} updateContent={(value) => { changed(value); setContent(value); }} />;
    }
    render(<EditorHarness />);
    expect(screen.getByRole('button', { name: 'Concepto' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar concepto 1 de definición 1' }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ items: [expect.objectContaining({ correctIndex: -1, options: ['Piloto', 'Bombero', 'Dentista'] })] }));
    expect(screen.getAllByRole('radio').every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Concepto 2 correcto de definición 1' }));
    expect(changed).toHaveBeenLastCalledWith(expect.objectContaining({ items: [expect.objectContaining({ correctIndex: 1 })] }));
    fireEvent.click(screen.getByRole('button', { name: 'Concepto' }));
    expect(screen.getByRole('button', { name: 'Concepto' })).toBeDisabled();
  });
});
