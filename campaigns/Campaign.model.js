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
      processed: { type: Number, default: 0 },
      deferred: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      bounces: { type: Number, default: 0 },
      blocked: { type: Number, default: 0 },
      spam: { type: Number, default: 0 },
      opens: { type: Number, default: 0 },
      clicks: { type: Number, default: 0 },
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

// Método estático para actualizar o crear campaña
// Método estático para actualizar o crear campaña
campaignSchema.statics.findOrCreateBySendgridId = async function (sendgridMessageId, campaignData) {
  try {
    // Intentar encontrar una campaña con el sendgridMessageId, o por nombre y asunto
    let campaign = await this.findOne({
      $or: [{ sendgridMessageId }, { sendgridMessageIds: { $in: [sendgridMessageId] } }, { name: campaignData.name, subject: campaignData.subject }],
    });

    // Si no existe, se crea una nueva campaña
    if (!campaign) {
      campaign = new this({
        ...campaignData,
        sendgridMessageId,
        sendgridMessageIds: [sendgridMessageId],
        status: "in_progress",
      });
    } else {
      // Si la campaña existe, se agregan los nuevos sendgridMessageId al array
      if (!campaign.sendgridMessageIds.includes(sendgridMessageId)) {
        campaign.sendgridMessageIds.push(sendgridMessageId);
      }
    }

    // Guardar la campaña, sea nueva o actualizada
    await campaign.save();
    return campaign;
  } catch (error) {
    throw error;
  }
};

module.exports = mongoose.model("Campaign", campaignSchema);
