export interface PlatformServiceSummary {
  estado: string | null;
  fecha_inicio: string | null;
  duracion_dias?: number | null;
  timezone?: string | null;
}

export type PlatformServiceCountdownStatus = 'active' | 'expired' | 'suspended' | 'no-date';

export interface PlatformServiceCountdown {
  status: PlatformServiceCountdownStatus;
  endDate: Date | null;
  totalMilliseconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export const DEFAULT_PLATFORM_TIMEZONE = 'America/Mexico_City';

function dateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) return null;
  return { year, month, day };
}

function addCalendarDays(value: string, amount: number) {
  const parts = dateParts(value);
  if (!parts) return null;
  const result = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + amount));
  return [
    result.getUTCFullYear(),
    String(result.getUTCMonth() + 1).padStart(2, '0'),
    String(result.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

// Convierte la medianoche civil del tenant a un instante absoluto. Así Vercel,
// el navegador y dispositivos ubicados en otra zona muestran el mismo corte.
function zonedMidnight(value: string, requestedTimezone?: string | null) {
  const parts = dateParts(value);
  if (!parts) return null;
  const timezones = [requestedTimezone, DEFAULT_PLATFORM_TIMEZONE, 'UTC'].filter(
    (timezone, index, all): timezone is string => Boolean(timezone) && all.indexOf(timezone) === index
  );

  for (const timezone of timezones) {
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      });
      const desired = Date.UTC(parts.year, parts.month - 1, parts.day);
      let guess = desired;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const representedParts = Object.fromEntries(
          formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value])
        );
        const represented = Date.UTC(
          Number(representedParts.year),
          Number(representedParts.month) - 1,
          Number(representedParts.day),
          Number(representedParts.hour),
          Number(representedParts.minute),
          Number(representedParts.second)
        );
        guess += desired - represented;
      }
      return new Date(guess);
    } catch {
      // Si un tenant legado tiene una zona inválida, probamos el valor seguro.
    }
  }
  return null;
}

export function getPlatformServiceEndDate(service: PlatformServiceSummary) {
  if (!service.fecha_inicio) return null;
  const duration = Number(service.duracion_dias || 30);
  if (!Number.isFinite(duration) || duration <= 0) return null;
  const endDateValue = addCalendarDays(service.fecha_inicio, duration);
  return endDateValue ? zonedMidnight(endDateValue, service.timezone) : null;
}

export function calculatePlatformServiceCountdown(
  service: PlatformServiceSummary,
  now = new Date()
): PlatformServiceCountdown {
  if (service.estado !== 'SI') {
    return { status: 'suspended', endDate: null, totalMilliseconds: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  if (!service.fecha_inicio) {
    return { status: 'no-date', endDate: null, totalMilliseconds: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }

  const endDate = getPlatformServiceEndDate(service);
  if (!endDate || Number.isNaN(endDate.getTime())) {
    return { status: 'no-date', endDate: null, totalMilliseconds: 0, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const totalMilliseconds = Math.max(0, endDate.getTime() - now.getTime());
  const status = totalMilliseconds > 0 ? 'active' : 'expired';

  return {
    status,
    endDate,
    totalMilliseconds,
    days: Math.floor(totalMilliseconds / (1000 * 60 * 60 * 24)),
    hours: Math.floor((totalMilliseconds / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((totalMilliseconds / (1000 * 60)) % 60),
    seconds: Math.floor((totalMilliseconds / 1000) % 60),
  };
}
