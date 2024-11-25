const express = require("express");
const router = express.Router();
const { verifyToken } = require("../middleware/verifyToken");
const Notification = require("../models/Notification");

// Almacenar las conexiones activas
const clients = new Map();

// Endpoint para establecer la conexión SSE
router.get("/:accountId", verifyToken, (req, res) => {
  const { accountId } = req.params;

  // Configurar headers para SSE con CORS específico
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
  res.setHeader("Access-Control-Allow-Credentials", "true");

  // Función para enviar eventos al cliente
  const sendEvent = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  // Almacenar la conexión
  if (!clients.has(accountId)) {
    clients.set(accountId, new Set());
  }
  clients.get(accountId).add(res);

  // Enviar evento de conexión exitosa
  sendEvent({ type: "connected", message: "Conexión establecida" });

  // Manejar desconexión
  req.on("close", () => {
    clients.get(accountId)?.delete(res);
    if (clients.get(accountId)?.size === 0) {
      clients.delete(accountId);
    }
  });
});

// Exportar la función sendNotification separadamente
exports.sendNotification = async (accountId, eventType, data) => {
  // Guardar la notificación en la base de datos
  try {
    const notification = new Notification({
      accountId,
      message: data.message,
      type: data.type || "info",
      data: data,
      read: false,
    });
    await notification.save();

    // Enviar a clientes conectados
    const accountClients = clients.get(accountId);
    if (accountClients) {
      accountClients.forEach((client) => {
        client.write(`event: ${eventType}\n`);
        client.write(`data: ${JSON.stringify(notification)}\n\n`);
      });
    }
  } catch (error) {
    console.error("Error al enviar notificación:", error);
  }
};

// Exportar el router como default
module.exports = router;
