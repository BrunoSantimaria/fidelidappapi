const e = require("express");
const mongoose = require("mongoose");

const promotionSchema = new mongoose.Schema({
  userID: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User", // Reference to the User model
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
  promotionType: {
    type: String,
    required: true,
  },
  promotionRecurrent: {
    type: String,
    required: true,
    default: "True",
    enum: ["True", "False"],
  },
  visitsRequired: {
    type: Number,
    required: true,
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
});

const Promotion = mongoose.model("Promotion", promotionSchema);

module.exports = Promotion;
