const express = require("express");
const router = express.Router();
const Notification = require("../models/Notification");
const { verifyToken } = require("../middleware/verifyToken");

// Obtener notificaciones
router.get("/:accountId", verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({
      accountId: req.params.accountId,
    })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: "Error al obtener notificaciones" });
  }
});

// Obtener notificaciones no leídas
router.get("/:accountId/unread", verifyToken, async (req, res) => {
  try {
    const notifications = await Notification.find({
      accountId: req.params.accountId,
      read: false,
    })
      .sort({ timestamp: -1 })
      .limit(50);

    res.json(notifications);
  } catch (error) {
    console.error("Error obteniendo notificaciones no leídas:", error);
    res.status(500).json({ error: "Error al obtener notificaciones" });
  }
});

// Marcar notificación como leída
router.patch("/:notificationId/read", verifyToken, async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.notificationId, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Error al actualizar notificación" });
  }
});

// Marcar múltiples notificaciones como leídas
router.patch("/:accountId/mark-read", verifyToken, async (req, res) => {
  try {
    const { notificationIds } = req.body;

    await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        accountId: req.params.accountId,
      },
      { read: true }
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error marcando notificaciones como leídas:", error);
    res.status(500).json({ error: "Error al actualizar notificaciones" });
  }
});

// Eliminar notificaciones
router.delete("/:accountId", verifyToken, async (req, res) => {
  try {
    await Notification.deleteMany({ accountId: req.params.accountId });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Error al eliminar notificaciones" });
  }
});

module.exports = router;
