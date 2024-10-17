const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  agendaId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Agenda', // Referencia al modelo de Agenda
    required: true
  },
  clientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client', // Referencia al modelo de Cliente
    required: true
  },
  startTime: {
    type: Date, // Hora de inicio de la cita
    required: true
  },
  endTime: {
    type: Date, // Hora de fin de la cita (calculada automáticamente con base en la duración del evento en la agenda)
    required: true
  },
  status: {
    type: String,
    enum: ['Scheduled', 'Cancelled','Confirmed', 'Past', 'No Show', 'Completed'], // Estados posibles de la cita
    default: 'Scheduled'
  },
  createdAt: {
    type: Date,
    default: Date.now // Fecha de creación de la cita
  },
  updatedAt: {
    type: Date,
    default: Date.now // Fecha de última actualización de la cita
  }
});

appointmentSchema.pre('save', async function(next) {
  if (!this.isModified('startTime')) return next();

  // Calcula el endTime basado en la duración del evento en la agenda
  const agenda = await mongoose.model('Agenda').findById(this.agendaId);
  if (!agenda) {
    return next(new Error('Agenda not found'));
  }

  const endTime = new Date(this.startTime.getTime() + agenda.eventDuration * 60000);
  this.endTime = endTime;
  
  next();
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

module.exports = Appointment;
