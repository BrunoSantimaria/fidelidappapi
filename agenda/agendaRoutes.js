const express = require("express");
const router = express.Router();
const {
  createAgenda,
  getAvailableSlots,
  getAccountAgendas,
  getAgendaAppointments,
  createAppointment,
  getClientAppointments,
  getAccountAppointments,
  confirmAppointment,
  cancelAppointment,
  rejectAppointment,
  disableAgenda,
  confirmAppointmentByToken,
  cancelAppointmentByToken,
  getPendingAppointmentsCount,
} = require("./agendaController");
const Agenda = require("./agenda.model");
const Appointment = require("./appointment.model");

// Agregar esta ruta para obtener una agenda específica
router.get("/:agendaId", async (req, res) => {
  try {
    const { agendaId } = req.params;
    const agenda = await Agenda.findById(agendaId);

    if (!agenda) {
      return res.status(404).json({ message: "Agenda no encontrada" });
    }

    res.json(agenda);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Ruta para crear una nueva agenda (requiere autenticación)
router.post("/", createAgenda);
router.get("/account/:accountId", getAccountAgendas);
// Ruta para obtener slots disponibles de una agenda específica
router.post("/appointments", createAppointment);
router.get(
  "/:agendaId/available-slots",

  getAvailableSlots
);
router.get("/:agendaId/appointments", getAgendaAppointments);

// Modificar la ruta para manejar tanto uniqueLink como ID
router.get("/by-link/:uniqueLink", async (req, res) => {
  try {
    const { uniqueLink } = req.params;
    let agenda;

    // Verificar si el parámetro es un ID de MongoDB válido (24 caracteres hexadecimales)
    if (/^[0-9a-fA-F]{24}$/.test(uniqueLink)) {
      agenda = await Agenda.findById(uniqueLink);
    } else {
      agenda = await Agenda.findOne({ uniqueLink });
    }

    if (!agenda) {
      return res.status(404).json({ message: "Agenda no encontrada" });
    }

    res.json(agenda);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get("/:agendaId/client-appointments", getClientAppointments);
router.get("/account/:accountId/appointments", getAccountAppointments);

// Rutas para gestión de citas
router.post("/appointments/:appointmentId/confirm", confirmAppointment);
router.post("/appointments/:appointmentId/cancel", cancelAppointment);
router.post("/appointments/:appointmentId/reject", rejectAppointment);

// Ruta para deshabilitar agenda
router.post("/:agendaId/disable", disableAgenda);

// Ruta para obtener detalles de la cita por token de confirmación
router.get("/appointments/token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const appointment = await Appointment.findOne({
      confirmationToken: token,
      confirmationTokenExpires: { $gt: new Date() },
    }).populate("agendaId");

    if (!appointment) {
      return res.status(404).json({
        message: "Token inválido o expirado",
      });
    }

    res.json(appointment);
  } catch (error) {
    console.error("Error al obtener la cita:", error);
    res.status(500).json({ message: error.message });
  }
});

// Nueva ruta para obtener detalles de la cita por token de cancelación
router.get("/appointments/cancel-token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const appointment = await Appointment.findOne({
      cancellationToken: token,
      status: "confirmed",
    }).populate("agendaId");

    if (!appointment) {
      return res.status(404).json({
        message: "Token inválido o cita no encontrada",
      });
    }

    // Verificar si la cita puede ser cancelada (24 horas antes)
    if (!appointment.isCancellable()) {
      return res.status(400).json({
        message: "No es posible cancelar la cita con menos de 24 horas de anticipación",
      });
    }

    res.json(appointment);
  } catch (error) {
    console.error("Error al obtener la cita:", error);
    res.status(500).json({ message: error.message });
  }
});

router.post("/appointments/token/:token", confirmAppointmentByToken);

// Agregar nueva ruta para cancelación por token
router.post("/appointments/cancel-token/:token", cancelAppointmentByToken);

// Nueva ruta para obtener el conteo de citas pendientes de un cliente
router.get("/appointments/pending", getPendingAppointmentsCount);

// Ruta para probar el envío de recordatorios con enlaces virtuales
router.post("/test-reminder/:appointmentId", async (req, res) => {
  try {
    const { appointmentId } = req.params;
    const { sendTestReminder } = require("./reminderJob");

    const result = await sendTestReminder(appointmentId);
    res.json(result);
  } catch (error) {
    console.error("Error al enviar recordatorio de prueba:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

module.exports = router;
