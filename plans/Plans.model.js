const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Definición del esquema del plan
const PlanSchema = new Schema({
  planStatus: {
    type: String,
    required: true,
    enum: ["free", "pro", "premium", "admin"], // Ejemplo de posibles estados
    unique: true,
  },
  promotionLimit: {
    type: Number,
    required: false,
    min: 0, // Asegura que el límite de promociones no sea negativo
  },
  clientLimit: {
    type: Number,
    default: 500, // Valor por defecto para 'free', se actualizará dinámicamente en el middleware
    min: 0, // Asegura que el límite de clientes no sea negativo
  },
  sendEmail: {
    type: Boolean,
    required: true,
    default: true,
  },
  emailLimit: {
    type: Number,
    default: 1000,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

PlanSchema.pre("save", function (next) {
  this.updatedAt = Date.now();

  if (this.planStatus === "free") {
    this.promotionLimit = 1;
    this.emailLimit = 300;
    this.clientLimit = 500;
    this.sendEmail = true;
  } else if (this.planStatus === "pro") {
    this.promotionLimit = 10;
    this.emailLimit = 10000;
    this.clientLimit = null;
    this.sendEmail = true;
  } else if (this.planStatus === "admin") {
    this.promotionLimit = 50;
    this.emailLimit = 30000;
    this.sendEmail = true;
    this.clientLimit = null;
  }

  next();
});

const Plan = mongoose.model("Plan", PlanSchema);

module.exports = Plan;
