import { describe, expect, it } from 'vitest';

import { normalizeSmtpPassword, smtpErrorMessage } from '@/lib/email/smtp-utils';

describe('SMTP transport security and diagnostics', () => {
  it('elimina los espacios visuales de una contraseña de aplicación de Gmail', () => {
    expect(normalizeSmtpPassword('smtp.gmail.com', 'abcd efgh ijkl mnop'))
      .toBe('abcdefghijklmnop');
  });

  it('no modifica contraseñas de proveedores SMTP personalizados', () => {
    expect(normalizeSmtpPassword('smtp.example.test', 'secret with spaces'))
      .toBe('secret with spaces');
  });

  it('convierte EAUTH 535 en una instrucción segura y accionable', () => {
    const result = smtpErrorMessage(
      { code: 'EAUTH', responseCode: 535, response: 'respuesta interna sensible' },
      'correo@escuela.test'
    );
    expect(result).toContain('contraseña de aplicación');
    expect(result).toContain('correo@escuela.test');
    expect(result).not.toContain('respuesta interna sensible');
  });
});
