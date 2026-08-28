export interface AcademicFeatureFlagEnvironment {
  ACADEMIC_GRADING_V2_ENABLED?: string;
  ACADEMIC_GRADING_V2_TENANTS?: string;
}
export interface AcademicFeatureFlagContext {
  tenantId: string;
  tenantSlug: string;
}

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

/**
 * El flag es deny-by-default y sólo consume variables de servidor. La lista
 * acepta UUID o slug; `*` habilita todos los tenants únicamente si el switch
 * global también está encendido.
 */
export function isAcademicGradingV2Enabled(
  context: AcademicFeatureFlagContext,
  environment: AcademicFeatureFlagEnvironment,
): boolean {
  if (!enabled(environment.ACADEMIC_GRADING_V2_ENABLED)) return false;
  const allowlist = new Set(
    (environment.ACADEMIC_GRADING_V2_TENANTS ?? '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  if (allowlist.has('*')) return true;
  return allowlist.has(context.tenantId.toLowerCase())
    || allowlist.has(context.tenantSlug.toLowerCase());
}
