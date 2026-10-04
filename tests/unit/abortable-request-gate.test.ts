import { describe, expect, it, vi } from 'vitest';
import { createAbortableRequestGate } from '@/lib/ui/abortable-request-gate';

describe('abortable request gate', () => {
  it('locks synchronously so a double click starts only one request', () => {
    const gate = createAbortableRequestGate();
    const first = gate.start();
    expect(first).not.toBeNull();
    expect(gate.busy).toBe(true);
    expect(gate.start()).toBeNull();
    expect(first!.isCurrent()).toBe(true);
  });

  it('releases a completed request and invalidates its response token', () => {
    const gate = createAbortableRequestGate();
    const request = gate.start()!;
    expect(request.finish()).toBe(true);
    expect(request.isCurrent()).toBe(false);
    expect(request.finish()).toBe(false);
    expect(gate.busy).toBe(false);
    expect(gate.start()).not.toBeNull();
  });

  it('aborts the fetch signal and invalidates the request on cancel/close', () => {
    const gate = createAbortableRequestGate();
    const request = gate.start()!;
    const aborted = vi.fn();
    request.signal.addEventListener('abort', aborted);
    gate.cancel();
    gate.cancel();
    expect(request.signal.aborted).toBe(true);
    expect(aborted).toHaveBeenCalledOnce();
    expect(request.isCurrent()).toBe(false);
    expect(gate.busy).toBe(false);
  });

  it('does not let an old finally block unlock a new generation', () => {
    const gate = createAbortableRequestGate();
    const old = gate.start()!;
    gate.cancel();
    const next = gate.start()!;
    expect(old.finish()).toBe(false);
    expect(gate.busy).toBe(true);
    expect(next.isCurrent()).toBe(true);
    expect(next.signal.aborted).toBe(false);
    expect(gate.start()).toBeNull();
  });

  it('ignores a late response even when its producer does not honor abort', async () => {
    const gate = createAbortableRequestGate();
    const old = gate.start()!;
    let resolve!: (value: string[]) => void;
    const pending = new Promise<string[]>((complete) => { resolve = complete; });
    let questions = ['pregunta anterior'];
    const receive = pending.then((generated) => {
      if (old.isCurrent()) questions = generated;
    }).finally(() => { old.finish(); });
    gate.cancel();
    const current = gate.start()!;
    questions = ['corrección manual'];
    resolve(['respuesta IA obsoleta']);
    await receive;
    expect(questions).toEqual(['corrección manual']);
    expect(current.isCurrent()).toBe(true);
    expect(gate.busy).toBe(true);
  });
});
