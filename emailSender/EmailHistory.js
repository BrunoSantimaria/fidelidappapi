const mongoose = require("mongoose");

const emailHistorySchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    subject: {
      type: String,
      required: true,
    },
    sentAt: {
      type: Date,
      default: Date.now,
    },
    totalEmailsSent: {
      type: Number,
      required: true,
    },
    successfulSends: {
      type: Number,
      default: 0,
    },
    failedSends: {
      type: Number,
      default: 0,
    },
    recipients: [
      {
        email: String,
        name: String,
        status: {
          type: String,
          enum: ["success", "failed"],
          required: true,
        },
        error: String,
      },
    ],
    template: {
      type: String,
      required: true,
    },
    senderEmail: {
      type: String,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("EmailHistory", emailHistorySchema);
