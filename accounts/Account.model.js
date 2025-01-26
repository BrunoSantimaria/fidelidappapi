const mongoose = require("mongoose");
const slugify = require("slugify");
const defaultMenu = {
  categories: [
    {
      name: "Para comer y picar",
      icon: "🍽️",
      description: "Platos abundantes para compartir",
      items: [
        {
          name: "Papas fritas",
          description: "Porción de papas fritas crujientes",
          price: 3990,
          image: "",
          available: true,
        },
      ],
    },
    {
      name: "Bebidas",
      icon: "🥤",
      description: "Refrescantes bebidas",
      items: [
        {
          name: "Coca Cola",
          description: "Bebida 350ml",
          price: 1990,
          image: "",
          available: true,
        },
      ],
    },
  ],
  settings: {
    currency: "$",
    showPrices: true,
    allowOrdering: false,
  },
};

const menuItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  price: {
    type: Number,
    required: false,
  },
  image: {
    type: String,
    default: "",
  },
  available: {
    type: Boolean,
    default: true,
  },
});

// Schema for menu categories
const menuCategorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  icon: {
    type: String,
    default: "",
  },
  description: {
    type: String,
  },
  items: [menuItemSchema],
});

// Schema para las valoraciones de meseros
const waiterRatingSchema = new mongoose.Schema(
  {
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
    },

    date: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

// Schema para los puntos sumados por el mesero
const waiterPointSchema = new mongoose.Schema(
  {
    points: {
      type: Number,
      required: true,
      default: 1,
    },
    date: {
      type: Date,
      default: Date.now,
    },
    client: {
      name: {
        type: String,
        default: "",
      },
      email: {
        type: String,
        default: "",
      },
    },
  },
  { _id: false }
);

// Schema para los meseros
const waiterSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  active: {
    type: Boolean,
    default: true,
  },
  totalPoints: {
    type: Number,
    default: 0,
  },
  ratings: [
    {
      rating: Number,
      comment: String,
      client: {
        name: String,
        email: String,
      },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  pointsHistory: [waiterPointSchema],
  averageRating: {
    type: Number,
    default: 0,
  },
  averagePointsPerDay: {
    type: Number,
    default: 0,
  },
  lastCalculationDate: {
    type: Date,
    default: Date.now,
  },
});

// Método para calcular el promedio de ratings
waiterSchema.methods.calculateAverageRating = function () {
  if (this.ratings.length === 0) return 0;
  const totalRating = this.ratings.reduce((sum, rating) => sum + rating.rating, 0);
  return totalRating / this.ratings.length;
};

// Método para calcular el promedio de puntos por día
waiterSchema.methods.calculateAveragePoints = function () {
  if (this.pointsHistory.length === 0) return 0;

  const now = new Date();
  const firstPointDate = this.pointsHistory[0].date;
  const daysDifference = Math.max(1, Math.ceil((now - firstPointDate) / (1000 * 60 * 60 * 24)));

  const totalPoints = this.pointsHistory.reduce((sum, point) => sum + point.points, 0);
  return totalPoints / daysDifference;
};

// Modificar landingSchema para incluir waiters
const landingSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "",
    },
    subtitle: {
      type: String,
      default: "",
    },
    name: {
      type: String,
      default: "",
    },
    colorPalette: {
      type: String,
      default: "",
    },
    minPointValue: {
      type: Number,
      default: 15000,
    },
    googleBusiness: {
      type: String,
      default: "",
    },
    card: {
      type: {
        type: String,
        enum: ["link", "view_on_site", "menu"],
        default: "menu",
      },
      content: {
        type: [String],
        default: [],
      },
      title: {
        type: String,
        default: "Ver nuestra carta",
      },
    },
    menu: {
      categories: {
        type: [menuCategorySchema],
        default: () => defaultMenu.categories,
      },
      settings: {
        currency: {
          type: String,
          default: "$",
        },
        showPrices: {
          type: Boolean,
          default: true,
        },
        allowOrdering: {
          type: Boolean,
          default: false,
        },
      },
    },
    waiters: {
      type: [waiterSchema],
      default: [],
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
    smsSentCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastsmsSentAt: {
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

  // Inicializar landing con menú por defecto
  if (!this.landing || Object.keys(this.landing).length === 0) {
    this.landing = {
      name: this.name,
      card: {
        type: "menu",
        content: [],
        title: "Ver nuestra carta",
      },
      menu: defaultMenu,
    };
  } else {
    // Asegurarse de que el menú existe y tiene categorías
    if (!this.landing.menu || !this.landing.menu.categories || this.landing.menu.categories.length === 0) {
      this.landing.menu = defaultMenu;
    }

    // Asegurarse de que card existe
    if (!this.landing.card) {
      this.landing.card = {
        type: "menu",
        content: [],
        title: "Ver nuestra carta",
      };
    }

    // Asignar nombre si no existe
    if (!this.landing.name) {
      this.landing.name = this.name;
    }
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

// Función para actualizar cuentas existentes
const updateExistingAccounts = async () => {
  try {
    console.log("Actualizando menús en cuentas existentes...");
    const accounts = await Account.find({});

    console.log(`Revisando ${accounts.length} cuentas para actualizar`);

    for (const account of accounts) {
      let needsUpdate = false;

      if (!account.landing?.menu?.categories || account.landing.menu.categories.length === 0) {
        console.log(`Actualizando menú para cuenta: ${account.name}`);
        if (!account.landing) account.landing = {};
        account.landing.menu = defaultMenu;
        needsUpdate = true;
      }

      if (!account.landing?.card?.type) {
        console.log(`Actualizando card para cuenta: ${account.name}`);
        account.landing.card = {
          type: "menu",
          content: [],
          title: "Ver nuestra carta",
        };
        needsUpdate = true;
      }

      if (needsUpdate) {
        await account.save();
        console.log(`Cuenta ${account.name} actualizada con éxito`);
      }
    }

    console.log("Actualización de cuentas completada");
  } catch (error) {
    console.error("Error al actualizar cuentas existentes:", error);
  }
};

// Ejecutar la función para generar slugs
const initializeDatabase = async () => {
  await generateSlugsForAccounts();
  await assignDefaultLanding();
  await updateExistingAccounts();
};

initializeDatabase();

module.exports = Account;
