// Mongoose Model: smsCampaign.model.js
const mongoose = require("mongoose");

const smsCampaignSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    message: {
      type: String,
      required: true,
    },
    twilioMessageIds: [
      {
        type: String,
        index: true,
      }
    ],
    status: {
      type: String,
      enum: ["in_progress", "completed", "failed"],
      default: "in_progress",
    },
    metrics: {
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      undelivered: { type: Number, default: 0 },
      queued: { type: Number, default: 0 },
      sent: { type: Number, default: 0 }
    },
    startDate: {
      type: Date,
      default: Date.now,
    }
  },
  {
    timestamps: true
  }
);

const SmsCampaign = mongoose.model("SmsCampaign", smsCampaignSchema);
module.exports = SmsCampaign;