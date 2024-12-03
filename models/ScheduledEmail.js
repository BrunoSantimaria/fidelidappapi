const mongoose = require("mongoose");

const scheduledEmailSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
  },
  template: {
    type: String,
    required: true,
  },
  recipients: [
    {
      email: {
        type: String,
        required: true,
      },
      name: {
        type: String,
        required: true,
      },
    },
  ],
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  scheduledFor: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["pending", "processing", "sent", "failed"], // Agregado "processing"
    default: "pending",
  },
  sentAt: {
    type: Date,
  },
  error: {
    type: String,
  },
  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Campaign",
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
  },
});

module.exports = mongoose.model("ScheduledEmail", scheduledEmailSchema);
