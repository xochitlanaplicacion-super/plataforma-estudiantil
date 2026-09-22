import { createClient } from 'npm:@supabase/supabase-js@2.99.1';

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response(null, { status: 405 });
  const authorization = request.headers.get('Authorization') ?? '';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: auth, error: authError } = await db.auth.getUser();
  if (authError || !auth.user) return Response.json({ error: 'Sesión inválida.' }, { status: 401 });
  try {
    const { assignmentId, exerciseId, studentId, download } = await request.json();
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (![assignmentId, exerciseId, studentId].every(id => typeof id === 'string' && uuid.test(id))) {
      return Response.json({ error: 'Solicitud inválida.' }, { status: 400 });
    }
    // Authenticate AND authorize through the existing tenant/teacher/group catalogue.
    const { data: catalogue, error } = await db.rpc('obtener_tareas_descriptivas_docente_movil', { p_asignacion_id: assignmentId });
    const task = catalogue?.tasks?.find((row: { id: string }) => row.id === exerciseId);
    const student = task?.students?.find((row: { studentId: string; provisionalId?: string }) => row.studentId === studentId && !row.provisionalId);
    if (error || !student) return Response.json({ error: 'No tienes acceso a esta entrega.' }, { status: 403 });
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
    const { data: profile } = await admin.from('profiles').select('tenant_id').eq('id', auth.user.id).single();
    const { data: result, error: resultError } = await admin.from('resultados_ejercicios')
      .select('archivo_path,archivo_nombre,caduca_el').eq('tenant_id', profile?.tenant_id)
      .eq('ejercicio_id', exerciseId).eq('alumno_id', studentId).eq('inscripcion_alumno_id', student.enrollmentId).maybeSingle();
    if (resultError || !result?.archivo_path || !result.archivo_path.startsWith(`${profile?.tenant_id}/entregas/`)) {
      return Response.json({ error: 'La entrega no tiene archivo disponible.' }, { status: 404 });
    }
    if (result.caduca_el && Date.parse(result.caduca_el) <= Date.now()) {
      return Response.json({ error: 'El archivo de esta entrega ya caducó.' }, { status: 410 });
    }
    const { data, error: signingError } = await admin.storage.from('entregas-alumnos')
      .createSignedUrl(result.archivo_path, 300, download ? { download: result.archivo_nombre || true } : {});
    if (signingError || !data) throw new Error('STORAGE_UNAVAILABLE');
    return Response.json({ url: data.signedUrl, filename: result.archivo_nombre || 'entrega' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'No fue posible abrir el archivo. Intenta nuevamente.' }, { status: 500 });
  }
});
