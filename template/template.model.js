const mongoose = require("mongoose");

const templateSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    ref: "User",
  },
  name: {
    type: String,
    required: true,
  },
  design: {
    type: Object,
    required: true,
  },
  subject: {
    type: String,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Template = mongoose.model("Template", templateSchema);
module.exports = Template;
