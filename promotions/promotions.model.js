const mongoose = require("mongoose");
const { Start } = require("twilio/lib/twiml/VoiceResponse");

const rewardSchema = new mongoose.Schema({
  points: { type: Number, required: true },
  description: { type: String, required: true },
});

const promotionSchema = new mongoose.Schema(
  {
    userID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    conditions: {
      type: String,
      required: false,
    },
    // promotionType: {
    //   type: String,
    //   required: true,
    //   enum: ["Descuento", "Producto Gratis", "Cupones", "Otro"],
    // },
    promotionRecurrent: {
      type: String,
      required: true,
      default: "True",
      enum: ["True", "False"],
    },
    visitsRequired: {
      type: Number,
      required: false,
    },
    benefitDescription: {
      type: String,
    },
    promotionDuration: {
      type: Number,
      required: true,
    },
    imageID: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Image",
      required: false,
    },
    imageUrl: {
      type: String,
    },
    statistics: {
      type: Object,
    },
    visitsPerDay: {
      type: Object,
    },
    systemType: {
      type: String,
      required: true,
      enum: ["visits", "points"],
    },
    pointSystem: {
      type: Boolean,
      default: false,
    },
    rewards: {
      type: [rewardSchema],
      default: [],
    },
    startDate: {
      type: Date,
    },
    endDate: {
      type: Date,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive", "expired", "redeemed", "pending"],
    },
    daysOfWeek: {
      type: [Number], // Los días de la semana se representan como números (1-7)
      default: [], // Inicialmente vacío
    },
  },
  { timestamps: true }
);

const Promotion = mongoose.model("Promotion", promotionSchema);

module.exports = Promotion;
