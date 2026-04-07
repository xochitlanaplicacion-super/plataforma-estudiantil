
'use server';

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import nodemailer from 'nodemailer';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
);

// ─── PLAN DE PAGOS (Gestión de Conceptos) ───────────────────────────────────

export async function getPlanPagos() {
  const { data, error } = await supabaseAdmin
    .from('plan_pagos')
    .select('*')
    .order('programa')
    .order('orden');
  if (error) return { success: false, error: error.message, data: [] };
  return { success: true, data: data || [] };
}

export async function createConceptoPago(data: {
  programa: string;
  nombre_concepto: string;
  orden: number;
  monto?: number | null;
}) {
  const { error } = await supabaseAdmin.from('plan_pagos').insert({
    programa: data.programa.toUpperCase().trim(),
    nombre_concepto: data.nombre_concepto.toUpperCase().trim(),
    orden: data.orden,
    monto: data.monto || null,
  });
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/admin/vigencias');
  return { success: true };
}

export async function updateConceptoPago(id: string, data: {
  nombre_concepto?: string;
  monto?: number | null;
  orden?: number;
  activo?: boolean;
}) {
  const { error } = await supabaseAdmin
    .from('plan_pagos')
    .update({
      ...(data.nombre_concepto !== undefined && { nombre_concepto: data.nombre_concepto.toUpperCase().trim() }),
      ...(data.monto !== undefined && { monto: data.monto }),
      ...(data.orden !== undefined && { orden: data.orden }),
      ...(data.activo !== undefined && { activo: data.activo }),
    })
    .eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/admin/vigencias');
  return { success: true };
}

export async function deleteConceptoPago(id: string) {
  // Verificar si tiene pagos asociados
  const { count } = await supabaseAdmin
    .from('pagos_alumno')
    .select('*', { count: 'exact', head: true })
    .eq('plan_pago_id', id)
    .eq('estatus', 'pagado');

  if (count && count > 0) {
    return { success: false, error: 'No se puede eliminar: este concepto tiene pagos registrados.' };
  }

  const { error } = await supabaseAdmin.from('plan_pagos').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/admin/vigencias');
  return { success: true };
}

// ─── PAGOS DE ALUMNOS ────────────────────────────────────────────────────────

export async function getPagosAlumno(alumnoId: string) {
  const { data, error } = await supabaseAdmin
    .from('pagos_alumno')
    .select('*, plan_pagos(programa, nombre_concepto, orden, monto)')
    .eq('alumno_id', alumnoId)
    .order('plan_pagos(orden)');
  if (error) return { success: false, error: error.message, data: [] };
  return { success: true, data: data || [] };
}

export async function getPagosAlumnoPropio(alumnoId: string) {
  const { data, error } = await supabaseAdmin
    .from('pagos_alumno')
    .select('*, plan_pagos(programa, nombre_concepto, orden, monto)')
    .eq('alumno_id', alumnoId)
    .order('plan_pagos(orden)');
  if (error) return { success: false, error: error.message, data: [] };
  return { success: true, data: data || [] };
}

export async function getTodosLosAlumnosConPagos() {
  // Traer todos los alumnos activos con un resumen de pagos
  const { data: alumnos, error } = await supabaseAdmin
    .from('profiles')
    .select(`
      id, nombre, apellidos, matricula, email, carrera_id,
      carreras(nombre, niveles(nombre))
    `)
    .eq('rol', 'alumno')
    .eq('estatus', 'activo')
    .order('nombre');

  if (error) return { success: false, error: error.message, data: [] };

  // Para cada alumno, traer conteo de pagos
  const alumnosConResumen = await Promise.all(
    (alumnos || []).map(async (alumno: any) => {
      const { count: total } = await supabaseAdmin
        .from('pagos_alumno')
        .select('*', { count: 'exact', head: true })
        .eq('alumno_id', alumno.id);

      const { count: pagados } = await supabaseAdmin
        .from('pagos_alumno')
        .select('*', { count: 'exact', head: true })
        .eq('alumno_id', alumno.id)
        .eq('estatus', 'pagado');

      const { count: pendientes } = await supabaseAdmin
        .from('pagos_alumno')
        .select('*', { count: 'exact', head: true })
        .eq('alumno_id', alumno.id)
        .eq('estatus', 'pendiente');

      return {
        ...alumno,
        total_conceptos: total || 0,
        conceptos_pagados: pagados || 0,
        conceptos_pendientes: pendientes || 0,
      };
    })
  );

  return { success: true, data: alumnosConResumen };
}

