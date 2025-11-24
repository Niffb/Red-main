const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        index: true  // Add index for faster lookups
    },
    password: {
        type: String,
        required: function() {
            return !this.googleId; // Password not required for Google OAuth users
        },
        minlength: 6
    },
    googleId: {
        type: String,
        sparse: true // Allows multiple null values
    },
    avatar: {
        type: String // Store user's profile picture URL
    },
    authProvider: {
        type: String,
        enum: ['local', 'google'],
        default: 'local'
    },
    plan: {
        type: String,
        default: 'Free',
        enum: ['Free', 'Starter', 'Super Red', 'Ultimate Red', 'Professional', 'Enterprise'],
        index: true  // Add index for plan-based queries
    },
    planPrice: {
        type: Number,
        default: 29
    },
    joinDate: {
        type: Date,
        default: Date.now
    },
    tasksUsed: {
        type: Number,
        default: 0
    },
    tasksLimit: {
        type: Number,
        default: 1000
    },
    storage: {
        type: Number,
        default: 0
    },
    apiCalls: {
        type: Number,
        default: 0
    },
    teamMembers: {
        type: Number,
        default: 1
    },
    nextBilling: {
        type: Date,
        default: function() {
            // Set next billing to 30 days from now
            return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
    },
    stripeCustomerId: {
        type: String,
        sparse: true,
        index: true  // Add index for faster Stripe lookups
    },
    stripeSubscriptionId: {
        type: String,
        sparse: true,
        index: true  // Add index for faster subscription lookups
    },
    paymentCompleted: {
        type: Boolean,
        default: false
    },
    subscriptionStatus: {
        type: String,
        enum: ['pending', 'active', 'cancelled', 'expired', 'past_due'],
        default: 'pending'
    },
    hasDownloadedApp: {
        type: Boolean,
        default: false
    },
    downloadPlatform: {
        type: String,
        enum: ['windows', 'mac', null],
        default: null
    },
    downloadDate: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Hash password before saving (only for local auth users)
userSchema.pre('save', async function(next) {
    if (!this.isModified('password') || !this.password) return next();
    
    try {
        const salt = await bcrypt.genSalt(10);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Method to compare password (only for local auth users)
userSchema.methods.comparePassword = async function(candidatePassword) {
    if (!this.password) return false; // Google OAuth users don't have passwords
    return bcrypt.compare(candidatePassword, this.password);
};

// Remove password from JSON output
userSchema.methods.toJSON = function() {
    const userObject = this.toObject();
    delete userObject.password;
    return userObject;
};

module.exports = mongoose.model('User', userSchema);
