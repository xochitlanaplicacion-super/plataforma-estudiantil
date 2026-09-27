import { beforeEach, describe, expect, it, vi } from 'vitest';

const tenantId = 'tenant-test';
const studentId = 'student-test';
const exerciseId = '70fdfd88-30b3-46c7-889a-16e2a390662a';
const enrollmentId = 'enrollment-current';
const linkId = 'link-current';
const unitId = 'unit-current';
const prefix = `${tenantId}/entregas/${studentId}/${exerciseId}/`;
const oldPhoto = `${prefix}old-single-photo`;
const oldPdf = `${prefix}old-document`;
const documentPath = `${prefix}e234b3dd-7142-4c89-88a3-ed8405b04556`;
const document = {
  ejercicioId: exerciseId, archivoNombre: 'tarea-corregida.pdf',
  archivoTipo: 'application/pdf', archivoTamano: 1_000_000,
  archivoPath: documentPath, uploadIntentId: 'intent-document',
};
const photos = Array.from({ length: 6 }, (_, index) => ({
  ejercicioId: exerciseId, archivoNombre: `foto-${index + 1}.jpg`,
  archivoTipo: 'image/jpeg', archivoTamano: 120_000 + index,
}));
const uploaded = photos.map((photo, index) => ({
  path: `${prefix}new-photo-${index + 1}`, name: photo.archivoNombre,
  mime: photo.archivoTipo, size: photo.archivoTamano,
}));
type ResultMutation = {
  operation: 'update' | 'insert' | 'upsert';
  values: Record<string, unknown>;
  filters: Record<string, unknown>;
};
const state = {
  mode: 'photos' as 'photos' | 'document',
  intentStatus: 'pending' as 'pending' | 'confirmed',
  newPhotoCount: 6,
  versionConflict: false,
  firstSubmission: '',
  existing: null as Record<string, unknown> | null,
  resultMutation: null as ResultMutation | null,
  removed: [] as string[][],
  intentUpdates: [] as Record<string, unknown>[],
};

function existingResult(path: string) {
  return {
    id: 'result-existing', row_version: 7,
    archivo_path: path, fotos_json: null,
    primer_envio_en: state.firstSubmission,
    caduca_el: new Date(Date.now() + 9 * 86_400_000).toISOString(),
    calificacion: null,
    inscripcion_alumno_id: enrollmentId, vinculo_evaluacion_id: linkId,
    unidad_origen_id: unitId, origen: 'descriptiveSubmission',
  };
}

