
import nodemailer from 'nodemailer';

// Crear el transportador de Gmail
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

export async function sendWelcomeEmail(data: WelcomeEmailData) {
  try {
    const user = process.env.GMAIL_USER || 'ieemilianozapata@gmail.com';
    const pass = process.env.GMAIL_APP_PASSWORD || 'hznuhunfisewlvgq';

    if (!user || !pass) {
      console.warn('⚠️ Credenciales de Gmail no configuradas. Correo no enviado.');
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

    // Información de identificación según rol
    let identificacionHTML = '';
    if (data.rol === 'alumno' && data.matricula) {
      identificacionHTML = `
        <tr>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                      font-weight: bold; color: #555; width: 40%;">
            📋 Matrícula
          </td>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                      color: #333;">
            ${data.matricula}
          </td>
        </tr>`;
    } else if ((data.rol === 'profesor' || data.rol === 'admin') && data.numero_empleado) {
      identificacionHTML = `
        <tr>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                      font-weight: bold; color: #555; width: 40%;">
            🏷️ No. Empleado
          </td>
          <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                      color: #333;">
            ${data.numero_empleado}
          </td>
        </tr>`;
    }

    // HTML del correo
    const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f4f4f4;
                  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">

        <!-- HEADER -->
        <div style="background: linear-gradient(135deg, #8B2332, #6B1A27);
                    padding: 40px 30px; text-align: center;">
          <img src="${logoUrl}" alt="Logo Zapata" style="height: 80px; width: auto; margin-bottom: 15px; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.2));">
          <h1 style="color: #ffffff; margin: 0; font-size: 24px;
                      font-weight: bold; letter-spacing: 0.5px; text-transform: uppercase;">
            Instituto Educativo Emiliano Zapata
          </h1>
          <p style="color: #f0d0d5; margin: 5px 0 0; font-size: 14px;">
            Sistema de Gestión Académica
          </p>
        </div>

        <!-- BIENVENIDA -->
        <div style="padding: 40px 30px 20px; text-align: center;">
          <div style="width: 70px; height: 70px;
                      background: linear-gradient(135deg, #4CAF50, #45a049);
                      border-radius: 50%; margin: 0 auto 20px;
                      line-height: 70px; text-align: center; color: white; font-size: 32px; font-weight: bold;">
            ✓
          </div>
          <h2 style="color: #333; margin: 0 0 10px; font-size: 24px;">
            ¡Bienvenido(a), ${data.nombre}!
          </h2>
          <p style="color: #666; font-size: 16px; line-height: 1.6; margin: 0;">
            Tu cuenta ha sido creada exitosamente como
            <strong>${rolLabel}</strong>.
            <br>A continuación encontrarás tus datos de acceso oficiales.
          </p>
        </div>

        <!-- DATOS DE ACCESO -->
        <div style="margin: 20px 30px; background-color: #f8f9fa;
                    border-radius: 12px; border: 1px solid #e9ecef;
                    overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
          <div style="background-color: #8B2332; padding: 15px 20px;">
            <h3 style="color: #ffffff; margin: 0; font-size: 16px; text-align: center;">
              🔐 Credenciales de Acceso
            </h3>
          </div>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          font-weight: bold; color: #555; width: 40%;">
                👤 Nombre Completo
              </td>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          color: #333;">
                ${data.nombre} ${data.apellidos}
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          font-weight: bold; color: #555;">
                📧 Correo Electrónico
              </td>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          color: #333;">
                ${data.to}
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          font-weight: bold; color: #555;">
                🔑 Contraseña
              </td>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          color: #333; font-family: 'Courier New', monospace;
                          font-size: 16px; background-color: #fff3cd;
                          letter-spacing: 1px; font-weight: bold;">
                ${data.password}
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          font-weight: bold; color: #555;">
                🎭 Rol Asignado
              </td>
              <td style="padding: 12px 20px; border-bottom: 1px solid #f0f0f0;
                          color: #333;">
                ${rolLabel}
              </td>
            </tr>
            ${identificacionHTML}
          </table>
        </div>

        <!-- BOTÓN -->
        <div style="text-align: center; padding: 25px 30px;">
          <a href="${appUrl}"
             style="display: inline-block;
                    background: linear-gradient(135deg, #8B2332, #6B1A27);
                    color: #ffffff; padding: 18px 50px; border-radius: 10px;
                    text-decoration: none; font-size: 16px; font-weight: bold;
                    box-shadow: 0 4px 15px rgba(139, 35, 50, 0.3);">
            Entrar al Sistema →
          </a>
        </div>

        <!-- ADVERTENCIA -->
        <div style="margin: 10px 30px 30px; padding: 20px;
                    background-color: #fff3cd; border-radius: 8px;
                    border-left: 4px solid #ffc107;">
          <p style="margin: 0; color: #856404; font-size: 14px; line-height: 1.5;">
            ⚠️ <strong>Importante:</strong> Guarda bien esta contraseña. No compartas estos datos con terceros.
          </p>
        </div>

        <!-- FOOTER -->
        <div style="background-color: #f8f9fa; padding: 25px 30px;
                    text-align: center; border-top: 1px solid #e9ecef;">
          <p style="margin: 0; color: #999; font-size: 12px; line-height: 1.6;">
            Este es un correo automático del Sistema de Gestión Académica.
            <br>No es necesario responder a este mensaje.
            <br><br>
            <strong>Instituto Educativo Emiliano Zapata</strong> © ${new Date().getFullYear()}
          </p>
        </div>

      </div>
    </body>
    </html>`;

    // ENVIAR EL CORREO
    const info = await transporter.sendMail({
      from: `"🏫 Instituto Educativo Emiliano Zapata" <${user}>`,
      to: data.to,
      subject: '🏫 Bienvenido(a) al Sistema Académico - Instituto Educativo Emiliano Zapata',
      html: htmlContent,
    });

    console.log('✅ Correo de bienvenida enviado:', info.messageId);
    return { success: true, messageId: info.messageId };

  } catch (error: any) {
    console.error('❌ Error al enviar correo de bienvenida:', error);
    return { success: false, error: error.message };
  }
}
