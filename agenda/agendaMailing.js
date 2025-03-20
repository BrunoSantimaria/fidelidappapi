const sgMail = require("@sendgrid/mail");
const Account = require("../accounts/Account.model");
const Agenda = require("./agenda.model");

const { es } = require("date-fns/locale");
const { formatInTimeZone } = require("date-fns-tz");
const fromEmail = process.env.FROM_EMAIL;
// Configurar SendGrid con tu API key
sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const emailSender = fromEmail;

const formatDateTime = (date) => {
  return formatInTimeZone(new Date(date), "America/Santiago", "PPpp", { locale: es });
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
      <a href="${googleUrl}" target="_blank" style="display: inline-block; margin: 5px; padding: 8px 15px; background-color: #5c7898; color: white; text-decoration: none; border-radius: 5px;">
        Google Calendar
      </a>
      <a href="${outlookUrl}" target="_blank" style="display: inline-block; margin: 5px; padding: 8px 15px; background-color: #5c7898; color: white; text-decoration: none; border-radius: 5px;">
        Outlook Calendar
      </a>
    </div>
  `;
};

const generateEmailTemplate = (content) => `
  <div style="font-family: 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="background: linear-gradient(135deg, #5b7898 60%, #5b7898 100%); padding: 20px; border-radius: 10px 10px 0 0;">
      <h1 style="color: white; margin: 0; text-align: center;">${content.name}</h1>
    </div>
    <div style="background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
      ${content}
    </div>
  </div>
`;

const generateActionButtons = (appointment) => `
  <div style="text-align: center; margin-top: 30px;">
    <a href="${process.env.FRONTEND_URL}/appointments/confirm/${appointment.confirmationToken}"
       style="display: inline-block; padding: 12px 24px; margin: 0 10px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
      Confirmar Cita
    </a>
    <a href="${process.env.FRONTEND_URL}/appointments/cancel/${appointment.confirmationToken}"
       style="display: inline-block; padding: 12px 24px; margin: 0 10px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
      Cancelar Cita
    </a>
  </div>
`;

const sendAppointmentRequestEmails = async (appointment) => {
  try {
    console.log("Iniciando envío de correos para cita:", appointment._id);

    const agenda = await Agenda.findById(appointment.agendaId);
    console.log("Agenda encontrada:", agenda.name);

    const account = await Account.findById(agenda.accountId);
    console.log("Cuenta encontrada, emails:", account.userEmails);

    // Email para el cliente con los botones de confirmación/cancelación
    const clientMsg = {
      to: appointment.clientEmail,
      from: emailSender,
      subject: `Confirma tu cita - ${agenda.name}`,
      html: generateEmailTemplate(`
        <h2 style="color: #333; text-align: center;">Por favor confirma tu cita</h2>
        <div style="margin: 20px 0;">
          <p style="color: #666;">Hola ${appointment.clientName},</p>
          <p style="color: #666;">Has solicitado una cita en ${agenda.name}. Por favor confirma o cancela tu cita usando los botones a continuación:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Detalles de la cita:</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin-bottom: 10px;">📅 Fecha: ${formatDateTime(appointment.startTime)}</li>
              <li style="margin-bottom: 10px;">⏱️ Duración: ${agenda.duration} minutos</li>
              ${appointment.numberOfPeople > 1 ? `<li style="margin-bottom: 10px;">👥 Personas: ${appointment.numberOfPeople}</li>` : ""}
              ${appointment.notes ? `<li style="margin-bottom: 10px;">📝 Notas: ${appointment.notes}</li>` : ""}
            </ul>
          </div>
          
          ${generateActionButtons(appointment)}
          
          <p style="color: #666; margin-top: 20px; font-size: 0.9em;">
            Este enlace expirará en 24 horas. Si no confirmas tu cita, será cancelada automáticamente.
          </p>
        </div>
      `),
    };

    // Email para el dueño de la agenda
    const ownerMsg = {
      to: account.userEmails[0],
      from: emailSender,
      subject: `Nueva solicitud de cita - ${agenda.name}`,
      html: generateEmailTemplate(`
        <h2 style="color: #333; text-align: center;">Nueva solicitud de cita</h2>
        <div style="margin: 20px 0;">
          <p style="color: #666;">Has recibido una nueva solicitud de cita. El cliente deberá confirmarla en las próximas 24 horas.</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Detalles del cliente:</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin-bottom: 10px;">👤 Nombre: ${appointment.clientName}</li>
              <li style="margin-bottom: 10px;">📧 Email: ${appointment.clientEmail}</li>
              <li style="margin-bottom: 10px;">📱 Teléfono: ${appointment.clientPhone || "No proporcionado"}</li>
              <li style="margin-bottom: 10px;">📅 Fecha: ${formatDateTime(appointment.startTime)}</li>
              ${appointment.numberOfPeople > 1 ? `<li style="margin-bottom: 10px;">👥 Personas: ${appointment.numberOfPeople}</li>` : ""}
              ${appointment.notes ? `<li style="margin-bottom: 10px;">📝 Notas: ${appointment.notes}</li>` : ""}
            </ul>
          </div>
        </div>
      `),
    };

    await sgMail.send([clientMsg, ownerMsg]);
    console.log("Correos enviados exitosamente");
  } catch (error) {
    console.error("Error detallado al enviar correos:", {
      error: error.message,
      stack: error.stack,
      appointment: appointment._id,
    });
    throw error;
  }
};

const sendStatusChangeEmails = async (appointment, newStatus) => {
  try {
    const agenda = await Agenda.findById(appointment.agendaId);
    const account = await Account.findById(agenda.accountId);

    // Añadir más logs para depuración
    console.log("Account encontrada:", {
      id: account._id,
      emails: account.userEmails,
    });

    // Verificar que tengamos los emails necesarios
    if (!appointment.clientEmail || !account.userEmails?.length) {
      console.error("Faltan direcciones de email necesarias:", {
        clientEmail: appointment.clientEmail,
        businessEmails: account.userEmails,
      });
      return;
    }

    const businessEmails = account.userEmails.filter((email) => email && email.trim());
    console.log("Emails de negocio filtrados:", businessEmails);

    if (businessEmails.length === 0) {
      console.error("No se encontraron emails de negocio válidos");
      return;
    }

    const statusTexts = {
      created: "creada",
      confirmed: "confirmada",
      cancelled: "cancelada",
      rejected: "rechazada",
    };

    // Email para el cliente
    const clientMsg = {
      to: appointment.clientEmail,
      from: emailSender,
      subject: `Cita ${statusTexts[newStatus]} - ${agenda.name}`,
      html: generateEmailTemplate(`
        <h2 style="color: #333; text-align: center;">
          ${newStatus === "confirmed" ? "✅ ¡Tu cita ha sido confirmada!" : "..."}
        </h2>
        <div style="margin: 20px 0;">
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Detalles de la cita:</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin-bottom: 10px;">🏢 Servicio: ${agenda.name}</li>
              <li style="margin-bottom: 10px;">📅 Fecha: ${formatDateTime(appointment.startTime)}</li>
              ${appointment.numberOfPeople > 1 ? `<li style="margin-bottom: 10px;">👥 Personas: ${appointment.numberOfPeople}</li>` : ""}
            </ul>
          </div>

          ${
            newStatus === "confirmed"
              ? `
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="color: #666;">
                <strong>⚠️ Importante:</strong> Puedes cancelar tu cita hasta 24 horas antes de la hora programada usando el botón a continuación.
              </p>
              <div style="text-align: center; margin-top: 15px;">
                <a href="${process.env.FRONTEND_URL}/agenda/appointments/cancel-token/${appointment.cancellationToken}"
                   style="display: inline-block; padding: 12px 24px; background-color: #f44336; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                  Cancelar Cita
                </a>
              </div>
            </div>
          `
              : ""
          }
          
          ${newStatus === "confirmed" ? generateCalendarLinks(appointment, agenda) : ""}
        </div>
      `),
    };

    // Email para el dueño del negocio (enviado a cada email registrado)
    const ownerMsgs = businessEmails.map((email) => ({
      to: email,
      from: emailSender,
      subject: `Cita ${statusTexts[newStatus]} - ${agenda.name}`,
      html: generateEmailTemplate(`
        <h2 style="color: #333; text-align: center;">
          ${
            newStatus === "confirmed"
              ? "✅ Cita Confirmada"
              : newStatus === "cancelled"
              ? "❌ Cita Cancelada"
              : newStatus === "rejected"
              ? "❌ Cita Rechazada"
              : "🔔 Actualización de Cita"
          }
        </h2>
        <div style="margin: 20px 0;">
          <p style="color: #666;">
            ${
              newStatus === "confirmed"
                ? `El cliente ${appointment.clientName} ha confirmado su cita.`
                : newStatus === "cancelled"
                ? `El cliente ${appointment.clientName} ha cancelado su cita.`
                : `La cita con ${appointment.clientName} ha sido ${statusTexts[newStatus]}.`
            }
          </p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Detalles de la cita:</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin-bottom: 10px;">👤 Cliente: ${appointment.clientName}</li>
              <li style="margin-bottom: 10px;">📧 Email: ${appointment.clientEmail}</li>
              <li style="margin-bottom: 10px;">📱 Teléfono: ${appointment.clientPhone || "No proporcionado"}</li>
              <li style="margin-bottom: 10px;">📅 Fecha: ${formatDateTime(appointment.startTime)}</li>
              ${appointment.numberOfPeople > 1 ? `<li style="margin-bottom: 10px;">👥 Personas: ${appointment.numberOfPeople}</li>` : ""}
              ${appointment.notes ? `<li style="margin-bottom: 10px;">📝 Notas: ${appointment.notes}</li>` : ""}
            </ul>
          </div>
        </div>
      `),
    }));

    // Enviar todos los emails
    const emailsToSend = [clientMsg, ...ownerMsgs];
    console.log("Preparando envío de emails:", {
      totalEmails: emailsToSend.length,
      destinatarios: emailsToSend.map((email) => email.to),
    });

    // Dentro de sendStatusChangeEmails
    console.log("Iniciando envío de correos de cambio de estado:", {
      appointmentId: appointment._id,
      newStatus,
      ownerEmail: account.userEmails[0],
      clientEmail: appointment.clientEmail,
    });

    // Enviar emails uno por uno para mejor depuración
    for (const email of emailsToSend) {
      try {
        console.log("Preparando correo para:", {
          to: email.to,
          subject: email.subject,
          from: email.from,
        });
        await sgMail.send(email);
        console.log(`Email enviado exitosamente a: ${email.to}`);
      } catch (error) {
        console.error(`Error enviando email a ${email.to}:`, error);
      }
    }

    console.log(`Proceso de envío de emails completado para la cita ${appointment._id}`);
  } catch (error) {
    console.error("Error detallado al enviar emails:", {
      error: error.message,
      stack: error.stack,
      appointment: appointment._id,
    });
    throw error;
  }
};

const sendReminderEmails = async (appointment) => {
  try {
    console.log(`Preparando recordatorio para cita ID: ${appointment._id}`);

    const agenda = await Agenda.findById(appointment.agendaId);
    const account = await Account.findById(agenda.accountId);

    // Verificar si la cita está confirmada
    if (appointment.status !== "confirmed") {
      console.log(`Cita ${appointment._id} no está confirmada, no se enviará recordatorio`);
      return;
    }

    // Determinar si es una cita virtual y obtener el enlace adecuado
    const isVirtual = appointment.way === "virtual" || appointment.way === "ambas";

    // Usar el enlace de la cita si existe, de lo contrario usar el de la agenda
    const virtualLinkToUse = appointment.virtualLink || (agenda ? agenda.virtualLink : null);

    // Solo mostrar el enlace si es virtual Y hay un enlace disponible
    const showVirtualLink = isVirtual && virtualLinkToUse;

    console.log(`Cita ${appointment._id}: Virtual=${isVirtual}, Tiene enlace=${!!virtualLinkToUse}, Mostrar enlace=${showVirtualLink}`);

    // Email para el cliente
    const clientMsg = {
      to: appointment.clientEmail,
      from: emailSender,
      subject: `Recordatorio: Tu cita en ${agenda.name} es en 1 hora`,
      html: generateEmailTemplate(`
        <h2 style="color: #333; text-align: center;">Recordatorio de tu cita</h2>
        <div style="margin: 20px 0;">
          <p style="color: #666;">Hola ${appointment.clientName},</p>
          <p style="color: #666;">Te recordamos que tu cita es en aproximadamente 1 hora:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Detalles de la cita:</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin-bottom: 10px;">🏢 Servicio: ${agenda.name}</li>
              <li style="margin-bottom: 10px;">📅 Fecha y hora: ${formatDateTime(appointment.startTime)}</li>
              <li style="margin-bottom: 10px;">⏱️ Duración: ${agenda.duration} minutos</li>
              ${appointment.numberOfPeople > 1 ? `<li style="margin-bottom: 10px;">👥 Personas: ${appointment.numberOfPeople}</li>` : ""}
              <li style="margin-bottom: 10px;">📍 Modalidad: ${isVirtual ? "Virtual" : "Presencial"}</li>
            </ul>
          </div>
          
          ${
            showVirtualLink
              ? `
            <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="color: #0078d4; margin-bottom: 15px;">🎥 Tu enlace para la videollamada:</h3>
              <p style="margin-bottom: 15px;">Haz clic en el botón de abajo para unirte a la reunión:</p>
              <a href="${virtualLinkToUse}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Unirse a la reunión
              </a>
              <p style="margin-top: 15px; font-size: 0.9em; color: #666;">
                O copia y pega este enlace en tu navegador:<br>
                <span style="word-break: break-all;">${virtualLinkToUse}</span>
              </p>
            </div>
            `
              : ""
          }
          
          <p style="color: #666; margin-top: 20px;">
            ¡Te esperamos!
          </p>
        </div>
      `),
    };

    // Email para el dueño de la agenda
    const ownerMsg = {
      to: account.userEmails[0],
      from: emailSender,
      subject: `Recordatorio: Cita en 1 hora con ${appointment.clientName}`,
      html: generateEmailTemplate(`
        <h2 style="color: #333; text-align: center;">Recordatorio de cita</h2>
        <div style="margin: 20px 0;">
          <p style="color: #666;">Tienes una cita programada en aproximadamente 1 hora:</p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-bottom: 15px;">Detalles de la cita:</h3>
            <ul style="list-style: none; padding: 0; margin: 0;">
              <li style="margin-bottom: 10px;">👤 Cliente: ${appointment.clientName}</li>
              <li style="margin-bottom: 10px;">📧 Email: ${appointment.clientEmail}</li>
              <li style="margin-bottom: 10px;">📱 Teléfono: ${appointment.clientPhone || "No proporcionado"}</li>
              <li style="margin-bottom: 10px;">📅 Fecha y hora: ${formatDateTime(appointment.startTime)}</li>
              ${appointment.numberOfPeople > 1 ? `<li style="margin-bottom: 10px;">👥 Personas: ${appointment.numberOfPeople}</li>` : ""}
              <li style="margin-bottom: 10px;">📍 Modalidad: ${isVirtual ? "Virtual" : "Presencial"}</li>
              ${appointment.notes ? `<li style="margin-bottom: 10px;">📝 Notas: ${appointment.notes}</li>` : ""}
            </ul>
          </div>
          
          ${
            showVirtualLink
              ? `
            <div style="background-color: #e8f4fd; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
              <h3 style="color: #0078d4; margin-bottom: 15px;">🎥 Enlace para la videollamada:</h3>
              <p style="margin-bottom: 15px;">Haz clic en el botón de abajo para unirte a la reunión:</p>
              <a href="${virtualLinkToUse}" target="_blank" style="display: inline-block; padding: 12px 24px; background-color: #0078d4; color: white; text-decoration: none; border-radius: 5px; font-weight: bold;">
                Unirse a la reunión
              </a>
              <p style="margin-top: 15px; font-size: 0.9em; color: #666;">
                O copia y pega este enlace en tu navegador:<br>
                <span style="word-break: break-all;">${virtualLinkToUse}</span>
              </p>
            </div>
            `
              : ""
          }
        </div>
      `),
    };

    console.log(`Enviando recordatorio a: ${appointment.clientEmail} y ${account.userEmails[0]}`);
    await sgMail.send([clientMsg, ownerMsg]);
    console.log(`Recordatorio enviado exitosamente para cita ID: ${appointment._id}`);
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
