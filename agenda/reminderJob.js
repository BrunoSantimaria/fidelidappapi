const cron = require("node-cron");
const Appointment = require("./appointment.model");
const { sendReminderEmails } = require("./agendaMailing");
const { addHours, subHours } = require("date-fns");

// Función para enviar recordatorios de citas
const sendAppointmentReminders = async () => {
  try {
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
    });

    for (const appointment of appointments) {
      await sendReminderEmails(appointment);
      // Marcar que el recordatorio fue enviado
      await Appointment.findByIdAndUpdate(appointment._id, { reminderSent: true });
    }
  } catch (error) {
    console.error("Error en el job de recordatorios:", error);
  }
};

// Ejecutar cada 5 minutos
cron.schedule("*/5 * * * *", sendAppointmentReminders);

module.exports = { sendAppointmentReminders };
