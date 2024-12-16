const mongoose = require("mongoose");
const slugify = require("slugify");

// Definir el schema de reward
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

// Esquema de Account
const accountSchema = new mongoose.Schema({
  name: { type: String },
  slug: { type: String, unique: true, required: false },
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
  firstEmailMarketingCompleted: { type: Boolean, default: false },
  isActive: { type: Boolean, default: false },
  industry: { type: String },
  activeQr: { type: Boolean, default: true },
  accountQr: { type: String, required: false, unique: false },
  createdAt: { type: Date, default: Date.now },
  avatar: { type: String, default: "" },
  socialMedia: {
    instagram: { type: String, default: "" },
    facebook: { type: String, default: "" },
    whatsapp: { type: String, default: "" },
    website: { type: String, default: "" },
  },
  emailsSentCount: { type: Number, default: 0, min: 0 },
  lastEmailSentAt: { type: Date, default: null },
  expirationDate: { type: Date, default: null },
  phone: { type: String, default: "" },
  senderEmail: { type: String, default: "" },
  activePayer: { type: Boolean, default: false },
});

// Middleware para generar el slug automáticamente
accountSchema.pre("save", async function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true, strict: true });

    // Verifica si el slug es único
    const existingAccount = await mongoose.models.Account.findOne({ slug: this.slug });
    if (existingAccount) {
      // Si ya existe, añade un sufijo único al slug
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }
  next();
});

// Método adicional para loggear el email enviado
accountSchema.methods.logEmailSent = async function () {
  try {
    this.emailsSentCount += 1;
    this.lastEmailSentAt = Date.now();
    await this.save();
  } catch (error) {
    console.error("Error logging email sent:", error);
  }
};

// Función para generar slugs para cuentas existentes
const generateSlugsForAccounts = async () => {
  try {
    console.log("Generando slugs para cuentas existentes...");
    const accountsWithoutSlug = await Account.find({ slug: { $exists: false } });

    for (const account of accountsWithoutSlug) {
      let slug;

      // Si la cuenta tiene un name, usamos ese valor para generar el slug
      if (account.name) {
        slug = slugify(account.name, { lower: true, strict: true });
      } else {
        // Si no tiene name, generamos un slug a partir de un identificador único
        slug = `account-${account._id.toString().slice(-6)}`; // Usamos los últimos 6 caracteres del ObjectId
      }

      // Asegúrate de que el slug sea único
      const existingAccount = await Account.findOne({ slug });
      if (existingAccount) {
        slug = `${slug}-${Date.now()}`; // Si el slug ya existe, le añadimos un timestamp para hacerlo único
      }

      // Asignar el slug generado al campo slug de la cuenta
      account.slug = slug;

      // Guardamos los cambios en la base de datos
      await account.save();
    }

    console.log(`${accountsWithoutSlug.length} cuentas actualizadas con slugs.`);
  } catch (error) {
    console.error("Error al generar slugs para cuentas:", error);
  }
};

// Crear el modelo de Account
const Account = mongoose.model("Account", accountSchema);

// Ejecutar la función para generar slugs
generateSlugsForAccounts();

module.exports = Account;
