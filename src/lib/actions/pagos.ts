
'use server';

import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import nodemailer from 'nodemailer';
import { getInstitucionConfig } from '@/lib/actions/institucion';
import { getTenantServiceState, isServiceExpired, requireTenantSession } from '@/lib/tenant/context';

// ─── PLAN DE PAGOS (Gestión de Conceptos) ───────────────────────────────────

export async function sincronizarConceptosFaltantes(alumnoId?: string, programaFiltro?: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  try {
    let queryPlan = supabaseAdmin
      .from('plan_pagos')
      .select('id, programa')
      .eq('activo', true);

    if (programaFiltro) {
      queryPlan = queryPlan.eq('programa', programaFiltro);
    }

    const { data: todosConceptos, error: errPlan } = await queryPlan;
    if (errPlan || !todosConceptos || todosConceptos.length === 0) return { success: true };

    const conceptosPorPrograma = new Map<string, string[]>();
    for (const c of todosConceptos) {
      if (!conceptosPorPrograma.has(c.programa)) {
        conceptosPorPrograma.set(c.programa, []);
      }
      conceptosPorPrograma.get(c.programa)!.push(c.id);
    }

    let queryPagos = supabaseAdmin
      .from('pagos_alumno')
      .select('alumno_id, plan_pago_id, plan_pagos(programa)');

    if (alumnoId) {
      queryPagos = queryPagos.eq('alumno_id', alumnoId);
    }

    const { data: pagosExistentes, error: errPagos } = await queryPagos;
    if (errPagos || !pagosExistentes) return { success: true };

    const alumnoProgramas = new Map<string, Set<string>>();
    const alumnoConceptos = new Map<string, Set<string>>();

    for (const p of (pagosExistentes as any[])) {
      const aId = p.alumno_id;
      const prog = p.plan_pagos?.programa;
      const planId = p.plan_pago_id;

      if (!alumnoConceptos.has(aId)) {
        alumnoConceptos.set(aId, new Set());
      }
      if (planId) alumnoConceptos.get(aId)!.add(planId);

      if (prog) {
        if (!alumnoProgramas.has(aId)) {
          alumnoProgramas.set(aId, new Set());
        }
        alumnoProgramas.get(aId)!.add(prog);
      }
    }

    const registrosInsertar: { alumno_id: string; plan_pago_id: string; estatus: string }[] = [];

    for (const [aId, progs] of alumnoProgramas.entries()) {
      const asignados = alumnoConceptos.get(aId) || new Set();

      for (const prog of progs) {
        const conceptosRequeridos = conceptosPorPrograma.get(prog) || [];
        for (const planId of conceptosRequeridos) {
          if (!asignados.has(planId)) {
            registrosInsertar.push({
              alumno_id: aId,
              plan_pago_id: planId,
              estatus: 'pendiente',
            });
            asignados.add(planId);
          }
        }
      }
    }

    if (registrosInsertar.length > 0) {
      await supabaseAdmin
        .from('pagos_alumno')
        .upsert(registrosInsertar, { onConflict: 'alumno_id,plan_pago_id' });
    }

    return { success: true, insertados: registrosInsertar.length };
  } catch (err: any) {
    console.error('Error en sincronizarConceptosFaltantes:', err);
    return { success: false, error: err.message };
  }
}

export async function getPlanPagos() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
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
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const programa = data.programa.toUpperCase().trim();
  const nombreConcepto = data.nombre_concepto.toUpperCase().trim();
  
  // Reajuste silencioso: Desplazar los conceptos existentes que colisionen o sean mayores al orden requerido
  const { data: existing } = await supabaseAdmin
    .from('plan_pagos')
    .select('id, orden')
    .eq('programa', programa)
    .gte('orden', data.orden);

  if (existing && existing.length > 0) {
    // Ordenar de mayor a menor para actualizarlos sin chocar entre sí
    existing.sort((a, b) => b.orden - a.orden);
    for (const p of existing) {
       await supabaseAdmin.from('plan_pagos').update({ orden: p.orden + 1 }).eq('id', p.id);
    }
  }

  const { error } = await supabaseAdmin.from('plan_pagos').insert({
    programa: programa,
    nombre_concepto: nombreConcepto,
    orden: data.orden,
    monto: data.monto || null,
  });
  if (error) return { success: false, error: error.message };

  // Auto-sincronizar este nuevo concepto con los alumnos existentes de ese programa
  await sincronizarConceptosFaltantes(undefined, programa);

  revalidatePath('/dashboard/admin/vigencias');
  return { success: true };
}

