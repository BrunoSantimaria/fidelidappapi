const express = require('express');
const router = express.Router();

// Importar controladores
const { createAgenda, getAvailableSlots, createAppointment, cancelAppointment, getAgendas, deleteAgenda,getExistingAppointments, confirmAppointment, completeAppointment, noShowAppointment   } = require('./agendaController.js');

// Middleware de autenticación
const { verifyToken } = require('../middleware/verifyToken.js');

// Rutas de autenticación
router.post('/createAgenda', verifyToken, createAgenda);
router.get('/', verifyToken, getAgendas);
router.get('/getAvailableSlots/:agendaId', getAvailableSlots);
router.delete('/:agendaId', verifyToken, deleteAgenda);

router.post('/createAppointment', createAppointment);
router.get('/getExistingAppointments/:agendaId', verifyToken, getExistingAppointments)
router.post('/confirmAppointment/:appointmentId', confirmAppointment);
router.post('/cancelAppointment/:appointmentId', cancelAppointment);
router.post('/completeAppointment/:appointmentId', verifyToken, completeAppointment);
router.post('/noShowAppointment/:appointmentId', verifyToken, noShowAppointment);

module.exports = router;
