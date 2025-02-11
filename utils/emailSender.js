const sgMail = require("@sendgrid/mail");
const { logAction } = require("../logger/logger");

const dotenv = require("dotenv");

dotenv.config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const fromEmail = process.env.FROM_EMAIL;
const sendAgendaEmail = async ({ to, subject, header, text, attachments }) => {
  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
  const formattedText = text.replace(/(?:\r\n|\r|\n)/g, "<br>");
  const html = `
        <!DOCTYPE html>
        <html lang="es">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Promoción</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
            }
            .container {
              width: 100%;
              max-width: 600px;
              margin: 0 auto;
              background-color: #ffffff;
              padding: 20px;
              border-radius: 10px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              text-align: center;
              padding-bottom: 20px;
            }
            .header img {
              max-width: 150px;
            }
            .content {
              padding: 20px;
              text-align: center;
            }
            .content h1 {
              color: #333333;
            }
            .content p {
              color: #666666;
              line-height: 1.6;
            }
            .button {
              display: inline-block;
              padding: 10px 20px;
              color: #ffffff;
              background-color: #5c7898;
              border-radius: 5px;
              text-decoration: none;
              margin-top: 20px;
              text-color: #ffffff;
              color: #ffffff;
            }
            .footer {
              text-align: center;
              padding: 20px;
              font-size: 12px;
              color: #aaaaaa;
            }

            .button.confirm {
            background-color: #5c7898;
            color: white; 

            }
            .button.cancel {
            background-color: #ffffff; /* White */
            border: 2px solid #f44336; /* Red border */
            color: black; /* Text color */ 
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="content">
            ${header ? `<h1>${header}</h1>` : ""}
              <p>${formattedText}</p>
            </div>
            <div class="footer">
            <img src="${logoUrl}" alt="FidelidApp Logo" height="100">
              <p>&copy; ${new Date().getFullYear()} FidelidApp. Todos los derechos reservados.</p>
            </div>
          </div>
        </body>
        </html>
      `;
  try {
    const msg = {
      to,
      from: fromEmail,
      subject,
      html,
      attachments,
    };

    await sgMail.send(msg);
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};
const sendMarketingEmail = async ({ to, subject, header, text, attachments }) => {
  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
  const formattedText = text.replace(/(?:\r\n|\r|\n)/g, "<br>");

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Promoción</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
        }
        .container {
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          background-color: #ffffff;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header {
          text-align: center;
          padding-bottom: 20px;
        }
        .header img {
          max-width: 150px;
        }
        .content {
          padding: 20px;
          text-align: center;
        }
        .content h1 {
          color: #333333;
        }
        .content p {
          color: #666666;
          line-height: 1.6;
        }
        .footer {
          text-align: center;
          padding: 20px;
          font-size: 12px;
          color: #aaaaaa;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="content">
          ${header ? `<h1>${header}</h1>` : ""}
          <p>${formattedText}</p>
        </div>
        <div class="footer">
          <p>Powered by FidelidApp.cl</p>
          <img src="${logoUrl}" alt="FidelidApp Logo" height="50">
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const msg = {
      to,
      from: fromEmail,
      subject,
      html,
      attachments: attachments || [],
    };

    await sgMail.send(msg);
    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};
const sendRegisterEmail = async (name, email) => {
  // Verificar que los parámetros no sean undefined o null
  if (!email) {
    throw new Error("Email es requerido para enviar el correo de registro");
  }

  if (!name) {
    name = "Usuario"; // Valor por defecto si no se proporciona nombre
  }

  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png";
  const subject = "¡Bienvenido a la familia Fidelidapp! 🎉";
  const header = "¡Tu negocio está a punto de crecer!";
  const frontendUrl = process.env.FRONTEND_URL;

  // Contenido del email con el logo incluido
  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>¡Bienvenido a Fidelidapp!</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f9f9f9;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 20px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
        
        <!-- Sección del logo -->
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Fidelidapp Logo" style="height: 80px; display: block; margin: auto;">
        </div>
        
        <h1 style="color: #5b7898; text-align: center; font-size: 24px; margin-bottom: 20px;">${header}</h1>
        <p style="margin: 0 0 10px;">¡Hola ${name}! 👋</p>
        <p style="margin: 0 0 10px;">Estamos emocionados de tenerte como parte de la familia Fidelidapp. Has dado el primer paso para transformar la forma en que conectas con tus clientes.</p>

        <p style="margin: 20px 0 10px;">Con Fidelidapp podrás:</p>
        <ul style="padding-left: 20px; margin: 0 0 20px;">
          <li style="margin-bottom: 10px;">📇 Tener una base de datos de tus clientes y enviarles campañas de email marketing.</li>
          <li style="margin-bottom: 10px;">🎯 Implementar un sistema de puntos y recompensas personalizado.</li>
          <li style="margin-bottom: 10px;">💳 Ofrecer descuentos exclusivos para tus clientes.</li>
          <li style="margin-bottom: 10px;">📊 Segmentar a tus clientes para ofrecerles promociones específicas.</li>
        </ul>

        <h3 style="color: #5b7898; font-size: 18px; margin-top: 30px; margin-bottom: 10px;">Nuestros Servicios:</h3>
        <ul style="padding-left: 20px; margin: 0 0 20px;">
          <li><b>Campañas de Google Ads:</b> Creación, gestión y optimización de anuncios para alimentar tu base de datos.</li>
          <li><b>Campañas de Meta Ads:</b> Publicación, monitoreo, optimización y engagement con tus seguidores.</li>
          <li><b>Servicio Community Manager Meta:</b> Publicaciones en Facebook e Instagram, generación de contenido, historias con novedades y promociones.</li>
          <li><b>Construcción de Landing Page Corporativa:</b> Diseño y mantenimiento de una página informativa, incluye dominio y hosting.</li>
          <li><b>Servicios On-Site:</b> Activación del programa, capacitación del personal, sesiones fotográficas y materiales promocionales.</li>
          <li><b>Plataforma Fidelidapp:</b> Gestión de promociones, sistema de puntos, email marketing (10,000/mes), reportes de uso y mensajes automatizados.</li>
          <li><b>Campañas de Email Marketing:</b> Diseño, redacción y envío de correos personalizados con promociones exclusivas.</li>
          <li><b>SMS Marketing:</b> Envía mensajes personalizados directamente al teléfono de tus clientes para promociones inmediatas.</li>
        </ul>

        <p style="margin-top: 30px; text-align: center;">Si necesitas ayuda para comenzar o tienes alguna pregunta, contáctanos:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://wa.me/56996706983" target="_blank" style="display: inline-block; background-color: #25D366; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px;">📱 WhatsApp</a>
          <a href="mailto:contacto@fidelidapp.com" style="display: inline-block; background-color: #5b7898; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">💌 Enviar Email</a>
        </div>

        <p style="text-align: center; font-size: 14px; color: #888; margin: 0;">¡Prepárate para llevar tu negocio al siguiente nivel!</p>
        <p style="text-align: right; font-style: italic; margin: 0;">Saludos cordiales,<br>El equipo de Fidelidapp 💪</p>

        <!-- Pie de página -->
        <div style="text-align: center; font-size: 12px; color: #888; margin-top: 20px;">
          <p>© 2025 Todos los derechos reservados Fidelidapp</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const msg = {
      to: email,
      from: fromEmail,
      subject,
      html,
    };

    // Verificación adicional antes de enviar
    if (!msg.to) {
      throw new Error("Destinatario (to) es requerido");
    }

    await sgMail.send(msg);

    console.log("Email enviado correctamente a:", email);
  } catch (error) {
    console.error("Error al enviar email de registro:", error);
    throw error;
  }
};

