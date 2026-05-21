import nodemailer from 'nodemailer';
import { getHorariosFormateados } from '@/lib/actions/horarios';
import { getInstitucionConfig } from '@/lib/actions/institucion';
import { InstitucionConfig } from '@/lib/types';

// ─── Factory: Crear transporter dinámico desde la BD ──────────────────────────
// NO hay transporter global. Se crea por cada envío usando los datos SMTP
// de la tabla configuracion_sistema. Si no hay datos, retorna null.

function createSmtpTransporter(inst: InstitucionConfig) {
  if (!inst.smtp_user || !inst.smtp_password) return null;

  const host = inst.smtp_host || 'smtp.gmail.com';
  const port = inst.smtp_port || 465;

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user: inst.smtp_user,
      pass: inst.smtp_password,
    },
  });
}

const SMTP_NOT_CONFIGURED_ERROR = 'El correo no pudo enviarse porque no se ha configurado el servidor de correo electrónico. Para activarlo, ve a Configuración → Correo Saliente y completa los datos de tu servidor SMTP (correo, contraseña y servidor).';

interface WelcomeEmailData {
  to: string;
  nombre: string;
  apellidos: string;
  rol: string;
  matricula?: string | null;
  numero_empleado?: string | null;
  password: string;
  isReactivation?: boolean;
  isExpiration?: boolean;
  genero?: string | null;
  nivel?: string | null;
  carreraNombre?: string | null;
}

interface ReminderEmailData {
  to: string;
  nombre: string;
  faltantes: string[];
}

