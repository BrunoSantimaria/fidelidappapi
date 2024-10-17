const mongoose = require('mongoose');

const agendaSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        default: 'NoName Agenda'
    },
    description: {
        type: String,
        required: true,
        default: 'NoDescription Agenda'
    },
    slots: {
        type: Number,
        required: true,
        default: 1
    },
  accountId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account', // Referencia al modelo de cuenta que posee la agenda
    required: true
  },
  eventDuration: {
    type: Number, // Duración de cada evento en minutos
    required: true
  },
  availableDays: {
    type: [Number], // Diáas disponibles para reservar (por ejemplo, [1, 2, 3, 4, 5, 6, 0])
    required: true,
    enum: [1, 2, 3, 4, 5, 6, 0]
  },
  availableHours: {
    type: [{ start: String, end: String }], // Horas disponibles para cada día (por ejemplo, [{ start: "09:00", end: "12:00" }])
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now // Fecha de creación de la agenda
  }
});

const Agenda = mongoose.model('Agenda', agendaSchema);

module.exports = Agenda;
