'use server';

import { createHash } from 'node:crypto';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'];
const EVIDENCE = [...IMAGES, 'application/pdf'];
const hash = (token: string) => createHash('sha256').update(token).digest('hex');
const cleanToken = (token: string) => /^[A-Za-z0-9_-]{40,80}$/.test(token) ? token : '';
const validFile = (value: FormDataEntryValue | null, types: string[], required = true) => {
  if (!(value instanceof File) || !value.size) { if (required) throw new Error('Falta una evidencia obligatoria.'); return null; }
  if (value.size > 10 * 1024 * 1024 || !types.includes(value.type)) throw new Error('Archivo inválido o mayor a 10 MB.');
  return value;
};
const extension = (file: File) => file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';

async function resolveInvite(tokenInput: string) {
  const token = cleanToken(tokenInput); if (!token) throw new Error('Enlace inválido.');
  const admin = createSupabaseAdminClient();
  const { data: invite } = await admin.from('filter_family_invites').select('*, filter_students(id,full_name,group_id,active), tenants(nombre,estado)').eq('token_hash', hash(token)).maybeSingle();
  if (!invite || !invite.active || new Date(invite.expires_at) <= new Date() || invite.used_count >= invite.max_uses) throw new Error('El enlace venció, fue revocado o ya se utilizó. Solicita uno nuevo al plantel.');
  if (!(invite as any).filter_students?.active || (invite as any).tenants?.estado !== 'activo') throw new Error('El registro no está disponible.');
  return { admin, invite };
}

export async function getFamilyRegistrationContext(token: string) {
  try {
    const { admin, invite } = await resolveInvite(token);
    const student = (invite as any).filter_students;
    const [{ data: group }, { data: institution }] = await Promise.all([
      admin.from('filter_groups').select('grade_name,group_name,filter_levels(name)').eq('id', student.group_id).eq('tenant_id', invite.tenant_id).single(),
      admin.from('configuracion_sistema').select('nombre_completo,nombre_corto,logo_url,color_primario').eq('tenant_id', invite.tenant_id).maybeSingle(),
    ]);
    return { success: true, institutionName: institution?.nombre_completo || (invite as any).tenants.nombre, logoUrl: institution?.logo_url || null, primaryColor: institution?.color_primario || '#0f766e', studentName: student.full_name, academic: group ? `${(group as any).filter_levels?.name || ''} · ${group.grade_name} · Grupo ${group.group_name}` : '', expiresAt: invite.expires_at };
  } catch (error) { return { success: false, error: error instanceof Error ? error.message : 'Enlace inválido.' }; }
}

export async function submitFamilyRegistration(token: string, formData: FormData) {
  const uploaded: string[] = [];
  try {
    const { admin, invite } = await resolveInvite(token);
    const requestId = String(formData.get('clientRequestId') || '');
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error('Identificador de solicitud inválido.');
    const { data: duplicate } = await admin.from('filter_family_registrations').select('id').eq('tenant_id', invite.tenant_id).eq('client_request_id', requestId).maybeSingle();
    if (duplicate) return { success: true, duplicate: true };
    const text = (key: string, min: number, max: number) => { const value = String(formData.get(key) || '').trim(); if (value.length < min || value.length > max) throw new Error(`Revisa el campo ${key}.`); return value; };
    const relationship = text('relationship', 2, 20);
    if (!['madre','padre','tutor','otro'].includes(relationship)) throw new Error('Parentesco inválido.');
    if (formData.get('privacyConsent') !== 'true') throw new Error('Debes aceptar el aviso de privacidad del plantel.');
    const front = validFile(formData.get('identificationFront'), EVIDENCE)!;
    const back = validFile(formData.get('identificationBack'), EVIDENCE, false);
    const face = validFile(formData.get('facePhoto'), IMAGES)!;
    const signature = validFile(formData.get('signature'), ['image/png'])!;
    let people: Array<{ fullName: string; relationship: string; phone?: string; identificationReference?: string }> = [];
    try { people = JSON.parse(String(formData.get('authorizedPeople') || '[]')); } catch { throw new Error('La lista de personas autorizadas es inválida.'); }
    if (!Array.isArray(people) || people.length > 5) throw new Error('Puedes registrar hasta cinco personas autorizadas.');
    const base = `${invite.tenant_id}/familias/${requestId}`;
    const upload = async (file: File, name: string) => { const path = `${base}/${name}.${extension(file)}`; const { error } = await admin.storage.from('filtro-evidencias').upload(path, file, { upsert: true, contentType: file.type }); if (error) throw error; uploaded.push(path); return path; };
    const guardianName = text('guardianName', 2, 220); const phone = text('phone', 7, 30); const identificationReference = text('identificationReference', 2, 12);
    const relationshipOther = relationship === 'otro' ? text('relationshipOther', 2, 100) : '';
    const frontPath = await upload(front, 'identificacion-frente'); const backPath = back ? await upload(back, 'identificacion-reverso') : null;
    const facePath = await upload(face, 'rostro-tutor'); const signaturePath = await upload(signature, 'firma');
    const peopleRows: any[] = [];
    for (let index = 0; index < people.length; index++) {
      const person = people[index];
      if (!person?.fullName?.trim() || !person?.relationship?.trim()) throw new Error('Completa el nombre y parentesco de cada persona autorizada.');
      const photo = validFile(formData.get(`authorizedPhoto${index}`), IMAGES)!;
      const idFile = validFile(formData.get(`authorizedId${index}`), EVIDENCE, false);
      const photoPath = await upload(photo, `autorizado-${index}-rostro`); const idPath = idFile ? await upload(idFile, `autorizado-${index}-identificacion`) : null;
      peopleRows.push({ fullName: person.fullName.trim().slice(0, 220), relationship: person.relationship.trim().slice(0, 100), phone: person.phone?.trim() || '', identificationReference: person.identificationReference?.trim() || '', identificationPath: idPath || '', facePhotoPath: photoPath });
    }
    const { error } = await (admin as any).rpc('submit_filter_family_registration', { target_invite_id: invite.id, expected_tenant_id: invite.tenant_id, target_request_id: requestId, registration_data: { guardianName, relationship, relationshipOther, phone, email: String(formData.get('email') || '').trim(), identificationReference, identificationFrontPath: frontPath, identificationBackPath: backPath || '', facePhotoPath: facePath, signaturePath, privacyConsent: true }, people_data: peopleRows });
    if (error) throw error;
    return { success: true, duplicate: false };
  } catch (error) {
    if (uploaded.length) try { await createSupabaseAdminClient().storage.from('filtro-evidencias').remove(uploaded); } catch {}
    return { success: false, error: error instanceof Error ? error.message : 'No se pudo enviar el registro.' };
  }
}
