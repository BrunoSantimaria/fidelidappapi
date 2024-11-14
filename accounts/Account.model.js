const mongoose = require("mongoose");

const rewardSchema = new mongoose.Schema({
  points: {
    type: Number,
    required: true,
  },
  description: {
    type: String,
    required: true,
  },
});

const accountSchema = new mongoose.Schema({
  name: { type: String },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  logo: { type: String, default: "" },
  userEmails: [{ type: String }],
  subscriptionId: { type: String },
  clients: [
    {
      id: mongoose.Schema.Types.ObjectId,
      name: String,
      email: String,
      phoneNumber: String,
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
  planExpiration: { type: Date },
  isActive: { type: Boolean, default: false },
  industry: { type: String },
  activeQr: { type: Boolean, default: true },
  accountQr: { type: String, required: true, unique: false },
  createdAt: { type: Date, default: Date.now },
  avatar: { type: String, default: "" },
  socialMedia: {
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    website: { type: String, default: "" },
  },
  emailsSentCount: { type: Number, default: 0 },
  lastEmailSentAt: { type: Date, default: null },
  expirationDate: { type: Date, default: null },
  phone: { type: String, default: "" },
  senderEmail: { type: String, default: "" },
  activePayer: { type: Boolean, default: false },
});

// Método para registrar un email enviado
accountSchema.methods.logEmailSent = async function () {
  try {
    this.emailsSentCount += 1;
    this.lastEmailSentAt = Date.now();
    await this.save();
  } catch (error) {
    console.error("Error logging email sent:", error);
  }
};

// Método para obtener la cantidad de emails enviados en los últimos 30 días
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

// Método para actualizar el plan de la cuenta
accountSchema.methods.updatePlan = async function (plan, expirationDate) {
  this.planStatus = plan;
  this.planExpiration = expirationDate;
  this.activePayer = true;
  await this.save();
};

// Crear y exportar el modelo
const Account = mongoose.model("Account", accountSchema);

module.exports = Account;