export async function registrarPago(data: {
  alumnoId: string;
  planPagoId: string;
  estatus: 'pagado' | 'pendiente' | 'vencido';
  fechaPago?: string;
  montoPagado?: number;
  recibo?: string;
  notas?: string;
}) {
  const { error } = await supabaseAdmin
    .from('pagos_alumno')
    .upsert({
      alumno_id: data.alumnoId,
      plan_pago_id: data.planPagoId,
      estatus: data.estatus,
      fecha_pago: data.estatus === 'pagado' ? (data.fechaPago || new Date().toISOString().split('T')[0]) : null,
      monto_pagado: data.montoPagado || null,
      recibo: data.recibo || null,
      notas: data.notas || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'alumno_id,plan_pago_id' });

  if (error) return { success: false, error: error.message };

  // Crear notificación en plataforma si se marcó como pagado
  if (data.estatus === 'pagado') {
    const { data: concepto } = await supabaseAdmin
      .from('plan_pagos')
      .select('nombre_concepto')
      .eq('id', data.planPagoId)
      .single();

    if (concepto) {
      await supabaseAdmin.from('notificaciones').insert({
        alumno_id: data.alumnoId,
        tipo: 'pago_recibido',
        titulo: '✅ Pago Registrado',
        cuerpo: `Tu pago correspondiente a "${concepto.nombre_concepto}" ha sido registrado correctamente. ¡Gracias!`,
      });
    }
  }

  revalidatePath('/dashboard/admin/vigencias');
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

// ─── INICIALIZAR PAGOS DE UN ALUMNO NUEVO ────────────────────────────────────

export async function inicializarPagosAlumno(alumnoId: string, programa: string) {
  const { data: conceptos } = await supabaseAdmin
    .from('plan_pagos')
    .select('id')
    .eq('programa', programa)
    .eq('activo', true);

  if (!conceptos || conceptos.length === 0) return { success: false, error: 'No se encontraron conceptos para el programa.' };

  const registros = conceptos.map((c: any) => ({
    alumno_id: alumnoId,
    plan_pago_id: c.id,
    estatus: 'pendiente',
  }));

  const { error } = await supabaseAdmin
    .from('pagos_alumno')
    .upsert(registros, { onConflict: 'alumno_id,plan_pago_id' });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

// ─── RECORDATORIO DE PAGO ──────────────────────────────────────────────────

export async function enviarRecordatorioPago(alumnoId: string) {
  // Obtener datos del alumno y sus pagos pendientes
  const { data: alumno } = await supabaseAdmin
    .from('profiles')
    .select('nombre, apellidos, email')
    .eq('id', alumnoId)
    .single();

  if (!alumno) return { success: false, error: 'Alumno no encontrado.' };

  const { data: pendientes } = await supabaseAdmin
    .from('pagos_alumno')
    .select('plan_pagos(nombre_concepto)')
    .eq('alumno_id', alumnoId)
    .eq('estatus', 'pendiente');

  const conceptosPendientes = (pendientes || []).map((p: any) => p.plan_pagos?.nombre_concepto).filter(Boolean);

  if (conceptosPendientes.length === 0) {
    return { success: false, error: 'El alumno no tiene pagos pendientes.' };
  }

  // Crear notificación en plataforma
  await supabaseAdmin.from('notificaciones').insert({
    alumno_id: alumnoId,
    tipo: 'pago_pendiente',
    titulo: '⚠️ Pago Pendiente',
    cuerpo: `Tienes ${conceptosPendientes.length} concepto(s) de pago pendiente(s): ${conceptosPendientes.join(', ')}.`,
  });

  // Enviar email
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://institutoeducativoemilianozapata.vercel.app';
  const logoUrl = `${appUrl}/images/logo_zapata.png`;

  if (!user || !pass) {
    return { success: true, warning: 'Notificación creada, pero el correo no está configurado.' };
  }

  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user, pass } });

  const listaHtml = conceptosPendientes
    .map(c => `<li style="margin-bottom:8px;color:#8B2332;font-weight:bold;">• ${c}</li>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #eee;">
      <div style="background:linear-gradient(135deg,#8B2332,#6B1A27);padding:30px;text-align:center;">
        <img src="${logoUrl}" alt="Logo" style="height:100px;width:auto;margin-bottom:10px;">
        <h1 style="color:#fff;margin:0;font-size:18px;text-transform:uppercase;">Instituto Educativo Emiliano Zapata</h1>
        <p style="color:#f0d0d5;margin:5px 0 0;font-size:13px;">Control de Pagos</p>
      </div>
      <div style="padding:30px;">
        <h2 style="color:#333;">⚠️ Recordatorio de Pago Pendiente</h2>
        <p style="color:#555;line-height:1.6;">Estimado(a) <strong>${alumno.nombre} ${alumno.apellidos}</strong>,</p>
        <p style="color:#555;line-height:1.6;">Te recordamos que tienes los siguientes conceptos de pago <strong>pendientes</strong> en tu cuenta:</p>
        <ul style="list-style:none;padding-left:0;margin:20px 0;">${listaHtml}</ul>
        <div style="background:#fff3cd;padding:15px;border-radius:6px;border-left:4px solid #ffc107;margin:20px 0;">
          <p style="margin:0;color:#856404;font-size:13px;">Por favor, regulariza tu situación lo antes posible acudiendo a ventanilla o realizando tu transferencia. Ante cualquier duda, comunícate con Servicios Escolares.</p>
        </div>
        <div style="text-align:center;margin-top:20px;">
          <a href="${appUrl}/dashboard/alumno/pagos" style="display:inline-block;background:#8B2332;color:#fff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:bold;">Ver Mis Pagos →</a>
        </div>
      </div>
      <div style="background:#f8f9fa;padding:15px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#333;font-size:12px;margin:0 0 3px;font-weight:bold;">Instituto Educativo Emiliano Zapata</p>
        <p style="margin:0;color:#999;font-size:11px;">Sistema de Gestión Académica © ${new Date().getFullYear()}</p>
      </div>
    </div>
  </body></html>`;

  try {
    await transporter.sendMail({
      from: `"Servicios Escolares - IE Emiliano Zapata" <${user}>`,
      to: alumno.email,
      subject: '⚠️ Recordatorio de Pago Pendiente - IE Emiliano Zapata',
      html,
    });
    return { success: true };
  } catch (e: any) {
    return { success: true, warning: `Notificación creada, pero el correo falló: ${e.message}` };
  }
}

// ─── NOTIFICACIONES DEL ALUMNO ───────────────────────────────────────────────

export async function getNotificacionesAlumno(alumnoId: string) {
  const { data, error } = await supabaseAdmin
    .from('notificaciones')
    .select('*')
    .eq('alumno_id', alumnoId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return { success: false, error: error.message, data: [] };
  return { success: true, data: data || [] };
}

export async function marcarNotificacionLeida(notificacionId: string) {
  const { error } = await supabaseAdmin
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', notificacionId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

export async function marcarTodasLeidas(alumnoId: string) {
  const { error } = await supabaseAdmin
    .from('notificaciones')
    .update({ leida: true })
    .eq('alumno_id', alumnoId)
    .eq('leida', false);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}