export async function updateConceptoPago(id: string, data: {
  nombre_concepto?: string;
  monto?: number | null;
  orden?: number;
  activo?: boolean;
}) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
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
  const { supabase: supabaseAdmin } = await requireTenantSession();
  // Verificar si tiene pagos asociados
  const { count } = await supabaseAdmin
    .from('pagos_alumno')
    .select('*', { count: 'exact', head: true })
    .eq('plan_pago_id', id)
    .eq('estatus', 'pagado');

  if (count && count > 0) {
    return { success: false, error: 'No se puede eliminar: este concepto tiene pagos registrados.' };
  }

  // Eliminar cualquier registro 'pendiente' o no pagado asociado a este plan_pago_id en pagos_alumno
  await supabaseAdmin.from('pagos_alumno').delete().eq('plan_pago_id', id).neq('estatus', 'pagado');

  const { error } = await supabaseAdmin.from('plan_pagos').delete().eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/admin/vigencias');
  return { success: true };
}

// ─── PAGOS DE ALUMNOS ────────────────────────────────────────────────────────

export async function getPagosAlumno(alumnoId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  await sincronizarConceptosFaltantes(alumnoId);

  const { data, error } = await supabaseAdmin
    .from('pagos_alumno')
    .select('*, plan_pagos(programa, nombre_concepto, orden, monto)')
    .eq('alumno_id', alumnoId)
    .order('plan_pagos(orden)');
  if (error) return { success: false, error: error.message, data: [] };
  return { success: true, data: data || [] };
}

export async function getPagosAlumnoPropio(alumnoId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  await sincronizarConceptosFaltantes(alumnoId);

  const { data, error } = await supabaseAdmin
    .from('pagos_alumno')
    .select('*, plan_pagos(programa, nombre_concepto, orden, monto)')
    .eq('alumno_id', alumnoId)
    .order('plan_pagos(orden)');
  if (error) return { success: false, error: error.message, data: [] };
  return { success: true, data: data || [] };
}

