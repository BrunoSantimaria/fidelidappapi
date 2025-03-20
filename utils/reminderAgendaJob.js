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

      // Convertir a hora de Chile
      const nowChile = toZonedTime(nowUTC, CHILE_TIMEZONE);

      // Formatear para mostrar claramente la diferencia
      const nowChileFormatted = formatInTimeZone(nowUTC, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm:ss");

      console.log(`Hora UTC: ${nowUTC.toISOString()}`);
      console.log(`Hora Chile: ${nowChileFormatted} (${CHILE_TIMEZONE})`);

      // Calcular una hora desde ahora en horario chileno
      const oneHourFromNowChile = addHours(nowChile, 1);

      // Rango de tiempo para buscar citas (54-66 minutos desde ahora en horario chileno)
      const startTimeChile = subHours(oneHourFromNowChile, 0.1); // ~54 minutos
      const endTimeChile = addHours(oneHourFromNowChile, 0.1); // ~66 minutos

      // Convertir de vuelta a UTC para la consulta a MongoDB
      const startTimeUTC = fromZonedTime(startTimeChile, CHILE_TIMEZONE);
      const endTimeUTC = fromZonedTime(endTimeChile, CHILE_TIMEZONE);

      // Formatear para mostrar claramente
      const startTimeChileFormatted = formatInTimeZone(startTimeChile, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm");
      const endTimeChileFormatted = formatInTimeZone(endTimeChile, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm");

      console.log(`Buscando citas entre ${startTimeUTC.toISOString()} y ${endTimeUTC.toISOString()} (UTC)`);
      console.log(`Equivalente a ${startTimeChileFormatted} y ${endTimeChileFormatted} (Chile)`);

      // Buscar citas confirmadas que empiecen en aproximadamente 1 hora
      const appointments = await Appointment.find({
        status: "confirmed",
        startTime: {
          $gte: startTimeUTC,
          $lte: endTimeUTC,
        },
        reminderSent: { $ne: true },
      }).populate("agendaId");

      console.log(`Encontradas ${appointments.length} citas para enviar recordatorios`);

      // Imprimir detalles de las citas encontradas para depuración
      if (appointments.length > 0) {
        appointments.forEach((app) => {
          const appTimeChileFormatted = formatInTimeZone(app.startTime, CHILE_TIMEZONE, "dd/MM/yyyy HH:mm");
          console.log(`Cita ID: ${app._id}, startTime UTC: ${app.startTime.toISOString()}, startTime Chile: ${appTimeChileFormatted}, way: ${app.way}`);
        });
      }

      for (const appointment of appointments) {
        // Verificar si es una cita virtual y tiene enlace
        const isVirtual = appointment.way === "virtual" || appointment.way === "ambas";
        const agenda = appointment.agendaId;
        const virtualLinkToUse = appointment.virtualLink || (agenda ? agenda.virtualLink : null);

        console.log(
          `Enviando recordatorio para cita ID: ${appointment._id}, tipo: ${appointment.way}, virtual: ${isVirtual}, tiene enlace: ${!!virtualLinkToUse}`
        );

        await sendReminderEmails(appointment);
        await Appointment.findByIdAndUpdate(appointment._id, { reminderSent: true });
        console.log(`Recordatorio enviado y marcado como enviado para cita ID: ${appointment._id}`);
      }
    } catch (error) {
      console.error("Error en el job de recordatorios:", error);
    }
  },
  {
    scheduled: false, // Inicialmente no programado
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
