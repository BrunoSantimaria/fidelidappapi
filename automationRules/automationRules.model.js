const mongoose = require('mongoose');

// Automation Rule Schema
const automationRuleSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true, // La regla debe estar vinculada a una cuenta
  },
  name: {
    type: String,
    required: true, // Un nombre para la regla, por ejemplo "Recordatorio de promoción"
  },
  condition: {
    type: String,
    required: true, // La condición para activar la regla, por ejemplo "client inactivity", "promotion expiration"
    enum: ['clientInactivity', 'promotionExpiration', 'registrationAnniversary','customDate', 'clientBirthday', 'accountPlanExpiration', 'totalVisitsAchieved'], // Ejemplo de condiciones
  },
  conditionValue: {
    type: Number,
    required: true, // Por ejemplo, cuántos días después de la inactividad o antes de la expiración
  },
  actionDetails: {
    type: Object, // Aquí puedes almacenar detalles específicos de la acción, como el mensaje o descuento
    required: true,
  },
  isActive: {
    type: Boolean,
    default: true, // Si la regla está activa o no
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

// Middleware para actualizar el campo updatedAt automáticamente
automationRuleSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const AutomationRule = mongoose.model('AutomationRule', automationRuleSchema);

module.exports = AutomationRule;