export async function getTodosLosAlumnosConPagos() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  await sincronizarConceptosFaltantes();

  const { data: alumnos, error } = await supabaseAdmin
    .from('profiles')
    .select(`id, nombre, apellidos, matricula, email, carrera_id, grupo_id, carreras(nombre, niveles(nombre)), grupos(id, nombre, turno)`)
    .eq('rol', 'alumno')
    .eq('estatus', 'activo')
    .order('nombre');

  if (error) return { success: false, error: error.message, data: [] };

  const alumnosConResumen = await Promise.all(
    (alumnos || []).map(async (alumno: any) => {
      const { data: pagos } = await supabaseAdmin
        .from('pagos_alumno')
        .select('estatus, monto_pagado, plan_pagos(monto)')
        .eq('alumno_id', alumno.id);

      const total = pagos?.length || 0;
      const pagados = pagos?.filter((p: any) => p.estatus === 'pagado').length || 0;
      const abonos = pagos?.filter((p: any) => p.estatus === 'abono').length || 0;
      const pendientes = pagos?.filter((p: any) => p.estatus === 'pendiente').length || 0;

      // Progreso ponderado: pagados=1.0, abono=fraccion, pendiente=0
      let ponderado = pagados;
      pagos?.filter((p: any) => p.estatus === 'abono').forEach((p: any) => {
        const mPlan = p.plan_pagos?.monto;
        const mPagado = p.monto_pagado || 0;
        ponderado += mPlan && mPlan > 0 ? Math.min(mPagado / mPlan, 0.99) : 0.5;
      });

      return {
        ...alumno,
        total_conceptos: total,
        conceptos_pagados: pagados,
        conceptos_abono: abonos,
        conceptos_pendientes: pendientes,
        progreso_ponderado: ponderado,
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
  notas?: string;
}) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  // 0. Validar monto si es un pago total
  if (data.estatus === 'pagado' && data.montoPagado) {
    const { data: plan } = await supabaseAdmin
      .from('plan_pagos')
      .select('monto')
      .eq('id', data.planPagoId)
      .single();
    if (plan?.monto && data.montoPagado > plan.monto) {
      return { 
        success: false, 
        error: `El monto ingresado ($${data.montoPagado.toLocaleString('es-MX')}) no puede ser superior al monto del concepto ($${plan.monto.toLocaleString('es-MX')}).` 
      };
    }
  }

  // 1. Si se está registrando como pagado, generar el folio automático (Prefijo Año + Inicial Nivel)
  let folioGenerado = null;
  if (data.estatus === 'pagado') {
    const year = new Date().getFullYear().toString().slice(2); // '26'
    let letraNivel = 'V'; // Variados
    const { data: al } = await supabaseAdmin.from('profiles')
      .select('carreras(niveles(nombre))').eq('id', data.alumnoId).single();
    const alData: any = al;
    let nombreNivel = (alData?.carreras?.niveles?.nombre || '').toUpperCase();
    if (!nombreNivel && Array.isArray(alData?.carreras)) {
      nombreNivel = (alData.carreras[0]?.niveles?.nombre || '').toUpperCase();
    }
    
    if (nombreNivel.includes('UNIVERSIDAD')) letraNivel = 'U';
    else if (nombreNivel.includes('BACHILLERATO') || nombreNivel.includes('PREPA')) letraNivel = 'B';
    else if (nombreNivel.includes('CAPACITAC')) letraNivel = 'C';

    const prefijo = `${year}${letraNivel}`;

    // Intentar primero el SQL nativo, si no existe la RPC, usar el fallback seguro que evalúa el max de su prefijo.
    const { data: rpcFolio, error: rpcErr } = await supabaseAdmin.rpc('generar_folio_recibo', { prefijo });
    
    if (!rpcErr && rpcFolio) {
      folioGenerado = rpcFolio;
    } else {
      // Fallback
      const { data: maxFolioData } = await supabaseAdmin.from('pagos_alumno').select('recibo')
        .like('recibo', `${prefijo}-%`).order('recibo', { ascending: false }).limit(1);
      
      let nextNum = 1;
      if (maxFolioData && maxFolioData.length > 0 && maxFolioData[0].recibo) {
        const parteNumerica = maxFolioData[0].recibo.split('-')[1];
        if (parteNumerica && !isNaN(parseInt(parteNumerica, 10))) {
          nextNum = parseInt(parteNumerica, 10) + 1;
        }
      }
      const numStr = nextNum.toString();
      folioGenerado = `${prefijo}-${numStr.length < 5 ? numStr.padStart(5, '0') : numStr}`;
    }
  }

  const { error } = await supabaseAdmin
    .from('pagos_alumno')
    .upsert({
      alumno_id: data.alumnoId,
      plan_pago_id: data.planPagoId,
      estatus: data.estatus,
      fecha_pago: data.estatus === 'pagado' ? (data.fechaPago || new Date().toISOString().split('T')[0]) : null,
      monto_pagado: data.montoPagado || null,
      recibo: folioGenerado,
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
  } else if (data.estatus === 'pendiente') {
    // Si se revierte el pago, borrar notificaciones anteriores para ese concepto
    const { data: concepto } = await supabaseAdmin
      .from('plan_pagos')
      .select('nombre_concepto')
      .eq('id', data.planPagoId)
      .single();
    if (concepto) {
      await supabaseAdmin.from('notificaciones').delete()
        .eq('alumno_id', data.alumnoId)
        .eq('tipo', 'pago_recibido')
        .like('cuerpo', `%${concepto.nombre_concepto}%`);
    }
  }

  revalidatePath('/dashboard/admin/vigencias');
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true, folio: folioGenerado };
}

// ─── INICIALIZAR PAGOS DE UN ALUMNO NUEVO ────────────────────────────────────

export async function inicializarPagosAlumno(alumnoId: string, programa: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
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
  revalidatePath('/dashboard/admin/vigencias');
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

// ─── REASIGNAR PROGRAMA (solo cuando no hay pagos registrados aún) ────────────

export async function reasignarProgramaAlumno(alumnoId: string, nuevoPrograma: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  // Solo eliminar pagos que estén en 'pendiente' (sin movimiento financiero)
  // Si hubiera alguno pagado o abonado, NO se toca para proteger el historial
  const { error: delError } = await supabaseAdmin
    .from('pagos_alumno')
    .delete()
    .eq('alumno_id', alumnoId)
    .eq('estatus', 'pendiente');

  if (delError) return { success: false, error: delError.message };

  // Ahora inicializar con el nuevo programa
  return inicializarPagosAlumno(alumnoId, nuevoPrograma);
}

// ─── RECORDATORIO DE PAGO ──────────────────────────────────────────────────

export async function enviarRecordatorioPago(alumnoId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
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
  const html_inst = await getInstitucionConfig();

  if (!html_inst.smtp_user || !html_inst.smtp_password) {
    return { success: true, warning: 'Notificación creada en la plataforma, pero no se pudo enviar el correo porque el servidor de correo electrónico no está configurado. Ve a Configuración → Correo Saliente para activarlo.' };
  }

  const smtpHost = html_inst.smtp_host || 'smtp.gmail.com';
  const smtpPort = html_inst.smtp_port || 465;
  const transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: { user: html_inst.smtp_user, pass: html_inst.smtp_password },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://plataforma.ejemplo.edu';
  const logoUrl = html_inst.logo_url || `${appUrl}/images/logo_placeholder.svg`;
  const colorPrincipal = html_inst.color_primario || '#333333';
  const colorSecundario = html_inst.color_secundario || '#1A4A3F';
  const fromName = html_inst.smtp_from_name || `Servicios Escolares - ${html_inst.siglas}`;

  const listaHtml = conceptosPendientes
    .map(c => `<li style="margin-bottom:8px;color:${colorPrincipal};font-weight:bold;">• ${c}</li>`)
    .join('');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
  <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:sans-serif;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;border:1px solid #eee;">
      <div style="background:linear-gradient(135deg,${colorPrincipal},${colorSecundario});padding:30px;text-align:center;">
        <img src="${logoUrl}" alt="Logo" style="height:100px;width:auto;margin-bottom:10px;">
        <h1 style="color:#fff;margin:0;font-size:18px;text-transform:uppercase;">${html_inst.nombre_completo}</h1>
        <p style="color:rgba(255,255,255,0.7);margin:5px 0 0;font-size:13px;">Control de Pagos</p>
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
          <a href="${appUrl}/dashboard/alumno/pagos" style="display:inline-block;background:${colorPrincipal};color:#fff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:bold;">Ver Mis Pagos →</a>
        </div>
      </div>
      <div style="background:#f8f9fa;padding:15px;text-align:center;border-top:1px solid #eee;">
        <p style="color:#333;font-size:12px;margin:0 0 3px;font-weight:bold;">${html_inst.nombre_completo}</p>
        <p style="margin:0;color:#999;font-size:11px;">Sistema de Gestión Académica © ${new Date().getFullYear()}</p>
      </div>
    </div>
  </body></html>`;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${html_inst.smtp_user}>`,
      to: alumno.email,
      subject: `⚠️ Recordatorio de Pago Pendiente - ${html_inst.siglas}`,
      html,
    });
    return { success: true };
  } catch (e: any) {
    return { success: true, warning: `Notificación creada, pero el correo falló: ${e.message}` };
  }
}

