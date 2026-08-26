import { describe, expect, it } from 'vitest';
import { getHostnameCandidates, normalizeHostname } from '@/lib/tenant/hostname';

describe('resolución segura de dominios apex/www', () => {
  it('normaliza protocolo, ruta, puerto, mayúsculas y punto final', () => {
    expect(normalizeHostname(' HTTPS://WWW.ESCUELA-EJEMPLO.EDU:443/ruta. '))
      .toBe('www.escuela-ejemplo.edu');
  });

  it('prefiere siempre el hostname exacto antes del alterno', () => {
    expect(getHostnameCandidates('www.escuela-ejemplo.edu')).toEqual([
      'www.escuela-ejemplo.edu',
      'escuela-ejemplo.edu',
    ]);
    expect(getHostnameCandidates('escuela-ejemplo.edu')).toEqual([
      'escuela-ejemplo.edu',
      'www.escuela-ejemplo.edu',
    ]);
  });

  it('no inventa variantes para desarrollo local', () => {
    expect(getHostnameCandidates('localhost:9002')).toEqual(['localhost']);
    expect(getHostnameCandidates('tenant.localhost:9002')).toEqual(['tenant.localhost']);
  });
});
