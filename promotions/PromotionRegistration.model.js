const mongoose = require("mongoose");

const promotionRegistrationSchema = new mongoose.Schema({
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Account",
    required: true,
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  promotionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Promotion",
    required: true,
  },
  clientEmail: {
    type: String,
    required: true,
  },
  clientName: {
    type: String,
    required: true,
  },
  registrationDate: {
    type: Date,
    default: Date.now,
  },
  promotionTitle: {
    type: String,
    required: true,
  },
  systemType: {
    type: String,
    enum: ["points", "visits"],
    required: true,
  },
});

module.exports = mongoose.model("PromotionRegistration", promotionRegistrationSchema);
