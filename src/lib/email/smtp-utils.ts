export function normalizeSmtpPassword(host: string, password: string): string {
  return /(^|\.)gmail\.com$/i.test(host.trim())
    ? password.replace(/\s+/g, '')
    : password;
}

export function smtpErrorMessage(error: unknown, smtpUser?: string | null): string {
  const value = error as { code?: string; responseCode?: number } | null;
  const account = smtpUser?.trim() ? ` para ${smtpUser.trim()}` : '';

  if (value?.code === 'EAUTH' || value?.responseCode === 535) {
    return `Gmail rechazó las credenciales SMTP${account}. Genera una nueva contraseña de aplicación en esa cuenta (no uses la contraseña normal), escríbela en Datos de la Institución y prueba la conexión.`;
  }
  if (value?.code === 'ETIMEDOUT' || value?.code === 'ESOCKET' || value?.code === 'ECONNECTION') {
    return 'No fue posible conectar con el servidor SMTP. Revisa el host, el puerto y la conexión, y vuelve a probar.';
  }
  return 'El servidor SMTP rechazó la conexión. Revisa el correo, la contraseña de aplicación, el host y el puerto.';
}
