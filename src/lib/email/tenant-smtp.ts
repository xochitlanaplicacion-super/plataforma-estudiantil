import 'server-only';

import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export interface TenantSmtpServiceConfig {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from_name: string;
  activo: boolean;
}

/**
 * Recupera el secreto SMTP exclusivamente dentro del backend.
 * No es una Server Action y, por tanto, no puede ser invocada desde el cliente.
 */
export async function getTenantSmtpConfigForService(
  tenantId: string
): Promise<TenantSmtpServiceConfig | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('get_tenant_smtp_for_service', {
    p_tenant_id: tenantId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) || null;
}
