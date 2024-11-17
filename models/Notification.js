const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
    index: true,
  },
  message: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    enum: ["info", "success", "warning", "error"],
    default: "info",
  },
  read: {
    type: Boolean,
    default: false,
    index: true,
  },
  data: {
    type: Object,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

// Índice compuesto para consultas frecuentes
notificationSchema.index({ accountId: 1, read: 1, timestamp: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
