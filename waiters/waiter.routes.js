const express = require("express");
const router = express.Router();
const { waiterController } = require("./waiter.controller");

// Crear un nuevo mesero
router.post("/accounts/:accountId/waiters", waiterController.createWaiter);

// Obtener todos los meseros de una cuenta
router.get("/accounts/:accountId/waiters", waiterController.getWaiters);

// Obtener un mesero específico
router.get("/accounts/:accountId/waiters/:waiterId", waiterController.getWaiter);

// Actualizar información de un mesero
router.put("/accounts/:accountId/waiters/:waiterId", waiterController.updateWaiter);

// Eliminar un mesero
router.delete("/accounts/:accountId/waiters/:waiterId", waiterController.deleteWaiter);

// Añadir una valoración a un mesero
router.post("/accounts/:accountId/waiters/:waiterId/ratings", waiterController.addRating);

// Sumar puntos a un mesero
router.post("/accounts/:accountId/waiters/:waiterId/points", waiterController.addPoints);

module.exports = router;
