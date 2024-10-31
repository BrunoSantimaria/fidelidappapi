const express = require("express");
const {
  cancelSubscriptions, // Función para cancelar la suscripción
  createPreference,
  checkSubscription,
} = require("./mercadopagoController");

const router = express.Router();

router.post("/create_preference", createPreference); // Ruta para crear una suscripción
router.get("/check_and_update_subscription/:accountId", checkSubscription);
router.post;
// Ruta para cancelar la suscripción
router.post("/cancel_subscription", cancelSubscriptions); // Ruta para cancelar la suscripción

module.exports = router;
