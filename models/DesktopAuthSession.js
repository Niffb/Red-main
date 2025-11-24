const mongoose = require('mongoose');

const desktopAuthSessionSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true,
        unique: true
    },
    deviceId: {
        type: String,
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    status: {
        type: String,
        enum: ['pending', 'authenticated', 'expired'],
        default: 'pending'
    },
    callbackUrl: {
        type: String,
        required: false
    },
    expiresAt: {
        type: Date,
        required: true,
        default: () => new Date(+new Date() + 10 * 60 * 1000) // 10 minutes from now
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // TTL index: doc removed 10 mins after creation (matches expiresAt)
    }
});

module.exports = mongoose.model('DesktopAuthSession', desktopAuthSessionSchema);
