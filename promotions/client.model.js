const mongoose = require("mongoose");

// Define the Client Schema
const ClientSchema = new mongoose.Schema({
  name: {
    type: String,
    default: "",
  },
  email: { type: String, unique: true, index: true }, // Índice único
  phoneNumber: {
    type: String,
    default: "",
    required: false,
  },
  addedAccounts: [
    {
      accountId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
      },
    },
  ],
  addedpromotions: [
    {
      promotion: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Promotion",
        required: false,
      },
      addedDate: {
        type: Date,
        default: Date.now,
      },
      endDate: {
        type: Date,
      },
      actualVisits: {
        type: Number,
        default: 0, // Default value is 0
      },
      status: {
        type: String,
        enum: ["Active", "Redeemed", "Expired", "Pending"],
        default: "Active", // Default value is 'Active'
      },
      redeemCount: {
        type: Number,
        default: 0,
      },
      visitDates: [{ type: Date }], // Array to store visit dates
      lastRedeemDate: {
        type: Date,
      },
    },
  ],
}
);

// Create the Client model
const Client = mongoose.model("Client", ClientSchema);

module.exports = Client;
