import { describe, expect, it } from 'vitest';
import { calculatePlatformServiceCountdown } from '@/lib/service-countdown';

describe('platform service countdown', () => {
  it('computes the live remaining time', () => {
    const result = calculatePlatformServiceCountdown(
      { estado: 'SI', fecha_inicio: '2026-09-01', duracion_dias: 30 },
      new Date('2026-09-29T12:34:56-06:00')
    );
    expect(result).toMatchObject({ status: 'active', days: 1, hours: 11, minutes: 25, seconds: 4 });
    expect(result.endDate?.toISOString()).toBe('2026-10-01T06:00:00.000Z');
  });

  it('distinguishes an expired, suspended and undated service', () => {
    expect(calculatePlatformServiceCountdown(
      { estado: 'SI', fecha_inicio: '2026-09-01', duracion_dias: 10 },
      new Date('2026-09-12T00:00:00-06:00')
    ).status).toBe('expired');
    expect(calculatePlatformServiceCountdown({ estado: 'NO', fecha_inicio: '2026-09-01' }).status).toBe('suspended');
    expect(calculatePlatformServiceCountdown({ estado: 'SI', fecha_inicio: null }).status).toBe('no-date');
  });
});
