export interface SmtpSettingsSnapshot {
  host: string;
  port: number;
  user: string;
  fromName: string;
}

export interface SmtpSettingsSubmission {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_from_name: string;
  smtp_password?: string;
}

function normalizeText(value: string) {
  return value.trim();
}

export function normalizeSmtpSettings(
  settings: SmtpSettingsSnapshot
): SmtpSettingsSnapshot {
  return {
    host: normalizeText(settings.host) || 'smtp.gmail.com',
    port: settings.port,
    user: normalizeText(settings.user),
    fromName: normalizeText(settings.fromName),
  };
}

export function buildSmtpSubmission(
  original: SmtpSettingsSnapshot | null,
  current: SmtpSettingsSnapshot,
  newPassword: string
): SmtpSettingsSubmission | null {
  const normalizedCurrent = normalizeSmtpSettings(current);
  const normalizedOriginal = original ? normalizeSmtpSettings(original) : null;
  const settingsChanged = !normalizedOriginal
    || normalizedCurrent.host !== normalizedOriginal.host
    || normalizedCurrent.port !== normalizedOriginal.port
    || normalizedCurrent.user !== normalizedOriginal.user
    || normalizedCurrent.fromName !== normalizedOriginal.fromName;

  if (!settingsChanged && newPassword.length === 0) return null;

  return {
    smtp_host: normalizedCurrent.host,
    smtp_port: normalizedCurrent.port,
    smtp_user: normalizedCurrent.user,
    smtp_from_name: normalizedCurrent.fromName,
    ...(newPassword.length > 0 ? { smtp_password: newPassword } : {}),
  };
}
