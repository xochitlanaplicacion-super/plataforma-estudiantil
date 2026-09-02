import 'server-only';

import nodemailer from 'nodemailer';
import { normalizeSmtpPassword, smtpErrorMessage } from '@/lib/email/smtp-utils';

export { normalizeSmtpPassword, smtpErrorMessage } from '@/lib/email/smtp-utils';

export interface SmtpTransportConfig {
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_user?: string | null;
  smtp_password?: string | null;
}

export function createSmtpTransporter(smtp: SmtpTransportConfig) {
  const host = smtp.smtp_host?.trim() || 'smtp.gmail.com';
  const port = smtp.smtp_port || 465;
  const user = smtp.smtp_user?.trim() || '';
  const password = normalizeSmtpPassword(host, smtp.smtp_password || '');
  if (!user || !password) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function verifySmtpConfig(smtp: SmtpTransportConfig): Promise<void> {
  const transporter = createSmtpTransporter(smtp);
  if (!transporter) throw new Error('Faltan el correo SMTP o la contraseña de aplicación.');
  try {
    await transporter.verify();
  } catch (error) {
    throw new Error(smtpErrorMessage(error, smtp.smtp_user));
  } finally {
    transporter.close();
  }
}
