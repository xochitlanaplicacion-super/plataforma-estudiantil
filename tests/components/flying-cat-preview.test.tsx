// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/hooks/use-institucion', () => ({ useInstitucion: () => ({ config: { nombre_corto: 'Escuela de prueba' } }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('canvas-confetti', () => ({ default: vi.fn() }));
vi.mock('@/components/shared/EntregaAlumno', () => ({ EntregaAlumno: () => null }));
vi.mock('@/components/activities/parkour-race/ParkourRaceFrame', () => ({ ParkourRaceFrame: () => null }));
vi.mock('@/components/activities/backrooms-scape/BackroomsScapeFrame', () => ({ BackroomsScapeFrame: () => null }));
vi.mock('next/dynamic', () => ({ default: () => (props: any) => <button
  type="button" disabled={!props.onComplete} data-exercise={props.exercise.id}
  onClick={() => props.onComplete?.({ hits: 1, total: 2, wrongAttempts: 1, time: 50, score: 200, answers: [
    { questionId: 'q1', prompt: 'Persona que transporta pasajeros en una aeronave.',
      selectedAnswer: 'Pilot', correctAnswer: 'Pilot', isCorrect: true, attemptNumber: 1 },
  ] })}
>Finalizar vuelo</button> }));

import { ActivityPreview } from '@/components/shared/ActivityPreview';

afterEach(() => cleanup());

const exercise = { id: 'flying-test', tipo: 'flying_cat', titulo: 'Amazing jobs', contenido: { items: [] } };

describe('Flying Cat platform preview and automatic results', () => {
  it('opens in the game layout and serializes academic answers through the normal completion callback', () => {
    const onComplete = vi.fn(() => null);
    render(<ActivityPreview exercise={exercise} onClose={vi.fn()} onComplete={onComplete} />);

    expect(screen.getByText('Amazing jobs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar vuelo' })).toHaveAttribute('data-exercise', exercise.id);
    fireEvent.click(screen.getByRole('button', { name: 'Finalizar vuelo' }));

    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(1, 2, [
      expect.objectContaining({ tipo: 'flying_cat', tiempo_segundos: 50, puntos_juego: 200,
        intentos_incorrectos: 1, detalle_respuestas_disponible: true }),
      expect.objectContaining({ tipo: 'respuesta_juego', pregunta_id: 'q1', respuesta_dada: 'Pilot', esCorrecto: true }),
    ]);
  });

  it('never saves an author preview without a completion callback, and keeps the explicit close control', () => {
    const onClose = vi.fn();
    render(<ActivityPreview exercise={exercise} isPreview onClose={onClose} />);
    expect(screen.getByText('Vista previa · Amazing jobs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finalizar vuelo' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar vista previa' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('lets the game validate malformed saved JSON instead of crashing in the parent preview', () => {
    render(<ActivityPreview exercise={{ ...exercise, contenido: '{broken json' }} isPreview onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Finalizar vuelo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cerrar vista previa' })).toBeInTheDocument();
  });
});
