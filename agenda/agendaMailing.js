const sgMail = require("@sendgrid/mail");
const Account = require("../accounts/Account.model");
const Agenda = require("./agenda.model");
const Appointment = require("./appointment.model");
const { format } = require("date-fns");
const { es } = require("date-fns/locale");

// Configurar SendGrid con tu API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const emailSender = "santimariabruno@gmail.com";
const formatDateTime = (date) => {
  return format(new Date(date), "PPpp", { locale: es });
};

const generateCalendarLinks = (appointment, agenda) => {
  const startTime = new Date(appointment.startTime);
  const endTime = new Date(startTime.getTime() + agenda.duration * 60000);

  // Formato para Google Calendar
  const googleParams = new URLSearchParams({
    action: "TEMPLATE",
    text: `Cita en ${agenda.name}`,
    details: `Cita con ${appointment.clientName}`,
    dates:
      `${startTime
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}/` +
      `${endTime
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "")}`,
  }).toString();
  const googleUrl = `https://calendar.google.com/calendar/render?${googleParams}`;

  // Formato para Outlook Web
  const outlookParams = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    startdt: startTime.toISOString(),
    enddt: endTime.toISOString(),
    subject: `Cita en ${agenda.name}`,
  }).toString();
  const outlookUrl = `https://outlook.live.com/calendar/0/${outlookParams}`;

  return `
    <div style="margin-top: 20px; text-align: center;">
      <p style="margin-bottom: 10px;"><strong>Agregar a calendario:</strong></p>
      <a href="${googleUrl}" target="_blank" style="display: inline-block; margin: 5px; padding: 8px 15px; background-color: #4285f4; color: white; text-decoration: none; border-radius: 5px;">
        Google Calendar
      </a>
      <a href="${outlookUrl}" target="_blank" style="display: inline-block; margin: 5px; padding: 8px 15px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 5px;">
        Outlook Calendar
      </a>
    </div>
  `;
};

const sendAppointmentRequestEmails = async (appointment) => {
  try {
    const agenda = await Agenda.findById(appointment.agendaId);
    const account = await Account.findById(agenda.accountId);

    // Email para el cliente
    const clientMsg = {
      to: appointment.clientEmail,
      from: emailSender,
      subject: `Solicitud de cita - ${agenda.name}`,
      html: `

        <div style="font-family: Arial, sans-serif;">
          <h2>Has solicitado una cita en ${agenda.name}</h2>
          <div style="margin: 20px 0;">
            <p><strong>Detalles de tu cita:</strong></p>
            <ul>
              <li>Fecha y hora: ${formatDateTime(appointment.startTime)}</li>
              <li>Duración: ${agenda.duration} minutos</li>
              ${appointment.numberOfPeople > 1 ? `<li>Número de personas: ${appointment.numberOfPeople}</li>` : ""}
              ${appointment.notes ? `<li>Notas: ${appointment.notes}</li>` : ""}
            </ul>
          </div>
          <div style="margin: 20px 0;">
            <p>Estado: <strong>Pendiente de confirmación</strong></p>
            <p>Recibirás un correo cuando el prestador confirme tu cita.</p>
          </div>
          <div style="margin: 20px 0;">
            <a href="${process.env.FRONTEND_URL}/appointments/${appointment._id}/cancel"
               style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Cancelar Cita
            </a>
          </div>
        </div>
      `,
    };

    // Email para el dueño de la agenda
    const ownerMsg = {
      to: account.userEmails[0],
      from: emailSender,
      subject: `Nueva solicitud de cita - ${agenda.name}`,
      html: `

        <div style="font-family: Arial, sans-serif;">

          <h2>Nueva solicitud de cita</h2>
          <div style="margin: 20px 0;">
            <p><strong>Detalles de la cita:</strong></p>
            <ul>
              <li>Cliente: ${appointment.clientName}</li>
              <li>Email: ${appointment.clientEmail}</li>
              <li>Teléfono: ${appointment.clientPhone || "No proporcionado"}</li>
              <li>Fecha y hora: ${formatDateTime(appointment.startTime)}</li>
              ${appointment.numberOfPeople > 1 ? `<li>Número de personas: ${appointment.numberOfPeople}</li>` : ""}
              ${appointment.notes ? `<li>Notas: ${appointment.notes}</li>` : ""}
            </ul>
          </div>
          <div style="margin: 20px 0;">
            <p style="margin-bottom: 15px;">Ingresa al dashboard para manejar tus agendas y citas:</p>
            <a href="${process.env.FRONTEND_URL}/dashboard/agenda"
               style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block; margin-bottom: 15px;">
              Ir al Dashboard
            </a>
            
          </div>
        </div>
      `,
    };

    await sgMail.send([clientMsg, ownerMsg]);
  } catch (error) {
    console.error("Error enviando emails de solicitud:", error);
    throw error;
  }
};

