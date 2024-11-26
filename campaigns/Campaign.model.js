const mongoose = require("mongoose");

const campaignSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    sendgridMessageId: {
      type: String,
      index: true,
      sparse: true,
    },
    sendgridMessageIds: [
      {
        type: String,
        index: true,
      },
    ],
    name: {
      type: String,
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    template: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      enum: ["in_progress", "completed", "failed"],
      default: "in_progress",
    },
    metrics: {
      totalSent: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      opens: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
      bounces: { type: Number, default: 0 },
      unsubscribes: { type: Number, default: 0 },
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    strict: false,
  }
);

// Middleware para logging
campaignSchema.pre("save", function (next) {
  if (this.isModified()) {
    console.log("Pre-save campaign:", {
      _id: this._id,
      sendgridMessageId: this.sendgridMessageId,
      status: this.status,
      metrics: this.metrics,
    });
  }
  next();
});

// Método estático para actualizar o crear campaña
campaignSchema.statics.findOrCreateBySendgridId = async function (sendgridMessageId, campaignData) {
  try {
    let campaign = await this.findOne({ sendgridMessageId });

    if (!campaign) {
      campaign = new this({
        ...campaignData,
        sendgridMessageId,
        status: "in_progress",
      });
    }

    return campaign;
  } catch (error) {
    console.error("Error en findOrCreateBySendgridId:", error);
    throw error;
  }
};

module.exports = mongoose.model("Campaign", campaignSchema);
