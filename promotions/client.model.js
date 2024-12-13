const mongoose = require("mongoose");

const ActivitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["earned", "redeemed", "visit"],
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    promotionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
    },
  },
  { _id: true }
);

const ClientSchema = new mongoose.Schema({
  name: {
    type: String,
    default: "",
  },
  email: {
    type: String,
    unique: true,
    index: true,
  },
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
          date: { type: Date, required: false },
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
        required: false,
        enum: ["visits", "points"],
      },
    },
  ],
  activities: [ActivitySchema],
  totalPoints: {
    type: Number,
    default: 0,
  },
});

// Method to calculate total points from activities
ClientSchema.methods.calculateTotalPoints = function () {
  return this.activities.reduce((total, activity) => {
    if (activity.type === "earned") {
      return total + activity.amount;
    } else if (activity.type === "redeemed") {
      return total - activity.amount;
    }
    return total;
  }, 0);
};

// Pre-save hook to update totalPoints
ClientSchema.pre("save", function (next) {
  this.totalPoints = this.calculateTotalPoints();
  next();
});

const Client = mongoose.model("Client", ClientSchema);

module.exports = Client;
