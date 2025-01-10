// Mongoose Model: smsModel.js
const mongoose = require("mongoose");

const SmsSchema = new mongoose.Schema({
  AccountSid: {
    type: String,
    required: true,
  },
  From: {
    type: String,
    required: true,
  },
  MessageSid: {
    type: String,
    required: true,
  },
  MessageStatus: {
    type: String,
    required: true,
  },
  SmsSid: {
    type: String,
    required: true,
  },
  SmsStatus: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Sms = mongoose.model("Sms", SmsSchema);
module.exports = Sms;