'use server';

import { revalidatePath } from 'next/cache';
import { sendWelcomeEmail, sendDocumentReminderEmail } from '@/lib/email';
import { requireTenantSession, type TenantRole } from '@/lib/tenant/context';

const emptyToNull = (value: any) => {
  if (typeof value === 'string' && value.trim() === '') return null;
  return value === undefined ? null : value;
};

function assertManageableRole(actor: TenantRole, requested: unknown) {
  const role = requested as TenantRole;
  const allowed: TenantRole[] = actor === 'superuser'
    ? ['superuser', 'admin', 'profesor', 'alumno']
    : ['profesor', 'alumno'];
  if (!allowed.includes(role)) throw new Error('No tienes permiso para asignar ese rol');
  return role;
}

async function getAcademicNames(admin: any, tenantId: string, userData: any) {
  let carreraNombre: string | null = null;
  let nivelNombre: string | null = null;
  if (userData.carrera_id) {
    const { data } = await admin.from('carreras')
      .select('nombre, niveles(id, nombre)')
      .eq('tenant_id', tenantId)
      .eq('id', userData.carrera_id)
      .single();
    carreraNombre = data?.nombre || null;
    nivelNombre = data?.niveles?.nombre || null;
  }
  if (!nivelNombre && userData.nivel_estudios) {
    const { data } = await admin.from('niveles')
      .select('nombre')
      .eq('tenant_id', tenantId)
      .eq('id', userData.nivel_estudios)
      .single();
    nivelNombre = data?.nombre || null;
  }
  return { carreraNombre, nivelNombre };
}

export async function createUserWithProfile(userData: any, aspiranteId?: string) {
  let createdUserId: string | null = null;
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const role = assertManageableRole(context.profile.rol, userData.rol);
    const email = String(userData.email || '').toLowerCase().trim();
    const curp = String(userData.curp || '').toUpperCase().trim();
    if (!email || !curp || !userData.password) throw new Error('Correo, CURP y contraseña son obligatorios');

    const { data: duplicate } = await context.admin.from('profiles')
      .select('id, email, curp')
      .eq('tenant_id', context.tenantId)
      .or(`email.eq.${email},curp.eq.${curp}`)
      .limit(1)
      .maybeSingle();
    if (duplicate?.email === email) throw new Error(`El correo ${email} ya está registrado en esta institución.`);
    if (duplicate?.curp === curp) throw new Error(`La CURP ${curp} ya está asignada en esta institución.`);

    if (role === 'profesor') {
      const { count, error } = await context.admin.from('profiles')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', context.tenantId)
        .eq('rol', 'profesor')
        .neq('estatus', 'inactivo');
      if (error) throw error;
      if ((count || 0) >= 15) throw new Error('Límite de 15 profesores activos alcanzado para esta institución.');
    }

    const { data: authData, error: authError } = await context.admin.auth.admin.createUser({
      email,
      password: userData.password,
      email_confirm: true,
      app_metadata: { tenant_id: context.tenantId, role },
      user_metadata: {
        nombre: userData.nombre,
        apellidos: userData.apellidos,
        curp,
      },
    });
    if (authError) throw new Error(`Error en Autenticación: ${authError.message}`);
    createdUserId = authData.user.id;

    const profileData = {
      id: createdUserId,
      tenant_id: context.tenantId,
      nombre: String(userData.nombre || '').toUpperCase().trim(),
      apellidos: String(userData.apellidos || '').toUpperCase().trim(),
      email,
      curp,
      rol: role,
      estatus: userData.estatus || 'activo',
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      fecha_nacimiento: emptyToNull(userData.fecha_nacimiento),
      genero: emptyToNull(userData.genero),
      carrera_id: emptyToNull(userData.carrera_id),
      doc_acta_nacimiento: !!userData.doc_acta_nacimiento,
      doc_certificado_estudios: !!userData.doc_certificado_estudios,
      doc_curp: !!userData.doc_curp,
      doc_ine: !!userData.doc_ine,
    };
    const { error: profileError } = await context.admin.from('profiles').upsert(profileData, { onConflict: 'id' });
    if (profileError) throw new Error(`Error en Perfil: ${profileError.message}`);

    if (aspiranteId) {
      await context.admin.from('aspirantes').update({ estatus: 'inscrito' })
        .eq('tenant_id', context.tenantId).eq('id', aspiranteId);
    }

    const academic = await getAcademicNames(context.admin, context.tenantId, userData);
    const emailResult = await sendWelcomeEmail({
      tenantId: context.tenantId,
      to: email,
      nombre: userData.nombre,
      apellidos: userData.apellidos,
      rol: role,
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      password: userData.password,
      genero: userData.genero,
      nivel: academic.nivelNombre,
      carreraNombre: academic.carreraNombre,
    });

    revalidatePath('/dashboard/admin/crm/aspirantes');
    revalidatePath('/dashboard/admin/usuarios');
    return emailResult.success ? { success: true } : { success: true, warning: emailResult.error };
  } catch (error: any) {
    if (createdUserId) {
      try {
        const context = await requireTenantSession(['superuser', 'admin']);
        await context.admin.auth.admin.deleteUser(createdUserId);
      } catch { /* best-effort compensation */ }
    }
    return { success: false, error: error.message || 'No se pudo crear el usuario.' };
  }
}

