const mongoose = require("mongoose");
const slugify = require("slugify");

const landingSchema = new mongoose.Schema(
  {
    card: {
      type: {
        type: String,
        enum: ["link", "view_on_site"],
        default: "view_on_site",
      },
      content: {
        type: [String], // Array of image URLs or external link
        default: [],
      },
      title: {
        type: String,
        default: "Ver nuestra carta",
      },
    },
    name: {
      type: String,
      required: false,
      default: "",
    },
    title: {
      type: String,
      default: "¡Regístrate y empieza a sumar puntos! 🌟 Entérate de nuestras promociones y obtén grandes beneficios 🎉",
    },
    subtitle: {
      type: String,
      default: "Entérate de nuestras promociones y obtén grandes beneficios 🎉",
    },
    colorPalette: {
      type: String,

      default: "dark-slate",
    },
    googleBusiness: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

const accountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: false,
      default: "Mi negocio",
    },
    slug: {
      type: String,
      unique: true,
      required: false,
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    logo: {
      type: String,
      default: "",
    },
    landing: {
      type: landingSchema,
      default: () => ({}),
    },
    userEmails: [
      {
        type: String,
      },
    ],
    subscriptionId: {
      type: String,
    },
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
    planExpiration: {
      type: Date,
    },
    firstEmailMarketingCompleted: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: false,
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
      required: false,
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
      website: {
        type: String,
        default: "",
      },
    },
    emailsSentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastEmailSentAt: {
      type: Date,
      default: null,
    },
    expirationDate: {
      type: Date,
      default: null,
    },
    phone: {
      type: String,
      default: "",
    },
    senderEmail: {
      type: String,
      default: "",
    },
    activePayer: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Middleware para generar el slug automáticamente
accountSchema.pre("save", async function (next) {
  // Generación del slug si el nombre cambia
  if (this.isModified("name")) {
    this.slug = slugify(this.name, { lower: true, strict: true });
    const existingAccount = await mongoose.models.Account.findOne({ slug: this.slug });
    if (existingAccount) {
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }

  // Si landing.name no está definido, asigna el nombre de la cuenta
  if (!this.landing || Object.keys(this.landing).length === 0) {
    this.landing = { name: this.name };
  } else if (!this.landing.name) {
    this.landing.name = this.name;
  }

  next();
});

// Función para asignar landingSchema por defecto a cuentas existentes
const assignDefaultLanding = async () => {
  try {
    console.log("Asignando landingSchema por defecto a cuentas existentes...");
    const accountsToUpdate = await Account.find({ $or: [{ landing: { $exists: false } }, { "landing.name": { $exists: false } }] });

    for (const account of accountsToUpdate) {
      account.landing = account.landing || {};
      account.landing.name = account.name || "Mi Negocio";
      await account.save();
    }

    console.log(`${accountsToUpdate.length} cuentas actualizadas con landingSchema por defecto.`);
  } catch (error) {
    console.error("Error al asignar landingSchema por defecto:", error);
  }
};

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
assignDefaultLanding();

module.exports = Account;
