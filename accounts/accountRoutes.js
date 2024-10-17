const express = require('express');
const router = express.Router();

// Importar controladores
const { addUserToAccount } = require('./accountController.js');

// Middleware de autenticación
const { verifyToken } = require('../middleware/verifyToken.js');

// Rutas de autenticación
router.post('/add/:accountId',verifyToken, addUserToAccount);

module.exports = router;
