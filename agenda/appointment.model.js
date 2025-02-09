const mongoose = require("mongoose");
const crypto = require("crypto");

const AppointmentSchema = new mongoose.Schema(
  {
    agendaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agenda",
      required: true,
    },
    clientName: {
      type: String,
      required: true,
    },
    clientEmail: {
      type: String,
      required: true,
    },
    clientPhone: {
      type: String,
      required: false,
    },
    notes: {
      type: String,
      required: false,
    },
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    numberOfPeople: {
      type: Number,
      default: 1,
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "confirmed", "cancelled", "completed"],
      default: "pending",
    },
    reminderSent: {
      type: Boolean,
      default: false,
    },
    cancellationReason: {
      type: String,
    },
    confirmationToken: {
      type: String,
      default: () => crypto.randomBytes(32).toString("hex"),
    },
    confirmationTokenExpires: {
      type: Date,
      default: () => new Date(+new Date() + 24 * 60 * 60 * 1000), // 24 horas
    },
    cancellationToken: {
      type: String,
      default: () => crypto.randomBytes(32).toString("hex"),
    },
  },
  { timestamps: true }
);

// Agregar método para verificar si la cita puede ser cancelada
AppointmentSchema.methods.isCancellable = function () {
  const now = new Date();
  const appointmentDate = new Date(this.startTime);
  const hoursUntilAppointment = (appointmentDate - now) / (1000 * 60 * 60);
  return hoursUntilAppointment > 24;
};

const Appointment = mongoose.model("Appointment", AppointmentSchema);
module.exports = Appointment;