const sendStatusChangeEmails = async (appointment, newStatus) => {
  try {
    const agenda = await Agenda.findById(appointment.agendaId);
    const account = await Account.findById(agenda.accountId);

    // Verificar que tengamos los emails necesarios
    if (!appointment.clientEmail || !account.userEmails[0]) {
      console.error("Faltan direcciones de email necesarias");
      return;
    }

    const statusTexts = {
      created: "creada",
      confirmed: "confirmada",
      cancelled: "cancelada",
      rejected: "rechazada",
    };

    // Si el estado no está en nuestro mapping, no enviamos emails
    if (!statusTexts[newStatus]) {
      console.error(`Estado no reconocido: ${newStatus}`);
      return;
    }

    // Email para el cliente
    const clientMsg = {
      to: appointment.clientEmail,
      from: emailSender,
      subject: `Cita ${statusTexts[newStatus]} - ${agenda.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2c3e50; margin-bottom: 25px; text-align: center; border-bottom: 2px solid #eee; padding-bottom: 15px;">
              ${
                newStatus === "created"
                  ? "🎉 ¡Tu cita ha sido registrada!"
                  : newStatus === "confirmed"
                  ? "✅ ¡Tu cita ha sido confirmada!"
                  : newStatus === "cancelled"
                  ? "❌ Tu cita ha sido cancelada"
                  : newStatus === "rejected"
                  ? "❌ Tu cita ha sido rechazada"
                  : ""
              }
            </h2>
            
            <div style="margin: 20px 0; background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <p style="color: #2c3e50; font-size: 18px; font-weight: bold; margin-bottom: 15px;">📋 Detalles de la cita:</p>
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="margin-bottom: 12px; color: #34495e;">
                  <strong>🏢 Servicio:</strong> ${agenda.name}
                </li>
                <li style="margin-bottom: 12px; color: #34495e;">
                  <strong>🗓️ Fecha y hora:</strong> ${formatDateTime(appointment.startTime)}
                </li>
                ${
                  appointment.numberOfPeople > 1
                    ? `<li style="margin-bottom: 12px; color: #34495e;">
                    <strong>👥 Número de personas:</strong> ${appointment.numberOfPeople}
                  </li>`
                    : ""
                }
              </ul>
            </div>

            ${
              newStatus === "created"
                ? `<p style="text-align: center; color: #666; margin-top: 20px;">
                Recibirás un correo cuando el prestador confirme tu cita.
              </p>`
                : ""
            }

            ${
              newStatus === "confirmed"
                ? `<p style="text-align: center; color: #666; margin-top: 20px;">
                Te esperamos en la fecha y hora indicada.
              </p>`
                : ""
            }

            ${newStatus === "confirmed" ? generateCalendarLinks(appointment, agenda) : ""}
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>Este es un correo automático, por favor no responder.</p>
          </div>
        </div>
      `,
    };

    // Email para el dueño de la agenda
    const ownerMsg = {
      to: account.userEmails[0],
      from: emailSender,
      subject: `Cita ${statusTexts[newStatus]} - ${agenda.name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: #ffffff; padding: 30px; border-radius: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            <h2 style="color: #2c3e50; margin-bottom: 25px; text-align: center; border-bottom: 2px solid #eee; padding-bottom: 15px;">
              ${newStatus === "created" ? "🎉 ¡Nueva solicitud de cita!" : `Has ${statusTexts[newStatus]} una cita`}
            </h2>
            
            <div style="margin: 20px 0; background-color: #f8f9fa; padding: 20px; border-radius: 8px;">
              <p style="color: #2c3e50; font-size: 18px; font-weight: bold; margin-bottom: 15px;">📋 Detalles de la cita:</p>
              <ul style="list-style: none; padding: 0; margin: 0;">
                <li style="margin-bottom: 12px; color: #34495e;">
                  <strong>👤 Cliente:</strong> ${appointment.clientName}
                </li>
                <li style="margin-bottom: 12px; color: #34495e;">
                  <strong>📧 Email:</strong> ${appointment.clientEmail}
                </li>
                <li style="margin-bottom: 12px; color: #34495e;">
                  <strong>📱 Teléfono:</strong> ${appointment.clientPhone || "No proporcionado"}
                </li>
                <li style="margin-bottom: 12px; color: #34495e;">
                  <strong>🗓️ Fecha y hora:</strong> ${formatDateTime(appointment.startTime)}
                </li>
                ${
                  appointment.numberOfPeople > 1
                    ? `<li style="margin-bottom: 12px; color: #34495e;">
                    <strong>👥 Número de personas:</strong> ${appointment.numberOfPeople}
                  </li>`
                    : ""
                }
                ${
                  appointment.notes
                    ? `<li style="margin-bottom: 12px; color: #34495e;">
                    <strong>📝 Notas:</strong> ${appointment.notes}
                  </li>`
                    : ""
                }
              </ul>
            </div>

            ${
              newStatus === "created"
                ? `<div style="text-align: center; margin-top: 30px;">
                    <p style="margin-bottom: 20px; color: #666;">¿Qué deseas hacer con esta solicitud?</p>
                    <p>
                      <a href="http://localhost:5173/dashboard/agenda"
                         style="color: #3498db; text-decoration: none;">
                         Gestionar cita
                      </a>
                    </p>
                  </div>`
                : ""
            }
            
            ${newStatus === "confirmed" ? generateCalendarLinks(appointment, agenda) : ""}
          </div>
          <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
            <p>Este es un correo automático, por favor no responder.</p>
          </div>
        </div>
      `,
    };

    // Solo enviar si tenemos destinatarios válidos
    const emailsToSend = [];
    if (clientMsg.to) emailsToSend.push(clientMsg);
    if (ownerMsg.to) emailsToSend.push(ownerMsg);

    if (emailsToSend.length > 0) {
      await sgMail.send(emailsToSend);
    }
  } catch (error) {
    console.error("Error enviando emails de cambio de estado:", error);
    throw error;
  }
};

