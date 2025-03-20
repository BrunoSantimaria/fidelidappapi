const cron = require("node-cron");
const Appointment = require("../agenda/appointment.model");
const { sendReminderEmails } = require("../agenda/agendaMailing");
const { addHours, subHours } = require("date-fns");
const { toZonedTime, fromZonedTime, formatInTimeZone } = require("date-fns-tz");

// Zona horaria de Chile
const CHILE_TIMEZONE = "America/Santiago";

// Crear el cron job y exportarlo
const reminderJob = cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      console.log("Ejecutando job de recordatorios: " + new Date().toISOString());

      // Obtener la hora actual en UTC
      const nowUTC = new Date();
      const nowChile = toZonedTime(nowUTC, CHILE_TIMEZONE);
      const nowChileFormatted = formatInTimeZone(nowUTC, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm:ss");

      console.log(`Hora UTC: ${nowUTC.toISOString()}`);
      console.log(`Hora Chile: ${nowChileFormatted} (${CHILE_TIMEZONE})`);

      // Calcular rangos de tiempo para recordatorios normales (1 hora antes)
      const oneHourFromNowChile = addHours(nowChile, 1);
      const startTimeChile = subHours(oneHourFromNowChile, 0.1);
      const endTimeChile = addHours(oneHourFromNowChile, 0.1);
      const startTimeUTC = fromZonedTime(startTimeChile, CHILE_TIMEZONE);
      const endTimeUTC = fromZonedTime(endTimeChile, CHILE_TIMEZONE);

      // Formatear para logs
      const startTimeChileFormatted = formatInTimeZone(startTimeChile, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm");
      const endTimeChileFormatted = formatInTimeZone(endTimeChile, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm");

      console.log("Buscando citas...");
      console.log(`1. Citas regulares (1 hora antes) entre ${startTimeChileFormatted} y ${endTimeChileFormatted} (Chile)`);
      console.log(`2. Citas inmediatas creadas en los últimos 5 minutos`);

      // Buscar citas que necesitan recordatorio
      const appointments = await Appointment.find({
        status: "confirmed",
        reminderSent: { $ne: true },
        $or: [
          // Caso 1: Citas que empiezan en ~1 hora
          {
            startTime: {
              $gte: startTimeUTC,
              $lte: endTimeUTC,
            },
          },
          // Caso 2: Citas recién confirmadas que empiezan pronto
          {
            startTime: {
              $gt: nowUTC,
              $lt: startTimeUTC, // Citas que empiezan antes de 1 hora
            },
            createdAt: {
              $gte: new Date(Date.now() - 5 * 60 * 1000), // Creadas en los últimos 5 minutos
            },
          },
        ],
      }).populate("agendaId");

      console.log(`Encontradas ${appointments.length} citas para enviar recordatorios`);

      // Imprimir detalles de las citas encontradas
      if (appointments.length > 0) {
        appointments.forEach((app) => {
          const appTimeChile = formatInTimeZone(app.startTime, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm");
          const minutesUntilAppointment = Math.round((app.startTime - nowUTC) / (1000 * 60));
          console.log(
            `Cita ID: ${app._id}, ` +
              `Cliente: ${app.clientName}, ` +
              `Hora: ${appTimeChile}, ` +
              `Faltan: ${minutesUntilAppointment} minutos, ` +
              `Tipo: ${app.way}`
          );
        });
      }

      // Procesar cada cita encontrada
      for (const appointment of appointments) {
        const isVirtual = appointment.way === "virtual" || appointment.way === "ambas";
        const agenda = appointment.agendaId;
        const virtualLinkToUse = appointment.virtualLink || (agenda ? agenda.virtualLink : null);
        const minutesUntilAppointment = Math.round((appointment.startTime - nowUTC) / (1000 * 60));

        console.log(
          `Enviando recordatorio para cita ID: ${appointment._id}, ` +
            `tipo: ${appointment.way}, ` +
            `virtual: ${isVirtual}, ` +
            `tiene enlace: ${!!virtualLinkToUse}, ` +
            `faltan: ${minutesUntilAppointment} minutos`
        );

        await sendReminderEmails(appointment);
        await Appointment.findByIdAndUpdate(appointment._id, { reminderSent: true });
        console.log(`✅ Recordatorio enviado y marcado como enviado para cita ID: ${appointment._id}`);
      }
    } catch (error) {
      console.error("Error en el job de recordatorios:", error);
    }
  },
  {
    scheduled: false,
  }
);

// Función para enviar un recordatorio de prueba a una cita específica
reminderJob.sendTestReminder = async (appointmentId) => {
  try {
    console.log(`Iniciando prueba de recordatorio para cita ID: ${appointmentId}`);

    const appointment = await Appointment.findById(appointmentId).populate("agendaId");

    if (!appointment) {
      throw new Error(`Cita no encontrada con ID: ${appointmentId}`);
    }

    // Si la cita no está confirmada, confirmarla temporalmente para la prueba
    let wasConfirmed = appointment.status === "confirmed";
    if (!wasConfirmed) {
      console.log(`Actualizando estado de cita ${appointmentId} a confirmed para prueba`);
      appointment.status = "confirmed";
      await appointment.save();
    }

    // Verificar si es una cita virtual y tiene enlace
    const isVirtual = appointment.way === "virtual" || appointment.way === "ambas";
    const agenda = appointment.agendaId;
    const virtualLinkToUse = appointment.virtualLink || (agenda ? agenda.virtualLink : null);

    // Convertir la hora de la cita a horario chileno para mostrarla en los logs
    const appTimeChileFormatted = formatInTimeZone(appointment.startTime, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm");

    console.log(`Enviando recordatorio de prueba para cita ID: ${appointmentId}`);
    console.log(`Detalles: startTime UTC: ${appointment.startTime.toISOString()}, startTime Chile: ${appTimeChileFormatted}`);
    console.log(`Virtual: ${isVirtual}, Tiene enlace: ${!!virtualLinkToUse}, Enlace: ${virtualLinkToUse || "N/A"}`);

    await sendReminderEmails(appointment);

    // Si cambiamos el estado, restaurarlo
    if (!wasConfirmed) {
      appointment.status = "pending";
      await appointment.save();
      console.log(`Restaurado estado original de la cita ${appointmentId}`);
    }

    return {
      success: true,
      message: `Recordatorio enviado exitosamente para cita ID: ${appointmentId}`,
      appointmentDetails: {
        id: appointment._id,
        clientName: appointment.clientName,
        clientEmail: appointment.clientEmail,
        startTimeUTC: appointment.startTime.toISOString(),
        startTimeChile: appTimeChileFormatted,
        way: appointment.way,
        isVirtual: isVirtual,
        hasVirtualLink: !!virtualLinkToUse,
        virtualLink: virtualLinkToUse,
      },
    };
  } catch (error) {
    console.error(`Error en sendTestReminder: ${error.message}`);
    throw error;
  }
};

module.exports = reminderJob;
