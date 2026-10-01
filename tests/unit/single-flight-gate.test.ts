import { describe, expect, it, vi } from 'vitest';
import { createSingleFlightGate } from '@/lib/ui/single-flight-gate';

describe('createSingleFlightGate', () => {
  it('sólo deja entrar el primer clic de una ráfaga mientras el guardado está pendiente', async () => {
    const gate = createSingleFlightGate();
    const save = vi.fn();
    let finishSave!: () => void;
    save.mockImplementation(() => new Promise<void>((resolve) => { finishSave = resolve; }));

    const clickSave = async () => {
      if (!gate.tryAcquire()) return;
      try {
        await save();
      } finally {
        gate.release();
      }
    };

    const firstClick = clickSave();
    const secondClick = clickSave();
    const thirdClick = clickSave();

    expect(gate.isLocked()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    finishSave();
    await Promise.all([firstClick, secondClick, thirdClick]);
    expect(gate.isLocked()).toBe(false);
  });

  it('permite reintentar después de liberar el candado por error o validación', () => {
    const gate = createSingleFlightGate();
    expect(gate.tryAcquire()).toBe(true);
    expect(gate.tryAcquire()).toBe(false);
    gate.release();
    expect(gate.tryAcquire()).toBe(true);
  });
});
