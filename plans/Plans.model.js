const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Definición del esquema del plan
const PlanSchema = new Schema({
    planStatus: {
        type: String,
        required: true,
        enum: ['free', 'pro', 'premium', 'admin'], // Ejemplo de posibles estados
        unique: true
    },
    promotionLimit: {
        type: Number,
        required: false,
        min: 0 // Asegura que el límite de promociones no sea negativo
    },
    clientLimit: {
        type: Number,
        required: false,
        min: 0 // Asegura que el límite de clientes no sea negativo
    },
    sendEmail: {
        type: Boolean,
        required: true,
        default: false // Por defecto, no se envían correos electrónicos
    },
    createdAt: {
        type: Date,
        default: Date.now // Fecha de creación del plan
    },
    updatedAt: {
        type: Date,
        default: Date.now // Fecha de última actualización del plan
    }
});

// Middleware para actualizar la fecha de actualización (updatedAt) antes de guardar
PlanSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

const Plan = mongoose.model('Plan', PlanSchema);

module.exports = Plan;