function queryFor(table: string) {
  let action: 'read' | 'update' | 'insert' | 'upsert' = 'read';
  const filters: Record<string, unknown> = {};
  const mutationResponse = () => {
    if (table === 'student_submission_upload_intents') {
      return { data: { id: state.mode === 'photos' ? 'intent-six-photos' : 'intent-document' }, error: null };
    }
    const mutation = state.resultMutation;
    if (table !== 'resultados_ejercicios' || !mutation) throw new Error(`Unexpected mutation: ${table}`);
    if (action === 'upsert') {
      // Un BEFORE INSERT ve una fila incompleta antes de que ON CONFLICT
      // decida actualizar el resultado existente.
      return { data: null, error: {
        message: 'El resultado no coincide con su inscripcion, vinculo o unidad de origen',
      } };
    }
    if (action === 'update') {
      const existing = state.existing;
      const exactRow = filters.id === existing?.id && filters.row_version === existing?.row_version;
      const preservesProvenance = [
        'inscripcion_alumno_id', 'vinculo_evaluacion_id', 'unidad_origen_id', 'origen',
      ].every((key) => !(key in mutation.values));
      return exactRow && preservesProvenance && state.versionConflict
        ? { data: null, error: null }
        : exactRow && preservesProvenance
        ? { data: { id: existing?.id, row_version: 8 }, error: null }
        : { data: null, error: { message: 'La actualización no conservó el resultado académico original' } };
    }
    const values = mutation.values;
    const canonical = !state.existing && values.inscripcion_alumno_id === enrollmentId
      && values.vinculo_evaluacion_id === linkId && values.unidad_origen_id === unitId
      && values.origen === 'descriptiveSubmission';
    return canonical
      ? { data: { id: 'result-new', row_version: 1 }, error: null }
      : { data: null, error: { message: 'Falta procedencia académica de la entrega nueva' } };
  };
  return {
    select() { return this; },
    eq(key: string, value: unknown) { filters[key] = value; return this; },
    is(key: string, value: unknown) { filters[key] = value; return this; },
    in() { return this; },
    limit() { return this; },
    update(values: Record<string, unknown>) {
      action = 'update';
      if (table === 'student_submission_upload_intents') state.intentUpdates.push(values);
      if (table === 'resultados_ejercicios') state.resultMutation = { operation: action, values, filters };
      return this;
    },
    insert(values: Record<string, unknown>) {
      action = 'insert';
      if (table !== 'resultados_ejercicios') throw new Error(`Unexpected insert: ${table}`);
      state.resultMutation = { operation: action, values, filters };
      return this;
    },
    upsert(values: Record<string, unknown>) {
      action = 'upsert';
      if (table !== 'resultados_ejercicios') throw new Error(`Unexpected upsert: ${table}`);
      state.resultMutation = { operation: action, values, filters };
      return this;
    },
    async maybeSingle() {
      if (action !== 'read') return mutationResponse();
      if (table === 'student_submission_upload_intents') return { data: state.mode === 'photos' ? {
        id: 'intent-six-photos', photo_files: uploaded.slice(0, state.newPhotoCount),
        object_path: uploaded[0].path, status: state.intentStatus,
        expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      } : {
        id: 'intent-document', object_path: documentPath,
        original_name: document.archivoNombre, content_type: document.archivoTipo,
        size_bytes: document.archivoTamano, status: 'pending',
        expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
      }, error: null };
      if (table === 'ejercicios') return { data: {
        id: exerciseId, tipo: 'actividad_descriptiva', fecha_entrega: null,
        temas: { unidad_id: unitId },
      }, error: null };
      if (table === 'resultados_ejercicios') return { data: state.existing, error: null };
      if (table === 'vinculos_evaluacion_ejercicio') return { data: {
        id: linkId, ciclo_escolar_id: 'cycle-current', asignacion_profesor_id: 'assignment-current',
      }, error: null };
      if (table === 'asignaciones_profesor') return { data: { grupo_id: 'group-current' }, error: null };
      if (table === 'inscripciones_alumno') return { data: { id: enrollmentId }, error: null };
      throw new Error(`Unexpected table: ${table}`);
    },
    single() { return this.maybeSingle(); },
    then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
      return Promise.resolve(mutationResponse()).then(resolve, reject);
    },
  };
}

