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
} = require("./agendaController");
const Agenda = require("./agenda.model");

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

module.exports = router;
