import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeFilterName, splitRosterText } from '@/lib/filter-control';

describe('Control de Filtro multitenant', () => {
  it('normaliza acentos, puntuación y espacios para búsqueda tolerante', () => {
    expect(normalizeFilterName('  García-López,  María José ')).toBe('garcia lopez maria jose');
  });

  it('convierte una columna numerada en nombres utilizables', () => {
    expect(splitRosterText('1. ANA PÉREZ\n  2 JUAN LÓPEZ\n\n3')).toEqual(['ANA PÉREZ', 'JUAN LÓPEZ']);
  });

  it('la migración vincula alumnos y retardos al mismo tenant y usa evidencia privada', () => {
    const sql = readFileSync('supabase/migrations/20260903014338_primary_filter_control.sql', 'utf8');
    expect(sql).toContain('primary_filter_enabled boolean not null default false');
    expect(sql).toContain('filter_late_student_tenant_fk foreign key (student_id, tenant_id)');
    expect(sql).toContain("values ('filtro-evidencias','filtro-evidencias',false");
    expect(sql).toContain("p.rol::text in ('superuser','admin','encargado_filtro')");
  });

  it('los tenants futuros reciben valores desactivados automáticamente', () => {
    const sql = readFileSync('supabase/migrations/20260903020943_primary_filter_tenant_defaults.sql', 'utf8');
    expect(sql).toContain('after insert on public.tenants');
    expect(sql).toContain('insert into public.tenant_features');
    expect(sql).toContain('insert into public.filter_alert_settings');
  });

  it('las salidas anticipadas conservan instantáneas académicas e idempotencia por tenant', () => {
    const sql = readFileSync('supabase/migrations/20260903044227_filter_early_departures.sql', 'utf8');
    expect(sql).toContain('unique (tenant_id, client_request_id)');
    expect(sql).toContain('filter_early_departure_student_tenant_fk foreign key (student_id, tenant_id)');
    expect(sql).toContain('identity_and_notification_confirmed boolean not null');
    expect(sql).toContain('revoke all on public.filter_early_departures from anon, authenticated');
    expect(sql).toContain('private.has_filter_access(tenant_id)');
  });

  it('el asistente preserva textos y fotos localmente y sólo limpia tras confirmación', () => {
    const component = readFileSync('src/components/filter/FilterEarlyDepartureWizard.tsx', 'utf8');
    const storage = readFileSync('src/lib/filter-early-departure-draft.ts', 'utf8');
    expect(component).toContain("status: 'queued'");
    expect(component).toContain('Confirmo que se verificó la identidad');
    expect(component).toContain('await clearEarlyDepartureDraft(draftScope)');
    expect(storage).toContain('identificationEvidence: PersistedFile | null');
    expect(storage).toContain('pickupPersonPhoto: PersistedFile | null');
    expect(storage).toContain('finalHandoverPhoto: PersistedFile | null');
    expect(storage).toContain('early-departure:${scope}');
  });

  it('retardos conserva el borrador del iPad y evita duplicados por tenant', () => {
    const component = readFileSync('src/components/filter/FilterLateLog.tsx', 'utf8');
    const storage = readFileSync('src/lib/filter-early-departure-draft.ts', 'utf8');
    const migration = readFileSync('supabase/migrations/20260904045312_filter_late_entry_idempotency.sql', 'utf8');
    expect(component).toContain('saveLateEntryDraft');
    expect(component).toContain("draftStatus === 'queued'");
    expect(component).toContain('clientRequestId');
    expect(storage).toContain('late-entry:${scope}');
    expect(migration).toContain('filter_late_entries_tenant_request_uidx');
    expect(migration).toContain('(tenant_id, client_request_id)');
  });

  it('restaura sin enviar y permite reiniciar retardos mediante deslizador', () => {
    const late = readFileSync('src/components/filter/FilterLateLog.tsx', 'utf8');
    const early = readFileSync('src/components/filter/FilterEarlyDepartureWizard.tsx', 'utf8');
    const extraordinary = readFileSync('src/components/filter/FilterExtraordinaryWizard.tsx', 'utf8');
    expect(late).toContain('Desliza hasta el final para confirmar');
    expect(late).toContain('Nada se enviará hasta que pulses Guardar');
    expect(early).toContain('Nada se enviará hasta que pulses Guardar');
    expect(extraordinary).toContain('Nada se enviará hasta que pulses Guardar');
    expect(late).not.toContain('draftStatus === \'queued\' && student?.id && !sending');
    expect(early).not.toContain('sendDraft(draft, true)');
    expect(extraordinary).not.toContain('send(draft, true)');
  });

  it('normaliza imágenes móviles y el PDF usa identidad y evidencias lado a lado', () => {
    const mobile = readFileSync('src/lib/mobile-evidence.ts', 'utf8');
    const report = readFileSync('src/components/filter/FilterReports.tsx', 'utf8');
    expect(mobile).toContain("canvas.toBlob(resolve, 'image/jpeg'");
    expect(mobile).toContain("'heic', 'heif'");
    expect(report).toContain('institution.logo_url');
    expect(report).toContain("const x=i===0?12:107");
    expect(report).toContain('Firma de la persona que recibe al alumno');
  });
});
