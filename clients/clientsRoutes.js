const express = require("express");
const router = express.Router();
const { addClient, deleteClient, updateClient, getAccountClients, getFilteredAccountClients, addClientsBatch, addTagToClients, getDistinctTags } = require("./clientsController");
const { verifyToken } = require("../middleware/verifyToken");

// Ruta para obtener los clientes de una cuenta
router.get("/getAccountClients", verifyToken, getAccountClients);

// Ruta para agregar un cliente a una cuenta
router.post("/addClient", verifyToken, addClient);
router.post("/addClientsBatch", verifyToken, addClientsBatch);
router.post("/getFilteredAccountClients", verifyToken, getFilteredAccountClients);
// Ruta para eliminar un cliente de una cuenta
router.delete("/deleteClient", verifyToken, deleteClient);

// Ruta para actualizar un cliente en una cuenta
router.put("/updateClient", verifyToken, updateClient);

// Ruta para agregar un tag a una lista de clientes
router.post("/addTagToClients", verifyToken, addTagToClients);

// Ruta para obtener los tags distintos de una cuenta
router.get("/getDistinctTags", verifyToken, getDistinctTags);


module.exports = router;