const admin = {
  from: vi.fn((table: string) => queryFor(table)),
  storage: { from: vi.fn(() => ({
    list: vi.fn(async (_directory: string, options: { search: string }) => {
      const photo = uploaded.find((item) => item.path.endsWith(options.search));
      const stored = photo ? { name: options.search, metadata: { size: photo.size, mimetype: photo.mime } }
        : options.search === documentPath.split('/').at(-1)
          ? { name: options.search, metadata: { size: document.archivoTamano, mimetype: document.archivoTipo } }
          : null;
      return { data: stored ? [stored] : [], error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      state.removed.push(paths);
      return { data: paths, error: null };
    }),
  })) },
};
const supabase = { from: vi.fn((table: string) => queryFor(table)) };

vi.mock('@/lib/tenant/context', () => ({ requireTenantSession: vi.fn(async () => ({
  supabase, admin, tenantId, user: { id: studentId },
})) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: vi.fn() }));
vi.mock('@/lib/notifications/submission-push', () => ({ dispatchSubmissionPush: vi.fn() }));

import { confirmarCargaEntregaAlumno, confirmarCargaFotosAlumno } from '@/lib/actions/entregas';

describe('reenvío de entregas descriptivas', () => {
  beforeEach(() => {
    state.mode = 'photos';
    state.intentStatus = 'pending';
    state.newPhotoCount = 6;
    state.versionConflict = false;
    state.firstSubmission = new Date(Date.now() - 86_400_000).toISOString();
    state.existing = existingResult(oldPhoto);
    state.resultMutation = null;
    state.removed = [];
    state.intentUpdates = [];
    admin.from.mockClear();
    supabase.from.mockClear();
  });

  it('reemplaza una foto anterior por seis con UPDATE sin cambiar su procedencia', async () => {
    const result = await confirmarCargaFotosAlumno({
      ejercicioId: exerciseId, uploadIntentId: 'intent-six-photos', fotos: photos,
    });
    expect(result).toMatchObject({ success: true, fotos_json: uploaded.map(({ path, name }) => ({ path, name })) });
    expect(state.resultMutation).toMatchObject({
      operation: 'update', filters: { id: 'result-existing', row_version: 7 },
      values: { primer_envio_en: state.firstSubmission, archivo_path: uploaded[0].path,
        fotos_json: uploaded.map(({ path, name }) => ({ path, name })) },
    });
    expect(state.removed).toEqual([[oldPhoto]]);
    expect(state.intentUpdates.some((update) => update.status === 'confirmed')).toBe(true);
  });

  it.each([[3, 5], [10, 4]])(
    'reemplaza la galería completa de %i fotos por %i y conserva la fecha original',
    async (previousCount, nextCount) => {
      state.newPhotoCount = nextCount;
      const previous = Array.from({ length: previousCount }, (_, index) => ({
        path: `${prefix}old-photo-${index + 1}`, name: `anterior-${index + 1}.jpg`,
      }));
      state.existing = { ...existingResult(previous[0].path), fotos_json: previous };

      const result = await confirmarCargaFotosAlumno({
        ejercicioId: exerciseId, uploadIntentId: 'intent-six-photos', fotos: photos.slice(0, nextCount),
      });

      expect(result).toMatchObject({
        success: true,
        fotos_json: uploaded.slice(0, nextCount).map(({ path, name }) => ({ path, name })),
      });
      expect(state.resultMutation).toMatchObject({ operation: 'update', values: {
        archivo_nombre: `${nextCount} fotos`,
        archivo_path: uploaded[0].path,
        fotos_json: uploaded.slice(0, nextCount).map(({ path, name }) => ({ path, name })),
        primer_envio_en: state.firstSubmission,
      } });
      expect(state.removed).toEqual([previous.map((photo) => photo.path)]);
    },
  );

  it('no borra la galería previa cuando otra petición cambia la versión del resultado', async () => {
    state.newPhotoCount = 4;
    state.versionConflict = true;
    const previous = Array.from({ length: 10 }, (_, index) => ({
      path: `${prefix}old-photo-${index + 1}`, name: `anterior-${index + 1}.jpg`,
    }));
    state.existing = { ...existingResult(previous[0].path), fotos_json: previous };

    const result = await confirmarCargaFotosAlumno({
      ejercicioId: exerciseId, uploadIntentId: 'intent-six-photos', fotos: photos.slice(0, 4),
    });

    expect(result).toMatchObject({ error: expect.stringMatching(/cambió mientras se guardaba/) });
    expect(state.removed).toEqual([]);
    expect(state.intentUpdates.some((update) => update.status === 'pending')).toBe(true);
    expect(state.intentUpdates.some((update) => update.status === 'confirmed')).toBe(false);
  });

  it('incluye procedencia completa al crear una galería nueva con INSERT', async () => {
    state.existing = null;
    const result = await confirmarCargaFotosAlumno({
      ejercicioId: exerciseId, uploadIntentId: 'intent-six-photos', fotos: photos,
    });
    expect(result).toMatchObject({ success: true });
    expect(state.resultMutation).toMatchObject({ operation: 'insert', values: {
      inscripcion_alumno_id: enrollmentId, vinculo_evaluacion_id: linkId,
      unidad_origen_id: unitId, origen: 'descriptiveSubmission',
      fotos_json: uploaded.map(({ path, name }) => ({ path, name })),
    } });
    expect(state.removed).toEqual([]);
  });

  it('reconoce un reintento tras confirmación sin volver a actualizar ni borrar fotos', async () => {
    state.intentStatus = 'confirmed';
    state.existing = {
      ...existingResult(uploaded[0].path),
      fotos_json: uploaded.map(({ path, name }) => ({ path, name })),
    };

    const result = await confirmarCargaFotosAlumno({
      ejercicioId: exerciseId, uploadIntentId: 'intent-six-photos', fotos: photos,
    });

    expect(result).toMatchObject({ success: true, alreadyConfirmed: true });
    expect(state.resultMutation).toBeNull();
    expect(state.removed).toEqual([]);
  });

  it('reemplaza también un PDF anterior con UPDATE sin tocar las claves académicas', async () => {
    state.mode = 'document';
    state.existing = existingResult(oldPdf);
    const result = await confirmarCargaEntregaAlumno(document);
    expect(result).toMatchObject({ success: true, archivo_path: documentPath });
    expect(state.resultMutation).toMatchObject({
      operation: 'update', filters: { id: 'result-existing', row_version: 7 },
      values: { archivo_path: documentPath, fotos_json: null, primer_envio_en: state.firstSubmission },
    });
    expect(state.removed).toEqual([[oldPdf]]);
  });
});
