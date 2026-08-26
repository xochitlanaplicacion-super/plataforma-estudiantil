import { describe, expect, it } from 'vitest';

import { buildSmtpSubmission } from '@/lib/institution/smtp-settings';

const original = {
  host: 'smtp.gmail.com',
  port: 465,
  user: 'correo@escuela.test',
  fromName: 'Servicios Escolares',
};

describe('buildSmtpSubmission', () => {
  it('no envía campos SMTP cuando nada cambió', () => {
    expect(buildSmtpSubmission(original, { ...original }, '')).toBeNull();
  });

  it('conserva el secreto cuando cambia metadata y la nueva contraseña queda vacía', () => {
    expect(buildSmtpSubmission(
      original,
      { ...original, fromName: 'Dirección Escolar' },
      ''
    )).toEqual({
      smtp_host: 'smtp.gmail.com',
      smtp_port: 465,
      smtp_user: 'correo@escuela.test',
      smtp_from_name: 'Dirección Escolar',
    });
  });

  it('envía una contraseña únicamente cuando el administrador escribe una nueva', () => {
    const result = buildSmtpSubmission(original, { ...original }, 'nuevo-secreto');
    expect(result).toMatchObject({ smtp_password: 'nuevo-secreto' });
  });

  it('normaliza metadata sin convertir una contraseña en marcador de interfaz', () => {
    expect(buildSmtpSubmission(
      original,
      {
        host: ' smtp.office365.com ',
        port: 587,
        user: ' correo@escuela.test ',
        fromName: ' Servicios Escolares ',
      },
      ''
    )).toEqual({
      smtp_host: 'smtp.office365.com',
      smtp_port: 587,
      smtp_user: 'correo@escuela.test',
      smtp_from_name: 'Servicios Escolares',
    });
  });
});