export async function updateUserProfile(id: string, userData: any) {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const { data: currentProfile, error: currentError } = await context.admin.from('profiles')
      .select('id, tenant_id, estatus, email, nombre, apellidos, rol, matricula, genero, carrera_id')
      .eq('tenant_id', context.tenantId).eq('id', id).single();
    if (currentError || !currentProfile) throw new Error('Usuario no encontrado en esta institución');

    const role = assertManageableRole(context.profile.rol, userData.rol || currentProfile.rol);
    const incomingEmail = String(userData.email || currentProfile.email).toLowerCase().trim();
    if (incomingEmail !== currentProfile.email) {
      const { data: existing } = await context.admin.from('profiles').select('id')
        .eq('tenant_id', context.tenantId).eq('email', incomingEmail).neq('id', id).maybeSingle();
      if (existing) throw new Error(`El correo ${incomingEmail} ya está registrado en esta institución.`);
    }

    const authChanges: Record<string, any> = {
      email: incomingEmail,
      email_confirm: true,
      app_metadata: { tenant_id: context.tenantId, role },
    };
    if (userData.password) authChanges.password = userData.password;
    const { error: authError } = await context.admin.auth.admin.updateUserById(id, authChanges);
    if (authError) throw authError;

    const today = new Date().toISOString().slice(0, 10);
    let status = userData.estatus || currentProfile.estatus;
    if (userData.fecha_expiracion) {
      if (userData.fecha_expiracion < today) status = 'inactivo';
      else if (currentProfile.estatus === 'inactivo') status = 'activo';
    }

    const updateData = {
      nombre: String(userData.nombre || currentProfile.nombre).toUpperCase().trim(),
      apellidos: String(userData.apellidos || currentProfile.apellidos).toUpperCase().trim(),
      email: incomingEmail,
      curp: String(userData.curp || '').toUpperCase().trim(),
      rol: role,
      estatus: status,
      telefono: emptyToNull(userData.telefono),
      matricula: emptyToNull(userData.matricula),
      numero_empleado: emptyToNull(userData.numero_empleado),
      fecha_expiracion: emptyToNull(userData.fecha_expiracion),
      fecha_nacimiento: emptyToNull(userData.fecha_nacimiento),
      genero: emptyToNull(userData.genero),
      carrera_id: emptyToNull(userData.carrera_id),
      doc_acta_nacimiento: !!userData.doc_acta_nacimiento,
      doc_certificado_estudios: !!userData.doc_certificado_estudios,
      doc_curp: !!userData.doc_curp,
      doc_ine: !!userData.doc_ine,
    };
    const { error } = await context.admin.from('profiles').update(updateData)
      .eq('tenant_id', context.tenantId).eq('id', id);
    if (error) throw error;

    const isReactivated = currentProfile.estatus === 'inactivo' && status === 'activo';
    const isExpiring = currentProfile.estatus === 'activo' && status === 'inactivo';
    if (isReactivated || isExpiring || !!userData.password) {
      const academic = await getAcademicNames(context.admin, context.tenantId, userData);
      const emailResult = await sendWelcomeEmail({
        tenantId: context.tenantId,
        to: incomingEmail,
        nombre: updateData.nombre,
        apellidos: updateData.apellidos,
        rol: role,
        matricula: updateData.matricula,
        numero_empleado: updateData.numero_empleado,
        password: userData.password || null,
        genero: updateData.genero,
        nivel: academic.nivelNombre,
        carreraNombre: academic.carreraNombre,
        isReactivation: isReactivated,
        isExpiration: isExpiring,
      });
      revalidatePath('/dashboard/admin/usuarios');
      return emailResult.success ? { success: true } : { success: true, warning: emailResult.error };
    }

    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function updateCRMStatus(table: 'mensajes_contacto' | 'aspirantes', id: string, data: { estatus?: string; notas?: string }) {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const { error } = await context.admin.from(table).update(data)
      .eq('tenant_id', context.tenantId).eq('id', id);
    if (error) throw error;
    revalidatePath(`/dashboard/admin/crm/${table === 'mensajes_contacto' ? 'mensajes' : 'aspirantes'}`);
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function deleteUserAccount(id: string) {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    if (id === context.user.id) throw new Error('No puedes eliminar tu propia cuenta');
    const { data: target } = await context.admin.from('profiles').select('id, rol')
      .eq('tenant_id', context.tenantId).eq('id', id).single();
    if (!target) throw new Error('Usuario no encontrado en esta institución');
    assertManageableRole(context.profile.rol, target.rol);
    const { error } = await context.admin.auth.admin.deleteUser(id);
    if (error) throw error;
    revalidatePath('/dashboard/admin/usuarios');
    return { success: true };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function resendWelcomeEmailAction(id: string) {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const { data: profile } = await context.admin.from('profiles').select('*')
      .eq('tenant_id', context.tenantId).eq('id', id).single();
    if (!profile) throw new Error('Perfil no encontrado');

    const { data: linkData, error: linkError } = await context.admin.auth.admin.generateLink({
      type: 'recovery',
      email: profile.email,
      options: { redirectTo: undefined },
    });
    if (linkError) throw linkError;
    const academic = await getAcademicNames(context.admin, context.tenantId, profile);
    return await sendWelcomeEmail({
      tenantId: context.tenantId,
      to: profile.email,
      nombre: profile.nombre,
      apellidos: profile.apellidos,
      rol: profile.rol,
      matricula: profile.matricula,
      numero_empleado: profile.numero_empleado,
      genero: profile.genero,
      nivel: academic.nivelNombre,
      carreraNombre: academic.carreraNombre,
      accessUrl: linkData.properties?.action_link || null,
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

export async function sendDocReminderAction(id: string) {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const { data: profile } = await context.admin.from('profiles').select('*')
      .eq('tenant_id', context.tenantId).eq('id', id).single();
    if (!profile) throw new Error('No se encontró el perfil');
    const faltantes: string[] = [];
    if (!profile.doc_acta_nacimiento) faltantes.push('Acta de Nacimiento');
    if (!profile.doc_certificado_estudios) faltantes.push('Certificado de Estudios');
    if (!profile.doc_curp) faltantes.push('CURP (Documento)');
    if (!profile.doc_ine) faltantes.push('Identificación Oficial (INE)');
    if (!faltantes.length) throw new Error('El usuario ya entregó todo.');
    return await sendDocumentReminderEmail({
      tenantId: context.tenantId,
      to: profile.email,
      nombre: `${profile.nombre} ${profile.apellidos}`,
      faltantes,
    });
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}
