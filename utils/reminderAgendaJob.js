const cron = require("node-cron");
const Appointment = require("../agenda/appointment.model");
const { sendReminderEmails } = require("../agenda/agendaMailing");
const { addHours, subHours } = require("date-fns");

// Crear el cron job y exportarlo
const reminderJob = cron.schedule(
  "*/5 * * * *",
  async () => {
    try {
      const now = new Date();
      const oneHourFromNow = addHours(now, 1);

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
        await Appointment.findByIdAndUpdate(appointment._id, { reminderSent: true });
      }
    } catch (error) {
      console.error("Error en el job de recordatorios:", error);
    }
  },
  {
    scheduled: false, // Inicialmente no programado
  }
);

module.exports = reminderJob;