// (No extra utilities needed)

// ─── NOTIFICACIONES DEL ALUMNO ───────────────────────────────────────────────

export async function getNotificacionesAlumno(alumnoId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
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
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const { error } = await supabaseAdmin
    .from('notificaciones')
    .update({ leida: true })
    .eq('id', notificacionId);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

export async function marcarTodasLeidas(alumnoId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const { error } = await supabaseAdmin
    .from('notificaciones')
    .update({ leida: true })
    .eq('alumno_id', alumnoId)
    .eq('leida', false);
  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

// ─── PROGRAMAS DINÁMICOS ─────────────────────────────────────────────────────

export async function getPrograms() {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const { data, error } = await supabaseAdmin
    .from('plan_pagos')
    .select('programa')
    .eq('activo', true)
    .order('programa');
  if (error) return { success: false, data: [] as string[] };
  const unique = [...new Set((data || []).map((d: any) => d.programa as string))];
  return { success: true, data: unique };
}

export async function deletePrograma(programa: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  // Al estar configurado con ON DELETE CASCADE en supabase (desde la creación de pagos_alumno y abonos_pago),
  // simplemente borrar los conceptos del plan de este programa purgará todos los registros hijos correspondientes en cascada.
  const { error } = await supabaseAdmin
    .from('plan_pagos')
    .delete()
    .eq('programa', programa);

  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/admin/vigencias');
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

// ─── ABONOS PARCIALES ────────────────────────────────────────────────────────

export async function registrarAbono(data: {
  pagoAlumnoId: string;
  alumnoId: string;
  planPagoId: string;
  monto: number;
  fecha?: string;
  notas?: string;
}) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const year = new Date().getFullYear().toString().slice(2);
  let letraNivel = 'V';
  const { data: al } = await supabaseAdmin.from('profiles').select('carreras(niveles(nombre))').eq('id', data.alumnoId).single();
  const alData: any = al;
  let nombreNivel = (alData?.carreras?.niveles?.nombre || '').toUpperCase();
  if (!nombreNivel && Array.isArray(alData?.carreras)) {
    nombreNivel = (alData.carreras[0]?.niveles?.nombre || '').toUpperCase();
  }
  if (nombreNivel.includes('UNIVERSIDAD')) letraNivel = 'U';
  else if (nombreNivel.includes('BACHILLERATO') || nombreNivel.includes('PREPA')) letraNivel = 'B';
  else if (nombreNivel.includes('CAPACITAC')) letraNivel = 'C';
  const prefijo = `${year}${letraNivel}`;

  let folioGenerado = null;
  const { data: rpcFolio, error: rpcErr } = await supabaseAdmin.rpc('generar_folio_recibo', { prefijo });
  if (!rpcErr && rpcFolio) {
    folioGenerado = rpcFolio;
  } else {
    const { data: maxFolioData } = await supabaseAdmin.from('abonos_pago').select('recibo').like('recibo', `${prefijo}-%`).order('recibo', { ascending: false }).limit(1);
    let nextNum = 1;
    if (maxFolioData && maxFolioData.length > 0 && maxFolioData[0].recibo) {
      const parteNumerica = maxFolioData[0].recibo.split('-')[1];
      if (parteNumerica && !isNaN(parseInt(parteNumerica, 10))) nextNum = parseInt(parteNumerica, 10) + 1;
    }
    const numStr = nextNum.toString();
    folioGenerado = `${prefijo}-${numStr.length < 5 ? numStr.padStart(5, '0') : numStr}`;
  }

  // 0. Validar que el abono no exceda el saldo pendiente
  const { data: abonosPrevios } = await supabaseAdmin
    .from('abonos_pago')
    .select('monto')
    .eq('pago_alumno_id', data.pagoAlumnoId);
  const { data: planInfo } = await supabaseAdmin
    .from('plan_pagos')
    .select('monto, nombre_concepto')
    .eq('id', data.planPagoId)
    .single();

  const sumaActual = (abonosPrevios || []).reduce((acc: number, a: any) => acc + Number(a.monto), 0);
  const montoPlanTotal = planInfo?.monto ? Number(planInfo.monto) : 0;
  const saldoPendiente = montoPlanTotal - sumaActual;

  if (data.monto > saldoPendiente) {
    return { 
      success: false, 
      error: `El monto ingresado ($${data.monto.toLocaleString('es-MX')}) no puede ser superior al saldo pendiente ($${saldoPendiente.toLocaleString('es-MX')}).` 
    };
  }

  // 1. Insertar el abono
  const { error: errAbono } = await supabaseAdmin.from('abonos_pago').insert({
    pago_alumno_id: data.pagoAlumnoId,
    monto: data.monto,
    fecha: data.fecha || new Date().toISOString().split('T')[0],
    recibo: folioGenerado,
    notas: data.notas || null,
  });
  if (errAbono) return { success: false, error: errAbono.message };

  const sumaAbonos = sumaActual + Number(data.monto);
  const montoPlan = montoPlanTotal;

  // 3. Calcular nuevo estatus
  let nuevoEstatus: 'pendiente' | 'abono' | 'pagado' = 'abono';
  if (montoPlan && sumaAbonos >= montoPlan) {
    nuevoEstatus = 'pagado';
  }

  // 4. Actualizar pagos_alumno con la suma y el nuevo estatus
  await supabaseAdmin
    .from('pagos_alumno')
    .update({
      estatus: nuevoEstatus,
      monto_pagado: sumaAbonos,
      fecha_pago: nuevoEstatus === 'pagado' ? new Date().toISOString().split('T')[0] : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', data.pagoAlumnoId);

  // 5. Notificación si se completó el pago
  if (nuevoEstatus === 'pagado' && planInfo) {
    await supabaseAdmin.from('notificaciones').insert({
      alumno_id: data.alumnoId,
      tipo: 'pago_recibido',
      titulo: '✅ Pago Completado',
      cuerpo: `¡Tu concepto "${planInfo.nombre_concepto}" ha sido cubierto en su totalidad! ¡Gracias!`,
    });
  } else if (nuevoEstatus === 'abono' && planInfo) {
    await supabaseAdmin.from('notificaciones').insert({
      alumno_id: data.alumnoId,
      tipo: 'pago_recibido',
      titulo: '✅ Abono Registrado',
      cuerpo: `Tu abono parcial correspondiente a "${planInfo.nombre_concepto}" ha sido registrado correctamente. Saldo pendiente: $${(montoPlanTotal - sumaAbonos).toLocaleString('es-MX')}.`,
    });
  }

  revalidatePath('/dashboard/admin/vigencias');
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true, nuevoEstatus, sumaAbonos, folio: folioGenerado };
}

export async function getAbonosConcepto(pagoAlumnoId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const { data, error } = await supabaseAdmin
    .from('abonos_pago')
    .select('*')
    .eq('pago_alumno_id', pagoAlumnoId)
    .order('fecha', { ascending: true });
  if (error) return { success: false, data: [] };
  return { success: true, data: data || [] };
}

export async function deleteAbono(id: string, pagoAlumnoId: string, alumnoId: string, planPagoId: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  // Eliminar el abono
  const { error } = await supabaseAdmin.from('abonos_pago').delete().eq('id', id);
  if (error) return { success: false, error: error.message };

  // Recalcular suma y estatus
  const { data: abonos } = await supabaseAdmin
    .from('abonos_pago').select('monto').eq('pago_alumno_id', pagoAlumnoId);

  const { data: concepto } = await supabaseAdmin
    .from('plan_pagos').select('monto, nombre_concepto').eq('id', planPagoId).single();

  const sumaAbonos = (abonos || []).reduce((acc: number, a: any) => acc + Number(a.monto), 0);
  const montoPlan = concepto?.monto ? Number(concepto.monto) : null;

  let nuevoEstatus: 'pendiente' | 'abono' | 'pagado' =
    sumaAbonos === 0 ? 'pendiente' : montoPlan && sumaAbonos >= montoPlan ? 'pagado' : 'abono';

  await supabaseAdmin.from('pagos_alumno').update({
    estatus: nuevoEstatus,
    monto_pagado: sumaAbonos > 0 ? sumaAbonos : null,
    updated_at: new Date().toISOString(),
  }).eq('id', pagoAlumnoId);

  // Si se elimina un abono, borramos notificaciones antiguas de este concepto
  // para evitar confusiones de estados inválidos
  if (concepto) {
    await supabaseAdmin.from('notificaciones').delete()
      .eq('alumno_id', alumnoId)
      .eq('tipo', 'pago_recibido')
      .like('cuerpo', `%${concepto.nombre_concepto}%`);
  }

  revalidatePath('/dashboard/admin/vigencias');
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

export async function updateNombrePrograma(nombreAnterior: string, nombreNuevo: string) {
  const { supabase: supabaseAdmin } = await requireTenantSession();
  const nuevo = nombreNuevo.toUpperCase().trim();
  if (!nuevo) return { success: false, error: 'El nombre del programa no puede estar vacío.' };

  const { error } = await supabaseAdmin
    .from('plan_pagos')
    .update({ programa: nuevo })
    .eq('programa', nombreAnterior);

  if (error) return { success: false, error: error.message };
  revalidatePath('/dashboard/admin/vigencias');
  revalidatePath('/dashboard/alumno/pagos');
  return { success: true };
}

// ─── ESTADO PAGO SERVICIOS IA ───────────────────────────────────────────────

export async function getEstadoPagoIA(): Promise<boolean> {
  try {
    const context = await requireTenantSession();
    const service = await getTenantServiceState(context.tenantId);
    return !!service?.ia_habilitada && !isServiceExpired(service);
  } catch (err) {
    console.error('Excepción en getEstadoPagoIA:', err);
    return false;
  }
}

export async function getServicioPlataformaInfo() {
  try {
    const context = await requireTenantSession(['superuser', 'admin']);
    const data = await getTenantServiceState(context.tenantId);
    return { success: !!data, data };
  } catch (err) {
    console.error('Exception fetching servicio plataforma info:', err);
    return { success: false, data: null };
  }
}
