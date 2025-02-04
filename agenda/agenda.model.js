const mongoose = require("mongoose");

const agendaSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    type: {
      type: String,
      enum: ["recurring", "special"],
      default: "recurring",
    },
    requiresCapacity: {
      type: Boolean,
      default: false, // false para peluquerías, true para restaurantes
    },
    // Para eventos recurrentes
    recurringConfig: {
      daysOfWeek: [
        {
          type: Number,
          min: 0,
          max: 6,
        },
      ],
      timeSlots: [
        {
          start: String,
          end: String,
          capacity: {
            type: Number,
            default: 1, // Por defecto 1 persona/slot
          },
        },
      ],
      validFrom: Date,
      validUntil: Date,
    },
    // Para eventos especiales
    specialDates: [
      {
        date: Date,
        timeSlots: [
          {
            start: String,
            end: String,
            capacity: {
              type: Number,
              default: 1,
            },
          },
        ],
      },
    ],
    duration: {
      type: Number,
      required: true,
    },
    slots: {
      type: Number,
      required: true,
    },
    uniqueLink: {
      type: String,
      unique: true,
    },
    isDisabled: {
      type: Boolean,
      default: false,
    },
    disabledReason: {
      type: String,
    },
    disabledAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Agenda", agendaSchema);
