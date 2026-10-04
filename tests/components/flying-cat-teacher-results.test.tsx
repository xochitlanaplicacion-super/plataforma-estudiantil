// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const query = vi.hoisted(() => vi.fn());
vi.mock('@/lib/actions/entregas', () => ({
  getEntregasDeEjercicio: query, getEntregasAgrupadasPorSyncId: query, calificarEntregaDescriptiva: vi.fn(),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/shared/AccionesArchivoEntrega', () => ({ AccionesArchivoEntrega: () => null }));
vi.mock('@/components/shared/GaleriaEntrega', () => ({ GaleriaEntrega: () => null }));

import { PanelEntregasProfesor } from '@/components/shared/PanelEntregasProfesor';
import { gameAttemptDetails } from '@/lib/academic/game-attempt-details';

afterEach(() => cleanup());

describe('teacher Flying Cat results', () => {
  it('shows game evidence and exports separately from the file-submission workflow', async () => {
    query.mockResolvedValueOnce({ data: [{ alumno_id: 'juan', calificacion: 10, row_version: 1, intentos: 1,
      aciertos: 1, total_preguntas: 1, estado: 'calificado', profiles: { nombre: 'Juan', apellidos: 'Prueba', email: '' },
      historico_intentos: [{ intento: 1, calificacion_10: 10, aciertos: 1, total_preguntas: 1,
        detalles: gameAttemptDetails('flying_cat', { intentos_incorrectos: 0, tiempo_segundos: 50, puntos_juego: 160 }, [{
          questionId: 'q1', prompt: 'Persona que conduce una aeronave para transportar pasajeros.',
          selectedAnswer: 'Pilot', correctAnswer: 'Pilot', isCorrect: true, attemptNumber: 1,
        }]) }],
    }] });
    render(<PanelEntregasProfesor materiaId="english" materiaNombre="English 1"
      ejercicios={[{ id: 'flight', titulo: 'Amazing jobs', tipo: 'flying_cat', fecha_entrega: null }]} />);
    fireEvent.click(screen.getByRole('button', { name: /Amazing jobs/ }));
    expect(await screen.findByText('Juan Prueba')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar resumen CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Descargar intentos y respuestas CSV' })).toBeInTheDocument();
    expect(screen.queryByText(/Archivo caducado/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Detalle' }));
    expect(await screen.findByText('Resumen de Flying Cat')).toBeInTheDocument();
    expect(screen.getByText('Persona que conduce una aeronave para transportar pasajeros.')).toBeInTheDocument();
    expect(screen.getAllByText('Pilot')).toHaveLength(2);
  });
});
