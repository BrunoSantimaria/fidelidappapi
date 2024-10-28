const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Definir el esquema para la cuenta
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
    type: mongoose.Schema.Types.ObjectId,
    ref: "Plan",
  },
  planExpiration: {
    type: Date,
  },
  industry: {
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
  avatar: {
    type: String,
    default: "",
  },
  socialMedia: {
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
  emailsSentCount: {
    type: Number,
    default: 0,
  },
  lastEmailSentAt: {
    type: Date,
    default: null,
  },
});

accountSchema.methods.logEmailSent = async function () {
  try {
    this.emailsSentCount += 1;
    this.lastEmailSentAt = Date.now();
    await this.save();
  } catch (error) {
    console.error("Error logging email sent:", error);
  }
};

accountSchema.methods.getEmailSentCountLast30Days = async function () {
  if (this.lastEmailSentAt) {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.setDate(now.getDate() - 30));

    if (this.lastEmailSentAt >= thirtyDaysAgo) {
      return this.emailsSentCount;
    }
  }
  return 0;
};

// Crear el modelo de cuenta
const Account = mongoose.model("Account", accountSchema);

// Exportar el modelo
module.exports = { Account };
