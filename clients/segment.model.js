const mongoose = require("mongoose");

const segmentSchema = new mongoose.Schema({
  tag: { type: String, required: true },
  accountId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Account" },
  filters: { type: Object, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },
});

module.exports = mongoose.model("Segment", segmentSchema);
