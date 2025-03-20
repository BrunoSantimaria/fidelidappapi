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

      const nowUTC = new Date();
      const nowChile = toZonedTime(nowUTC, CHILE_TIMEZONE);
      const nowChileFormatted = formatInTimeZone(nowUTC, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm:ss");

      console.log(`Hora UTC: ${nowUTC.toISOString()}`);
      console.log(`Hora Chile: ${nowChileFormatted} (${CHILE_TIMEZONE})`);

      // Calcular rangos para citas presenciales (1 hora antes)
      const oneHourFromNowChile = addHours(nowChile, 1);
      const startTimePresencialChile = subHours(oneHourFromNowChile, 0.1);
      const endTimePresencialChile = addHours(oneHourFromNowChile, 0.1);
      const startTimePresencialUTC = fromZonedTime(startTimePresencialChile, CHILE_TIMEZONE);
      const endTimePresencialUTC = fromZonedTime(endTimePresencialChile, CHILE_TIMEZONE);

      // Calcular rangos para citas virtuales (5 minutos antes)
      const fiveMinFromNowChile = addHours(nowChile, 5 / 60); // 5 minutos
      const startTimeVirtualChile = subHours(fiveMinFromNowChile, 0.05);
      const endTimeVirtualChile = addHours(fiveMinFromNowChile, 0.05);
      const startTimeVirtualUTC = fromZonedTime(startTimeVirtualChile, CHILE_TIMEZONE);
      const endTimeVirtualUTC = fromZonedTime(endTimeVirtualChile, CHILE_TIMEZONE);

      console.log("Buscando citas...");
      console.log(
        `1. Citas presenciales (1 hora antes) entre ${formatInTimeZone(startTimePresencialChile, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm")} y ${formatInTimeZone(
          endTimePresencialChile,
          CHILE_TIMEZONE,
          "dd/MM/yyyy HH:mm"
        )} (Chile)`
      );
      console.log(
        `2. Citas virtuales (5 minutos antes) entre ${formatInTimeZone(startTimeVirtualChile, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm")} y ${formatInTimeZone(
          endTimeVirtualChile,
          CHILE_TIMEZONE,
          "dd/MM/yyyy HH:mm"
        )} (Chile)`
      );

      // Buscar citas que necesitan recordatorio
      const appointments = await Appointment.find({
        status: "confirmed",
        reminderSent: { $ne: true },
        $or: [
          // Citas presenciales (1 hora antes)
          {
            way: "presencial",
            startTime: {
              $gte: startTimePresencialUTC,
              $lte: endTimePresencialUTC,
            },
          },
          // Citas virtuales (5 minutos antes)
          {
            way: { $in: ["virtual", "ambas"] },
            startTime: {
              $gte: startTimeVirtualUTC,
              $lte: endTimeVirtualUTC,
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
