const mongoose = require('mongoose');

// Automation Rule Schema
const automationRuleSchema = new mongoose.Schema({
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: true,
  },
  name: {
    type: String,
    required: true,
  },
  condition: {
    type: String,
    required: true,
    enum: [
      'clientRegistration',
      'registrationDate',
      'clientInactivity',
      // 'promotionExpiration',
      // 'clientBirthday',
      // 'accountPlanExpiration',
      // 'totalVisitsAchieved',
      // 'newConsumer',
    ],
  },
  conditionValue: {
    type: Number,
    required: true,
  },
  subject:
  {
    type: String, required: true
  },
  message:
  {
    type: String, required: true
  },
  isActive: {
    type: Boolean,
    default: true,
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

// Middleware to auto-update `updatedAt`
automationRuleSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

const AutomationRule = mongoose.model('AutomationRule', automationRuleSchema);

module.exports = AutomationRule;
