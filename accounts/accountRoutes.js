const express = require("express");
const router = express.Router();

// Importar controladores
const { addUserToAccount, refreshQr, saveAccountSettings } = require("./accountController.js");

// Middleware de autenticación
const { verifyToken } = require("../middleware/verifyToken.js");

// Rutas de autenticación
router.post("/add/:accountId", verifyToken, addUserToAccount);
router.post("/refresh", verifyToken, refreshQr);
router.post("/settings", saveAccountSettings);
module.exports = router;