const sendReminderEmails = async (appointment) => {
  try {
    const agenda = await Agenda.findById(appointment.agendaId);
    const account = await Account.findById(agenda.accountId);

    // Email para el cliente
    const clientMsg = {
      to: appointment.clientEmail,
      from: emailSender,
      subject: `Recordatorio: Tu cita en ${agenda.name} es en 1 hora`,
      html: `

        <div style="font-family: Arial, sans-serif;">
          <h2>Recordatorio de tu cita</h2>
          <div style="margin: 20px 0;">
            <p><strong>Tu cita es en 1 hora:</strong></p>
            <ul>
              <li>Servicio: ${agenda.name}</li>
              <li>Fecha y hora: ${formatDateTime(appointment.startTime)}</li>
              <li>Dirección: [Agregar dirección del negocio]</li>
            </ul>
          </div>
        </div>
      `,
    };

    // Email para el dueño de la agenda
    const ownerMsg = {
      to: account.userEmails[0],
      from: emailSender,
      subject: `Recordatorio: Cita en 1 hora`,
      html: `

        <div style="font-family: Arial, sans-serif;">
          <h2>Recordatorio de cita</h2>
          <div style="margin: 20px 0;">
            <p><strong>Tienes una cita en 1 hora:</strong></p>
            <ul>
              <li>Cliente: ${appointment.clientName}</li>
              <li>Email: ${appointment.clientEmail}</li>
              <li>Teléfono: ${appointment.clientPhone || "No proporcionado"}</li>
              <li>Fecha y hora: ${formatDateTime(appointment.startTime)}</li>
              ${appointment.numberOfPeople > 1 ? `<li>Número de personas: ${appointment.numberOfPeople}</li>` : ""}
            </ul>
          </div>
        </div>
      `,
    };

    await sgMail.send([clientMsg, ownerMsg]);
  } catch (error) {
    console.error("Error enviando emails de recordatorio:", error);
    throw error;
  }
};

module.exports = {
  sendAppointmentRequestEmails,
  sendStatusChangeEmails,
  sendReminderEmails,
};