const sendReminderEmail = async (account) => {
  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // URL del logo
  const subject = "¿Ya empezaste a usar Fidelidapp? 🚀";
  const to = account.userEmails; // Dirección de email del destinatario

  // Contenido del email con el logo incluido
  const html = `
      <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>¡Recordatorio de Fidelidapp!</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f9f9f9;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 20px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
        
        <!-- Sección del logo -->
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="Fidelidapp Logo" style="height: 80px; display: block; margin: auto;">
        </div>
        
        <h1 style="color: #5b7898; text-align: center;">¡Hola de nuevo! 👋</h1>
        <h2 style="color: #555; text-align: center;">¿Ya empezaste a usar Fidelidapp? 🚀</h2>

        <p style="margin: 0 0 10px;">Hace una semana te dimos la bienvenida a Fidelidapp, y queremos recordarte todas las increíbles herramientas que tienes a tu disposición para conectar con tus clientes y hacer crecer tu negocio.</p>

        <h3 style="color: #5b7898; margin-top: 20px;">Con Fidelidapp puedes:</h3>
        <ul style="padding-left: 20px; margin: 0 0 20px;">
          <li style="margin-bottom: 10px;">📇 Tener una base de datos organizada de tus clientes y enviarles campañas de email marketing.</li>
          <li style="margin-bottom: 10px;">🎯 Crear sistemas de puntos y recompensas únicos.</li>
          <li style="margin-bottom: 10px;">💳 Ofrecer descuentos exclusivos y promociones personalizadas.</li>
          <li style="margin-bottom: 10px;">📊 Segmentar a tus clientes según sus preferencias y comportamiento.</li>
        </ul>

        <p style="margin: 20px 0;">Recuerda que también ofrecemos una variedad de servicios diseñados para potenciar tu negocio:</p>
        <ul style="padding-left: 20px; margin: 0 0 20px;">
          <li style="margin-bottom: 10px;">🌟 <b>Campañas de Google Ads y Meta Ads:</b> Gestión profesional de anuncios para aumentar tu visibilidad.</li>
          <li style="margin-bottom: 10px;">📱 <b>SMS y Email Marketing:</b> Comunicación directa y efectiva con tus clientes.</li>
          <li style="margin-bottom: 10px;">🌐 <b>Landing Pages:</b> Diseñadas para captar nuevos interesados.</li>
          <li style="margin-bottom: 10px;">🎨 <b>Community Manager:</b> Contenido atractivo para tus redes sociales.</li>
          <li style="margin-bottom: 10px;">🏪 <b>Servicios On-Site:</b> Activación, capacitación y materiales promocionales.</li>
        </ul>

        <p style="margin-top: 20px; text-align: center;">No dejes pasar la oportunidad de transformar tu negocio y fidelizar a tus clientes de manera efectiva.</p>
        
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://wa.me/56996706983" target="_blank" style="display: inline-block; background-color: #25D366; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold; margin-right: 10px;">📱 Escríbenos por WhatsApp</a>
          <a href="mailto:contacto@fidelidapp.com" style="display: inline-block; background-color: #5b7898; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">💌 Contáctanos por Email</a>
        </div>

        <p style="text-align: center; font-size: 14px; color: #888;">¡Estamos aquí para ayudarte a sacar el máximo provecho de Fidelidapp!</p>
        <p style="text-align: right; font-style: italic;">Saludos cordiales,<br>El equipo de Fidelidapp 💪</p>

        <!-- Pie de página -->
        <div style="text-align: center; font-size: 12px; color: #888; margin-top: 20px;">
          <p>© 2025 Todos los derechos reservados Fidelidapp</p>
        </div>
      </div>
    </body>
    </html> 
  `;

  try {
    const msg = {
      to,
      from: fromEmail, // Dirección desde donde se envía
      subject,
      html,
    };

    // Enviar email usando SendGrid
    await sgMail.send(msg);
    console.log("Email de recordatorio enviado correctamente.");
  } catch (error) {
    console.error("Error al enviar email de recordatorio:", error);
    throw error;
  }
};

