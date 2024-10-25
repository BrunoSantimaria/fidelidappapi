const mongoose = require("mongoose");

const appointmentSchema = new mongoose.Schema({
  agendaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Agenda",
    required: true,
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Client",
    required: true,
  },
  startTime: {
    type: Date,
    required: true,
  },
  endTime: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ["Scheduled", "Cancelled", "Confirmed", "Past", "No Show", "Completed"],
    default: "Scheduled",
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

appointmentSchema.pre("save", async function (next) {
  if (!this.isModified("startTime")) return next();

  const agenda = await mongoose.model("Agenda").findById(this.agendaId);
  if (!agenda) {
    return next(new Error("Agenda not found"));
  }

  const endTime = new Date(this.startTime.getTime() + agenda.eventDuration * 60000);
  this.endTime = endTime;

  next();
});

const Appointment = mongoose.model("Appointment", appointmentSchema);

module.exports = Appointment;
