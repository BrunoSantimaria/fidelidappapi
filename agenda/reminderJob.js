const cron = require("node-cron");
const Appointment = require("./appointment.model");
const Agenda = require("./agenda.model");
const { sendReminderEmails } = require("./agendaMailing");
const { addHours, subHours } = require("date-fns");

// Función para enviar recordatorios de citas
const sendAppointmentReminders = async () => {
  try {
    console.log("Ejecutando job de recordatorios: " + new Date().toISOString());

    const now = new Date();
    const oneHourFromNow = addHours(now, 1);

    // Buscar citas confirmadas que empiecen en aproximadamente 1 hora
    const appointments = await Appointment.find({
      status: "confirmed",
      startTime: {
        $gte: subHours(oneHourFromNow, 0.1), // 54 minutos desde ahora
        $lte: addHours(oneHourFromNow, 0.1), // 66 minutos desde ahora
      },
      reminderSent: { $ne: true },
    }).populate("agendaId");

    console.log(`Encontradas ${appointments.length} citas para enviar recordatorios`);

    for (const appointment of appointments) {
      // Verificar si es una cita virtual
      const isVirtual = appointment.way === "virtual" || appointment.way === "ambas";
      console.log(`Enviando recordatorio para cita ID: ${appointment._id}, tipo: ${appointment.way}, virtual: ${isVirtual}`);

      await sendReminderEmails(appointment);
      // Marcar que el recordatorio fue enviado
      await Appointment.findByIdAndUpdate(appointment._id, { reminderSent: true });
      console.log(`Recordatorio enviado y marcado como enviado para cita ID: ${appointment._id}`);
    }
  } catch (error) {
    console.error("Error en el job de recordatorios:", error);
  }
};

// Función para enviar un recordatorio de prueba a una cita específica
const sendTestReminder = async (appointmentId) => {
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

    // Verificar si es una cita virtual
    const isVirtual = appointment.way === "virtual" || appointment.way === "ambas";
    const agenda = appointment.agendaId;
    const virtualLinkToUse = appointment.virtualLink || (agenda ? agenda.virtualLink : null);

    console.log(`Enviando recordatorio de prueba para cita ID: ${appointmentId}`);
    console.log(`Detalles: Virtual=${isVirtual}, Tiene enlace=${!!virtualLinkToUse}`);

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
        startTime: appointment.startTime,
        way: appointment.way,
        isVirtual: isVirtual,
        hasVirtualLink: !!virtualLinkToUse,
      },
    };
  } catch (error) {
    console.error(`Error en sendTestReminder: ${error.message}`);
    throw error;
  }
};

// Ejecutar cada 5 minutos
const reminderSchedule = cron.schedule("*/5 * * * *", sendAppointmentReminders, {
  scheduled: true,
});

module.exports = {
  sendAppointmentReminders,
  sendTestReminder,
  reminderSchedule,
};
