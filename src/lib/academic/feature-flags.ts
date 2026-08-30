export interface AcademicFeatureFlagEnvironment {
  ACADEMIC_GRADING_V2_ENABLED?: string;
  ACADEMIC_GRADING_V2_TENANTS?: string;
}
export interface AcademicFeatureFlagContext {
  tenantId: string;
  tenantSlug: string;
}

export type AcademicRolloutMode = 'legacy' | 'dual' | 'canonical';

function enabled(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(value?.trim().toLowerCase() ?? '');
}

/**
 * Sin override de servidor, el rollout persistente decide por tenant y sigue
 * siendo deny-by-default (`legacy`/sin fila = apagado). Un override explícito
 * conserva el apagado de emergencia y la allowlist histórica.
 */
export function isAcademicGradingV2Enabled(
  context: AcademicFeatureFlagContext,
  environment: AcademicFeatureFlagEnvironment,
  rolloutMode: AcademicRolloutMode | null = null,
): boolean {
  const explicitSwitch = environment.ACADEMIC_GRADING_V2_ENABLED?.trim();
  if (!explicitSwitch) {
    return rolloutMode === 'dual' || rolloutMode === 'canonical';
  }
  if (!enabled(explicitSwitch)) return false;
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
