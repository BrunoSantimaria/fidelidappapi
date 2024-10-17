const express = require("express");
const router = express.Router();
const { addClient, deleteClient, updateClient, getAccountClients } = require("./clientsController");
const { verifyToken } = require("../middleware/verifyToken");

// Ruta para obtener los clientes de una cuenta
router.get("/getAccountClients", verifyToken, getAccountClients);

// Ruta para agregar un cliente a una cuenta
router.post("/addClient", verifyToken, addClient);

// Ruta para eliminar un cliente de una cuenta
router.delete("/deleteClient", verifyToken, deleteClient);

// Ruta para actualizar un cliente en una cuenta
router.put("/updateClient", verifyToken, updateClient);

module.exports = router;
