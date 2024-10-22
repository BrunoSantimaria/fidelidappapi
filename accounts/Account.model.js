const mongoose = require("mongoose");

const accountSchema = new mongoose.Schema({
  name: {
    type: String,
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  logo: {
    type: String,
    default: "",
  },
  userEmails: [
    {
      type: String,
    },
  ],
  clients: [
    {
      id: mongoose.Schema.Types.ObjectId,
      name: String,
      email: String,
      phoneNumber: String,
      addedPromotions: [
        {
          promotion: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Promotion",
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
          status: {
            type: String,
            enum: ["Active", "Expired"],
            default: "Active",
          },
          redeemCount: {
            type: Number,
            default: 0,
          },
          visitDates: [
            {
              type: Date,
            },
          ],
        },
      ],
    },
  ],
  promotions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion",
    },
  ],
  planStatus: {
    type: String,
    default: "free",
    enum: ["free", "pro", "premium", "admin"],
  },
  planDetails: {
    type: Object,
  },
  planExpiration: {
    type: Date,
  },
  accountLogo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Image",
  },
  Industry: {
    type: String,
  },
  activeQr: {
    type: Boolean,
    default: true,
  },
  accountQr: {
    type: String,
    required: true,
    unique: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  socialMedia: [
    {
      instagram: {
        type: String,
        default: "",
      },
      facebook: {
        type: String,
        default: "",
      },
      whatsapp: {
        type: String,
        default: "",
      },
    },
  ],
});

module.exports = mongoose.model("Account", accountSchema);
