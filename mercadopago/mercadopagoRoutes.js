const express = require("express");
const {
  cancelSubscription, // Función para cancelar la suscripción
  createPreference,
  checkSubscription,
} = require("./mercadopagoController");

const router = express.Router();

router.post("/create_preference", createPreference); // Ruta para crear una suscripción
router.get("/check_and_update_subscription/:accountId", checkSubscription);
router.post;
// Ruta para cancelar la suscripción
router.post("/cancel_subscription", cancelSubscription); // Ruta para cancelar la suscripción

module.exports = router;
