import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'ieemilianozapata@gmail.com',
    pass: process.env.GMAIL_APP_PASSWORD || 'hznuhunfisewlvgq',
  },
});

interface WelcomeEmailData {
  to: string;
  nombre: string;
  apellidos: string;
  rol: string;
  matricula?: string | null;
  numero_empleado?: string | null;
  password: string;
}

interface ReminderEmailData {
  to: string;
  nombre: string;
  faltantes: string[];
}

export async function sendWelcomeEmail(data: WelcomeEmailData) {
  try {
    const user = process.env.GMAIL_USER || 'ieemilianozapata@gmail.com';
    const pass = process.env.GMAIL_APP_PASSWORD || 'hznuhunfisewlvgq';

    if (!user || !pass) {
      console.warn('⚠️ Credenciales de Gmail no configuradas.');
      return { success: false, error: 'Credenciales de correo no configuradas' };
    }

    const rolTexto: Record<string, string> = {
      alumno: '🎓 Alumno',
      profesor: '👨‍🏫 Profesor',
      admin: '🛡️ Administrador',
      superuser: '⚙️ Super Administrador',
    };

    const rolLabel = rolTexto[data.rol] || data.rol;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://institutoeducativoemilianozapata.vercel.app';
    const logoUrl = `${appUrl}/images/logo_zapata.png`;

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

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        <div style="background: linear-gradient(135deg, #8B2332, #6B1A27); padding: 40px 30px; text-align: center;">
          <img src="${logoUrl}" alt="Logo" style="height: 180px; width: auto; margin-bottom: 15px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">
            Instituto Educativo Emiliano Zapata
          </h1>
          <p style="color: #f0d0d5; margin: 5px 0 0; font-size: 13px;">Sistema de Gestión Académica</p>
        </div>

        <div style="padding: 40px 30px 20px; text-align: center;">
          <h2 style="color: #333; margin: 0 0 10px; font-size: 22px;">¡Bienvenido(a), ${data.nombre}!</h2>
          <p style="color: #666; font-size: 15px; line-height: 1.6; margin: 0;">
            Tu cuenta ha sido creada exitosamente como <strong>${rolLabel}</strong>.
          </p>
        </div>

        <div style="margin: 20px 30px; background-color: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef; overflow: hidden;">
          <div style="background-color: #8B2332; padding: 12px 20px;">
            <h3 style="color: #ffffff; margin: 0; font-size: 15px; text-align: center;">🔐 Datos de Acceso</h3>
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 10px 20px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">👤 Usuario</td><td style="padding: 10px 20px; border-bottom: 1px solid #eee; color: #333;">${data.to}</td></tr>
            <tr><td style="padding: 10px 20px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">🔑 Contraseña</td><td style="padding: 10px 20px; border-bottom: 1px solid #eee; color: #333; font-weight: bold; background: #fff3cd;">${data.password}</td></tr>
            <tr><td style="padding: 10px 20px; border-bottom: 1px solid #eee; font-weight: bold; color: #555;">🎭 Rol</td><td style="padding: 10px 20px; border-bottom: 1px solid #eee; color: #333;">${rolLabel}</td></tr>
            ${identificacionHTML}
          </table>
        </div>

        <div style="text-align: center; padding: 20px;">
          <a href="${appUrl}" style="display: inline-block; background: #8B2332; color: #ffffff; padding: 14px 40px; border-radius: 6px; text-decoration: none; font-weight: bold;">Iniciar Sesión →</a>
        </div>

        <div style="margin: 0 30px 30px; padding: 15px; background-color: #fff3cd; border-radius: 6px; border-left: 4px solid #ffc107;">
          <p style="margin: 0; color: #856404; font-size: 13px;">
            ⚠️ <strong>Importante:</strong> Guarda bien esta contraseña. No compartas estos datos con terceros.
          </p>
        </div>

        <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #eee;">
          <p style="margin: 0; color: #999; font-size: 11px;">
            <strong>Instituto Educativo Emiliano Zapata</strong> © ${new Date().getFullYear()}
          </p>
        </div>
      </div>
    </body>
    </html>`;

    const info = await transporter.sendMail({
      from: `"Instituto Educativo Emiliano Zapata" <${user}>`,
      to: data.to,
      subject: '🏫 Registro Exitoso - Instituto Educativo Emiliano Zapata',
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
    const user = process.env.GMAIL_USER || 'ieemilianozapata@gmail.com';
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://institutoeducativoemilianozapata.vercel.app';
    const logoUrl = `${appUrl}/images/logo_zapata.png`;

    const listaFaltantes = data.faltantes.map(doc => `<li style="margin-bottom: 8px; color: #8B2332; font-weight: bold;">• ${doc}</li>`).join('');

    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #eee;">
        <div style="background: linear-gradient(135deg, #8B2332, #6B1A27); padding: 30px; text-align: center;">
          <img src="${logoUrl}" alt="Logo" style="height: 120px; width: auto; margin-bottom: 10px;">
          <h1 style="color: #ffffff; margin: 0; font-size: 18px; text-transform: uppercase;">Instituto Educativo Emiliano Zapata</h1>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #333;">Recordatorio de Documentación Pendiente</h2>
          <p style="color: #555; line-height: 1.6;">Estimado(a) <strong>${data.nombre}</strong>,</p>
          <p style="color: #555; line-height: 1.6;">Le informamos que su expediente académico se encuentra incompleto. Para regularizar su situación, es necesario entregar a la brevedad los siguientes documentos:</p>
          <ul style="list-style: none; padding-left: 0; margin: 20px 0;">
            ${listaFaltantes}
          </ul>
          <div style="background-color: #fff3cd; padding: 15px; border-radius: 6px; border-left: 4px solid #ffc107; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 13px;">Favor de presentarlos en el área de Servicios Escolares de lunes a viernes en un horario de 9:00 AM a 6:00 PM.</p>
          </div>
          <p style="color: #999; font-size: 12px; margin-top: 30px; text-align: center;">Este es un recordatorio automático. Si ya entregó estos documentos, favor de hacer caso omiso.</p>
        </div>
      </div>
    </body>
    </html>`;

    await transporter.sendMail({
      from: `"Servicios Escolares - IE Emiliano Zapata" <${user}>`,
      to: data.to,
      subject: '⚠️ Aviso: Documentación Pendiente - IE Emiliano Zapata',
      html: htmlContent,
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error enviando recordatorio:', error);
    return { success: false, error: error.message };
  }
}