const sendAutomatedEmail = async ({ to, subject, html }) => {
  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png"; // Replace with your actual logo URL
  const formattedText = html.replace(/(?:\r\n|\r|\n)/g, "<br>");

  try {
    const msg = {
      to,
      from: fromEmail,
      subject,
      html,
    };
    await sgMail.send(msg);

    console.log("Email sent successfully.");
  } catch (error) {
    console.error("Error sending email:", error);
    throw error;
  }
};

const sendVerificationEmail = async (email, verificationToken) => {
  console.log(fromEmail);
  const logoUrl = "https://res.cloudinary.com/di92lsbym/image/upload/v1729563774/q7bruom3vw4dee3ld3tn.png";
  const subject = "Verifica tu correo electrónico - FidelidApp";
  const verificationLink = `${process.env.FRONTEND_URL}/auth/verify-email/${verificationToken}`;

  const html = `
    <!DOCTYPE html>
    <html lang="es">

    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verificación de Correo Electrónico</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background-color: #f9f9f9;">
      <div style="max-width: 600px; margin: auto; background: #ffffff; padding: 20px; border: 1px solid #ddd; border-radius: 8px; box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);">
        
        <div style="text-align: center; margin-bottom: 20px;">
          <img src="${logoUrl}" alt="FidelidApp Logo" style="height: 80px; display: block; margin: auto;">
        </div>
        
        <h1 style="color: #5b7898; text-align: center;">Verifica tu correo electrónico</h1>
        
        <p style="margin: 20px 0;">¡Gracias por registrarte en FidelidApp! Para completar tu registro y comenzar a usar nuestra plataforma, por favor verifica tu dirección de correo electrónico haciendo clic en el siguiente botón:</p>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${verificationLink}" style="display: inline-block; background-color: #5b7898; color: #ffffff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verificar correo electrónico</a>
        </div>
        
        <p style="margin: 20px 0;">Si el botón no funciona, puedes copiar y pegar el siguiente enlace en tu navegador:</p>
        <p style="margin: 10px 0; word-break: break-all; color: #5b7898;">${verificationLink}</p>
        
        <p style="margin: 20px 0;">Este enlace expirará en 24 horas por razones de seguridad.</p>
        
        <p style="margin: 20px 0;">Si no has solicitado esta verificación, puedes ignorar este correo.</p>
        
        <div style="text-align: center; font-size: 12px; color: #888; margin-top: 30px; border-top: 1px solid #eee; padding-top: 20px;">
          <p>© ${new Date().getFullYear()} FidelidApp. Todos los derechos reservados.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  try {
    const msg = {
      to: email,
      from: fromEmail,
      subject,
      html,
    };

    await sgMail.send(msg);
    console.log("Email de verificación enviado correctamente.");
  } catch (error) {
    console.error("Error al enviar email de verificación:", error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendMarketingEmail,
  sendAgendaEmail,
  sendRegisterEmail,
  sendReminderEmail,
  sendAutomatedEmail,
};
