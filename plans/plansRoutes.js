const express = require('express');
const router = express.Router();

// Importar controladores
const { createPlan } = require('./plansController.js');

// Middleware de autenticación
const { verifyToken } = require('../middleware/verifyToken.js');

// Rutas de autenticación
router.post('/',verifyToken, createPlan);

module.exports = router;
