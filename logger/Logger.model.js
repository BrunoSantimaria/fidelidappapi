// models/Logger.js
const mongoose = require('mongoose');

const logSchema = new mongoose.Schema({
    timestamp: {
        type: Date,
        default: Date.now
    },
    action: {
        type: String,
        required: true
    },
    email: {
        type: String,
        ref: 'User',
        required: true
    },
    details: {
        type: String,
        required: false
    }
});

const Log = mongoose.model('Log', logSchema);

module.exports = Log;
