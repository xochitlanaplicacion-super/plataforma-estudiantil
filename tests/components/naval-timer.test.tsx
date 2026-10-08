// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useNavalTimer } from '@/components/classroom-games/naval/useNavalTimer';

beforeEach(() => { vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance', 'Date'] }); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
const advance = (milliseconds: number) => act(() => { vi.advanceTimersByTime(milliseconds); });

describe('Naval classroom phase timer', () => {
  it('counts down only while a question or shot phase is running', () => {
    const expire = vi.fn();
    const { result, rerender } = renderHook(({ running }) => useNavalTimer('question-1', 5, running, expire), { initialProps: { running: false } });
    advance(10_000);
    expect(result.current).toBe(5);
    expect(expire).not.toHaveBeenCalled();
    rerender({ running: true });
    advance(2100);
    expect(result.current).toBe(3);
  });

  it('preserves unused time across a teacher pause instead of restarting the question', () => {
    const expire = vi.fn();
    const { result, rerender } = renderHook(({ running }) => useNavalTimer('question-1', 5, running, expire), { initialProps: { running: true } });
    advance(2000);
    expect(result.current).toBe(3);
    rerender({ running: false });
    advance(30_000);
    expect(result.current).toBe(3);
    rerender({ running: true });
    advance(2900);
    expect(result.current).toBe(1);
    expect(expire).not.toHaveBeenCalled();
    advance(100);
    expect(result.current).toBe(0);
    expect(expire).toHaveBeenCalledOnce();
  });

  it('preserves fractional active time when paused between 100ms ticks', () => {
    const expire = vi.fn();
    const { rerender } = renderHook(({ running }) => useNavalTimer('shot-1', 2, running, expire), { initialProps: { running: true } });
    // Five pauses would otherwise lose 50ms each and extend a two-second clock by 250ms.
    for (let pause = 0; pause < 5; pause++) {
      advance(150);
      rerender({ running: false });
      advance(30_000);
      rerender({ running: true });
    }
    advance(1200);
    expect(expire).not.toHaveBeenCalled();
    advance(100);
    expect(expire).toHaveBeenCalledOnce();
  });

  it('resets when the question/shot phase key changes, including while paused', () => {
    const expire = vi.fn();
    const { result, rerender } = renderHook(({ phase, running, seconds }) => useNavalTimer(phase, seconds, running, expire), { initialProps: { phase: 'question-1', running: true, seconds: 5 } });
    advance(2000);
    expect(result.current).toBe(3);
    rerender({ phase: 'shot-1', running: false, seconds: 8 });
    expect(result.current).toBe(8);
    advance(20_000);
    expect(result.current).toBe(8);
    rerender({ phase: 'shot-1', running: true, seconds: 8 });
    advance(7900);
    expect(expire).not.toHaveBeenCalled();
    advance(100);
    expect(expire).toHaveBeenCalledOnce();
  });

  it('expires exactly once for each phase even after rerenders or pause/resume', () => {
    const expire = vi.fn();
    const { result, rerender } = renderHook(({ phase, running }) => useNavalTimer(phase, 1, running, expire), { initialProps: { phase: 'question-1', running: true } });
    advance(1000);
    expect(result.current).toBe(0);
    expect(expire).toHaveBeenCalledOnce();
    advance(10_000);
    rerender({ phase: 'question-1', running: false });
    rerender({ phase: 'question-1', running: true });
    advance(10_000);
    expect(expire).toHaveBeenCalledOnce();
    rerender({ phase: 'question-2', running: true });
    expect(result.current).toBe(1);
    advance(1000);
    expect(expire).toHaveBeenCalledTimes(2);
  });

  it('retries a rejected queued expiration after a cinematic pauses and resumes the same phase', () => {
    let cinematicStarted = false;
    const expire = vi.fn(() => { if (cinematicStarted) return false; });
    const { result, rerender } = renderHook(({ running }) => useNavalTimer('shot-1', 1, running, expire), { initialProps: { running: true } });
    advance(900);
    // The action sets its ref before React commits the paused clock.
    act(() => { cinematicStarted = true; vi.advanceTimersByTime(100); });
    expect(result.current).toBe(0);
    expect(expire).toHaveBeenCalledOnce();
    rerender({ running: false });
    advance(30_000);
    expect(expire).toHaveBeenCalledOnce();

    cinematicStarted = false;
    rerender({ running: true });
    advance(100);
    expect(result.current).toBe(0);
    expect(expire).toHaveBeenCalledTimes(2);
    advance(10_000);
    rerender({ running: false });
    rerender({ running: true });
    advance(10_000);
    expect(expire).toHaveBeenCalledTimes(2);
  });

  it('calls the latest expiration handler, not a stale turn callback', () => {
    const earlier = vi.fn(); const current = vi.fn();
    const { rerender } = renderHook(({ callback }) => useNavalTimer('question-1', 2, true, callback), { initialProps: { callback: earlier } });
    advance(1000);
    rerender({ callback: current });
    advance(1000);
    expect(earlier).not.toHaveBeenCalled();
    expect(current).toHaveBeenCalledOnce();
  });

  it('cleans up on unmount and cannot expire a closed game', () => {
    const expire = vi.fn();
    const { unmount } = renderHook(() => useNavalTimer('question-1', 2, true, expire));
    advance(1000);
    unmount();
    advance(30_000);
    expect(expire).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
