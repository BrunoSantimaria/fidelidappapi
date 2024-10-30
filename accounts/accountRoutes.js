const express = require("express");
const router = express.Router();

// Importar controladores
const { addUserToAccount, refreshQr, saveAccountSettings, fileUpload, customizeAccount, updateAccount } = require("./accountController.js");

// Middleware de autenticación
const { verifyToken } = require("../middleware/verifyToken.js");

// Rutas de autenticación
router.post("/add/:accountId", verifyToken, addUserToAccount);
router.post("/refresh", verifyToken, refreshQr);
router.post("/settings", saveAccountSettings);
router.post("/settings/customize", fileUpload, customizeAccount);
router.put("/settings/account", updateAccount);

module.exports = router;