export async function sendWelcomeEmail(data: WelcomeEmailData) {
  try {
    const inst = await getInstitucionConfig();
    const transporter = createSmtpTransporter(inst);

    if (!transporter) {
      console.warn('⚠️ SMTP no configurado en la BD.');
      return { success: false, error: SMTP_NOT_CONFIGURED_ERROR };
    }

    const fromName = inst.smtp_from_name || inst.nombre_completo;

    const rolTexto: Record<string, string> = {
      alumno: '🎓 Alumno',
      profesor: '👨‍🏫 Profesor',
      admin: '🛡️ Administrador',
      superuser: '⚙️ Super Administrador',
    };

    const rolLabel = rolTexto[data.rol] || data.rol;
    
    // URL base de la aplicación
    let appUrl = (inst.url_plataforma || 'https://plataforma.ejemplo.edu/').replace(/\/$/, '');

    const isAlumno = data.rol === 'alumno';
    const genero = data.genero || 'Hombre';
    const carrera = data.carreraNombre || '';
    
    // Sufijo de género
    const esMujer = genero === 'Mujer';
    const estimadoText = esMujer ? 'Estimada' : 'Estimado';
    const alumnoText = esMujer ? 'Alumna' : 'Alumno';
    const inscritoText = esMujer ? 'Inscrita' : 'Inscrito';
    const colorEstado = esMujer ? '#FCE4EC' : '#E3F2FD'; // Rosa / Azul Celeste
    const colorBordeEstado = esMujer ? '#F8BBD0' : '#BBDEFB';
    const colorTextoEstado = esMujer ? '#C2185B' : '#1976D2';
    
    // COLORES DINÁMICOS desde la BD
    const colorPrincipal = inst.color_primario || '#333333';
    const colorSecundario = inst.color_secundario || '#1A4A3F';

    let tituloPrincipal = data.isReactivation ? '¡Acceso Reactivado!' : `¡Bienvenido(a), ${data.nombre}!`;
    let subTexto = data.isReactivation 
      ? 'Tu periodo de acceso ha sido extendido exitosamente. Puedes volver a ingresar al sistema con los siguientes datos:'
      : `Tu cuenta ha sido creada exitosamente como <strong>${rolLabel}</strong>.`;

    if (data.isExpiration) {
      tituloPrincipal = '⚠️ Acceso Finalizado';
      subTexto = `Estimado(a) <strong>${data.nombre}</strong>, te informamos que tu periodo de acceso a la plataforma ha terminado el día de hoy.`;
    }

    let identificacionHTML = '';
    if (data.rol === 'alumno' && data.matricula) {
      identificacionHTML = `
        <tr>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-weight: bold; color: #555; width: 40%;">📋 Matrícula</td>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; color: #333;">${data.matricula}</td>
        </tr>`;
    } else if ((data.rol === 'profesor' || data.rol === 'admin') && data.numero_empleado) {
      identificacionHTML = `
        <tr>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; font-weight: bold; color: #555; width: 40%;">🏷️ No. Empleado</td>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0; color: #333;">${data.numero_empleado}</td>
        </tr>`;
    }

    const logoUrl = inst.logo_url || `${appUrl}/images/logo_placeholder.svg`;
    let headerImageUrl = logoUrl;
    
    // ─── Consulta dinámica del nivel desde la BD ───────────────────────────
    // El parámetro 'nivel' ya viene como nombre legible (ej: "UNIVERSIDAD")
    // Buscamos en la tabla 'niveles' para obtener su imagen de bienvenida
    const nivelNombre = data.nivel || '';
    let imagenBienvenida: string | null = null;
    
    if (nivelNombre) {
      try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
        if (supabaseUrl && supabaseKey) {
          const { createClient } = await import('@supabase/supabase-js');
          const supaAdmin = createClient(supabaseUrl, supabaseKey, {
            auth: { autoRefreshToken: false, persistSession: false }
          });
          const { data: nivelRow } = await supaAdmin
            .from('niveles')
            .select('imagen_bienvenida_url')
            .ilike('nombre', nivelNombre)
            .maybeSingle();
          if (nivelRow?.imagen_bienvenida_url) {
            imagenBienvenida = nivelRow.imagen_bienvenida_url;
          }
        }
      } catch (e) {
        console.warn('No se pudo consultar imagen de nivel:', e);
      }
    }
    
    if (isAlumno && !data.isExpiration && !data.isReactivation && imagenBienvenida) {
      headerImageUrl = imagenBienvenida;
    }

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0;padding:0;background-color:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
      <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;">
        <tr><td align="center">
          <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background-color:#ffffff;">

            <!-- HEADER -->
            ${isAlumno && !data.isExpiration && !data.isReactivation ? `
            <tr><td style="text-align:center;background-color:#fff;">
              <img src="${headerImageUrl}" alt="Bienvenida - ${inst.nombre_completo}" width="600" style="width:100%;max-width:600px;height:auto;display:block;border:0;">
            </td></tr>
            ` : `
            <tr><td style="background:linear-gradient(135deg,${colorPrincipal},${colorSecundario});padding:40px 30px;text-align:center;">
              <img src="${logoUrl}" alt="Logo" width="150" style="height:150px;width:auto;margin-bottom:15px;border:0;">
              <h1 style="color:#fff;margin:0;font-size:20px;font-weight:bold;text-transform:uppercase;letter-spacing:1px;">${inst.nombre_completo}</h1>
              <p style="color:rgba(255,255,255,0.7);margin:5px 0 0;font-size:13px;">Sistema de Gestión Académica</p>
            </td></tr>
            `}

            <!-- CREDENTIALS FIRST (so Gmail never clips them) -->
            ${!data.isExpiration ? `
            <tr><td style="padding:25px 30px 10px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;border:1px solid #e9ecef;overflow:hidden;">
                <tr><td style="background-color:${colorPrincipal};padding:12px 20px;text-align:center;">
                  <span style="color:#ffffff;font-size:15px;font-weight:bold;">🔐 Datos de Acceso Vigentes</span>
                </td></tr>
                <tr><td>
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="padding:10px 20px;border-bottom:1px solid #eee;font-weight:bold;color:#555;">👤 Usuario</td>
                      <td style="padding:10px 20px;border-bottom:1px solid #eee;color:#333;">${data.to}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 20px;border-bottom:1px solid #eee;font-weight:bold;color:#555;">🔑 Contraseña</td>
                      <td style="padding:10px 20px;border-bottom:1px solid #eee;color:#333;font-weight:bold;background:#fff3cd;">${data.password}</td>
                    </tr>
                    <tr>
                      <td style="padding:10px 20px;border-bottom:1px solid #eee;font-weight:bold;color:#555;">🎭 Rol</td>
                      <td style="padding:10px 20px;border-bottom:1px solid #eee;color:#333;">${rolLabel}</td>
                    </tr>
                    ${identificacionHTML}
                  </table>
                </td></tr>
              </table>
            </td></tr>

            <tr><td style="text-align:center;padding:15px 20px;">
              <a href="${appUrl}" style="display:inline-block;background:${colorPrincipal};color:#ffffff;padding:14px 50px;border-radius:6px;text-decoration:none;font-weight:bold;">Iniciar Sesión →</a>
            </td></tr>
            ` : `
            <tr><td style="padding:30px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff5f5;border-radius:8px;border:1px solid #fed7d7;">
                <tr><td style="padding:20px;text-align:center;color:#c53030;font-size:14px;">
                  Si deseas continuar con tus estudios o requieres una prórroga, por favor contacta al departamento de <strong>Servicios Escolares</strong> o acude a ventanilla para realizar el pago de tu colegiatura o trámite correspondiente.
                </td></tr>
              </table>
            </td></tr>
            `}

            <tr><td style="padding:0 30px 15px;">
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff3cd;border-radius:6px;border-left:4px solid #ffc107;">
                <tr><td style="padding:12px 15px;color:#856404;font-size:13px;">
                  ⚠️ <strong>Importante:</strong> Esta información es personal. No compartas tus accesos con terceros. Guarde esta información en un lugar seguro.
                </td></tr>
              </table>
            </td></tr>

            <!-- PERSONALIZED INSCRIPTION INFO FOR ALUMNOS (after credentials) -->
            ${isAlumno && !data.isExpiration && !data.isReactivation ? `
            <tr><td style="padding:10px 30px;text-align:center;">
              <h2 style="color:#333;margin:0;font-size:22px;text-transform:uppercase;">¡FELICIDADES, ${data.nombre} ${data.apellidos}!</h2>
              <h3 style="color:#2c7a7b;margin:12px 0;font-size:16px;font-weight:bold;">¡HAS COMPLETADO TU INSCRIPCIÓN!</h3>
              <p style="font-size:16px;color:${colorPrincipal};font-weight:bold;text-transform:uppercase;margin:8px 0 15px;">${nivelNombre}${carrera ? ` - ${carrera}` : ''}</p>
              <p style="color:#444;font-size:14px;text-align:left;line-height:1.6;margin-bottom:15px;">${estimadoText} <strong>${data.nombre} ${data.apellidos}</strong>, se le informa que el área de Control Escolar ha validado su documentación para su correcta inscripción y su estatus actual es:</p>
            </td></tr>
            <tr><td style="text-align:center;padding:0 30px 15px;">
              <table cellpadding="0" cellspacing="0" style="display:inline-block;">
                <tr><td style="background-color:${colorEstado};border:2px solid ${colorBordeEstado};color:${colorTextoEstado};padding:12px 30px;border-radius:8px;font-size:20px;font-weight:800;letter-spacing:1px;text-transform:uppercase;">
                  ${alumnoText} ${inscritoText}
                </td></tr>
              </table>
            </td></tr>
            <tr><td style="padding:10px 30px 5px;">
              <p style="color:#555;font-size:13px;text-align:left;line-height:1.6;">Esto significa que, bajo criterios del <strong>${inst.nombre_completo}</strong>, sus documentos han sido entregados satisfactoriamente. Sin embargo, es importante mencionarle que, aunque sus documentos están completos según los criterios internos de nuestra institución educativa, aún están sujetos a revisión por parte de la autoridad educativa correspondiente.</p>
              <p style="color:#444;font-size:13px;font-style:italic;font-weight:bold;text-align:left;">Nuevamente, felicitaciones por su inscripción y completar su expediente de documentación. No dude en comunicarse con nosotros si tiene alguna duda o comentario.</p>
              <p style="color:#2b6cb0;font-size:16px;font-weight:bold;text-align:center;margin-top:10px;">¡Mucho éxito en el proceso!</p>
              <p style="font-size:18px;text-align:center;">🎓 📈 🎓</p>
            </td></tr>
            ` : `
            <tr><td style="padding:15px 30px;text-align:center;">
              <h2 style="color:#333;margin:0 0 10px;font-size:22px;">${tituloPrincipal}</h2>
              <p style="color:#666;font-size:15px;line-height:1.6;margin:0;">${subTexto}</p>
            </td></tr>
            `}

            <!-- FOOTER -->
            <tr><td style="background-color:#f8f9fa;padding:15px;text-align:center;border-top:1px solid #eee;">
              <p style="color:#333;font-size:12px;margin:0 0 3px;font-weight:bold;">${inst.nombre_completo}</p>
              <p style="margin:0;color:#999;font-size:11px;">Sistema de Gestión Académica © ${new Date().getFullYear()}</p>
            </td></tr>

          </table>
        </td></tr>
      </table>
    </body>
    </html>`;

    const info = await transporter.sendMail({
      from: `"${fromName}" <${inst.smtp_user}>`,
      to: data.to,
      subject: data.isExpiration 
        ? `⚠️ Aviso de Acceso - ${inst.nombre_corto}`
        : data.isReactivation 
          ? `🔓 Reactivación de Acceso - ${inst.nombre_corto}`
          : `🏫 Tus Credenciales de Acceso - ${inst.nombre_corto}`,
      html: htmlContent,
    });

    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error('Error correo:', error);
    return { success: false, error: error.message };
  }
}

export async function sendDocumentReminderEmail(data: ReminderEmailData) {
  try {
    const inst = await getInstitucionConfig();
    const transporter = createSmtpTransporter(inst);

    if (!transporter) {
      return { success: false, error: SMTP_NOT_CONFIGURED_ERROR };
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://plataforma.ejemplo.edu';
    const horarioString = await getHorariosFormateados();
    const logoUrl = inst.logo_url || `${appUrl}/images/logo_placeholder.svg`;
    const colorPrincipal = inst.color_primario || '#333333';
    const colorSecundario = inst.color_secundario || '#1A4A3F';
    const fromName = inst.smtp_from_name || `Servicios Escolares - ${inst.siglas}`;

    const listaFaltantes = data.faltantes.map(doc => `<li style="margin-bottom: 8px; color: ${colorPrincipal}; font-weight: bold;">• ${doc}</li>`).join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #eee;">
        <div style="background: linear-gradient(135deg, ${colorPrincipal}, ${colorSecundario}); padding: 30px; text-align: center;">
          <img src="${logoUrl}" alt="Logo" style="height: 120px; width: auto; margin-bottom: 10px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 18px; text-transform: uppercase;">${inst.nombre_completo}</h1>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">Recordatorio de Documentación Pendiente</h2>
          <p style="color: #555; line-height: 1.6;">Estimado(a) <strong>${data.nombre}</strong>,</p>
          <p style="color: #555; line-height: 1.6;">Le informamos que su expediente académico se encuentra incompleto. Para regularizar su situación, es necesario entregar a la brevedad los siguientes documentos:</p>
          <ul style="list-style: none; padding-left: 0; margin: 20px 0;">
            ${listaFaltantes}
          </ul>
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 6px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 13px;">Favor de presentarlos en el área de Servicios Escolares ${horarioString}.</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">Este es un recordatorio automático. Si ya entregó estos documentos, favor de hacer caso omiso.</p>
        </div>
      </div>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"${fromName}" <${inst.smtp_user}>`,
      to: data.to,
      subject: `⚠️ Aviso: Documentación Pendiente - ${inst.siglas}`,
      html: htmlContent,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error enviando recordatorio:', error);
    return { success: false, error: error.message };
  }
}
// (No extra utilities needed)
