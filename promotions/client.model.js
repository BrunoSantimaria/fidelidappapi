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
        required: true,
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
        default: 0,
      },
      pointsEarned: {
        type: Number,
        default: 0,
      },
      status: {
        type: String,
        enum: ["Active", "Redeemed", "Expired", "Pending"],
        default: "Active",
      },
      redeemCount: {
        type: Number,
        default: 0,
      },
      visitDates: [
        {
          date: { type: Date, required: true },
          pointsAdded: {
            type: Number,
            required: function () {
              return this.systemType === "points";
            },
          },
          _id: false,
        },
      ],

      lastRedeemDate: {
        type: Date,
      },
      systemType: {
        type: String,
        required: true,
        enum: ["visits", "points"],
      },
    },
  ],
  totalPoints: {
    // Nuevo campo para almacenar el total de puntos acumulados
    type: Number,
    default: 0,
  },
});

// Create the Client model
const Client = mongoose.model("Client", ClientSchema);

module.exports = Client;
