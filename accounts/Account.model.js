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
      addedPromotions: [
        {
          promotion: {
            type: mongoose.Schema.Types.ObjectId, // ID de la promoción
            ref: "Promotion", // Referencia al modelo Promotion
          },
          addedDate: {
            type: Date, // Fecha de adición de la promoción
            default: Date.now, // Establece la fecha actual si no se especifica
          },
          endDate: {
            type: Date, // Fecha de expiración de la promoción
          },
          actualVisits: {
            type: Number, // Número de visitas actuales
            default: 0, // Valor inicial 0
          },
          status: {
            type: String,
            enum: ["Active", "Expired"], // Estado de la promoción
            default: "Active", // Valor por defecto
          },
          redeemCount: {
            type: Number, // Contador de redenciones
            default: 0, // Valor inicial
          },
          visitDates: [
            {
              type: Date, // Fechas de visitas
            },
          ],
        },
      ],
    },
  ],

  promotions: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Promotion", // Referencia al modelo de promociones
    },
  ],
  planStatus: {
    type: String,
    default: "free",
    enum: ["free", "pro", "premium", "admin"], // Ejemplo de posibles estados
  },
  planDetails: {
    type: Object,
  },
  planExpiration: {
    type: Date,
  },
  accountLogo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Image", // Referencia al modelo de imagen
  },
  Industry: {
    type: String,
  },
  activeQr: {
    type: Boolean,
    default: false,
  },
  dailyKey: {
    type: String,
  },
  qrKeyExpiration: {
    type: Date,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Account = mongoose.model("Account", accountSchema);

module.exports = Account;
