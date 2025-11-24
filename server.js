const express = require('express');
const path = require('path');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

// Validate required environment variables
const criticalEnvVars = [
    'MONGODB_URI',
    'SESSION_SECRET',
    'STRIPE_SECRET_KEY'
];

const optionalEnvVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'STRIPE_WEBHOOK_SECRET'
];

const missingCriticalVars = criticalEnvVars.filter(varName => !process.env[varName]);
const missingOptionalVars = optionalEnvVars.filter(varName => !process.env[varName]);

if (missingCriticalVars.length > 0) {
    console.error('❌ ERROR: Missing CRITICAL environment variables:');
    missingCriticalVars.forEach(varName => {
        console.error(`   - ${varName}`);
    });
    console.error('\n📋 Please set these variables in Vercel Dashboard → Settings → Environment Variables\n');
    process.exit(1);
}

if (missingOptionalVars.length > 0) {
    console.warn('⚠️  WARNING: Missing optional environment variables (some features may not work):');
    missingOptionalVars.forEach(varName => {
        console.warn(`   - ${varName}`);
    });
    console.warn('');
}

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import models
const User = require('./models/User');
const Blog = require('./models/Blog');
const DesktopAuthSession = require('./models/DesktopAuthSession');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// Determine if running in production (needs to be defined early)
const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
const isVercel = process.env.VERCEL === '1';
const isLocalhost = !isVercel && (process.env.NODE_ENV !== 'production' || process.env.FORCE_LOCAL === '1');

// Startup logging
console.log('🚀 RED AI Server Initializing...');
console.log('📊 Environment:', isProduction ? 'PRODUCTION' : 'DEVELOPMENT');
console.log('🌐 Platform:', process.env.VERCEL ? 'Vercel' : 'Local');
console.log('🔐 MongoDB:', process.env.MONGODB_URI ? 'Configured ✅' : 'Missing ❌');
console.log('🔑 Session Secret:', process.env.SESSION_SECRET ? 'Configured ✅' : 'Missing ❌');
console.log('💳 Stripe:', process.env.STRIPE_SECRET_KEY ? 'Configured ✅' : 'Missing ❌');
console.log('🔵 Google OAuth:', (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ? 'Configured ✅' : 'Missing ⚠️');
console.log('');

// Security middleware - Helmet
// Note: CSP can be strict in serverless environments
app.use(helmet({
    contentSecurityPolicy: isProduction ? false : {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://rsms.me", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://js.stripe.com", "https://cdn.jsdelivr.net", "https://unpkg.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://rsms.me", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "blob:"],
            connectSrc: ["'self'", "https://api.stripe.com", "https://cdn.jsdelivr.net", "https://unpkg.com", "https://cdnjs.cloudflare.com"],
            frameSrc: ["'self'", "https://js.stripe.com", "https://hooks.stripe.com"],
            objectSrc: ["'none'"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

// Compression middleware for response compression
app.use(compression());

// Rate limiting for authentication endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // Limit each IP to 5 requests per windowMs
    message: 'Too many authentication attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Rate limiting for payment endpoints
const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // Limit each IP to 10 requests per windowMs
    message: 'Too many payment attempts, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// General API rate limiting
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: 'Too many requests, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
});

// Disable X-Powered-By header
app.disable('x-powered-by');

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => {
        console.log('✅ Connected to MongoDB successfully');

        // Initialize demo data if needed
        initializeDemoUsers();
        initializeSampleBlogs();
    })
    .catch((error) => {
        console.error('❌ MongoDB connection error:', error);
        process.exit(1);
    });

// Session configuration with MongoDB store (production-ready)
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        touchAfter: 24 * 3600, // Lazy session update - update session once per 24 hours
        crypto: {
            secret: process.env.SESSION_SECRET
        }
    }),
    cookie: {
        secure: isVercel, // Only use secure cookies on Vercel (HTTPS), not on localhost
        httpOnly: true, // Prevents client-side JS from accessing the cookie
        sameSite: isVercel ? 'none' : 'lax', // 'none' for cross-site on Vercel, 'lax' for localhost
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/', // Ensure cookie is valid for all paths
        domain: undefined // Let browser set domain automatically
    },
    name: 'connect.sid', // Explicit session cookie name
    proxy: isVercel, // Trust proxy only on Vercel (behind a proxy)
    rolling: true, // Reset cookie expiration on every response
    unset: 'destroy' // Delete session from store when unset
}));

// Apply general API rate limiting to all /api routes
app.use('/api/', apiLimiter);
app.post('/api/stripe-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'customer.subscription.created':
                console.log('Subscription created:', event.data.object.id);
                break;

            case 'customer.subscription.updated': {
                const updatedSubscription = event.data.object;
                await handleSubscriptionUpdate(updatedSubscription);
                break;
            }

            case 'customer.subscription.deleted': {
                const deletedSubscription = event.data.object;
                await handleSubscriptionCancellation(deletedSubscription);
                break;
            }

            case 'invoice.payment_succeeded': {
                const invoice = event.data.object;
                await handleSuccessfulPayment(invoice);
                break;
            }

            case 'invoice.payment_failed': {
                const failedInvoice = event.data.object;
                await handleFailedPayment(failedInvoice);
                break;
            }

            default:
                console.log(`Unhandled event type ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error('Error handling webhook:', error);
        res.status(500).json({ error: 'Webhook handler failed' });
    }
});

// Parse JSON and URL-encoded data
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Log static file requests in production for debugging
if (isProduction) {
    app.use((req, res, next) => {
        if (req.path.match(/\.(css|js|jpg|jpeg|png|svg|ico|html)$/)) {
            console.log('📄 Static file request:', req.path);
        }
        next();
    });
}

// Serve static files from the current directory
app.use(express.static(__dirname, {
    setHeaders: (res, path) => {
        if (path.endsWith('.css') || path.endsWith('.js')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        }
    }
}));

console.log('📁 Serving static files from:', __dirname);

// URL rewriting middleware for clean URLs
// Redirect .html extensions to clean URLs
app.use((req, res, next) => {
    const url = req.url;

    // Handle .html extension redirects
    if (url.endsWith('.html')) {
        const cleanUrl = url.replace('.html', '');

        // Special cases for files in subdirectories
        if (url.includes('/legal/')) {
            const filename = url.split('/').pop().replace('.html', '');
            return res.redirect(301, `/${filename}`);
        }

        // Standard redirects for root-level HTML files
        return res.redirect(301, cleanUrl === '/red' ? '/' : cleanUrl);
    }

    next();
});

// Passport configuration
passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// Google OAuth Strategy
// In production, GOOGLE_CALLBACK_URL should be set to your Vercel domain
// e.g., https://your-app.vercel.app/auth/google/callback
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Check if user already exists with this Google ID
        let existingUser = await User.findOne({ googleId: profile.id });

        if (existingUser) {
            return done(null, existingUser);
        }

        // Check if user exists with the same email (from regular signup)
        const existingEmailUser = await User.findOne({ email: profile.emails[0].value.toLowerCase() });

        if (existingEmailUser) {
            // Link Google account to existing user
            existingEmailUser.googleId = profile.id;
            existingEmailUser.avatar = profile.photos[0]?.value;
            existingEmailUser.authProvider = 'google';
            await existingEmailUser.save();
            return done(null, existingEmailUser);
        }

        // Create new user - start with Free plan
        const newUser = new User({
            name: profile.displayName,
            email: profile.emails[0].value.toLowerCase(),
            googleId: profile.id,
            avatar: profile.photos[0]?.value,
            authProvider: 'google',
            plan: 'Free',
            planPrice: 0,
            tasksUsed: 0,
            tasksLimit: 100,
            storage: 0,
            apiCalls: 0,
            teamMembers: 1,
            paymentCompleted: true, // Free plan is complete
            subscriptionStatus: 'active' // Free plan is active
        });

        const savedUser = await newUser.save();
        done(null, savedUser);
    } catch (error) {
        console.error('Google OAuth error:', error);
        done(error, null);
    }
}));

// Initialize demo users in MongoDB on first run
async function initializeDemoUsers() {
    try {
        const userCount = await User.countDocuments();
        if (userCount === 0) {
            console.log('🔄 Initializing demo users...');

            const demoUsers = [
                {
                    name: 'John Doe',
                    email: 'john@example.com',
                    password: 'password123',
                    plan: 'Professional',
                    planPrice: 79,
                    joinDate: new Date('2024-01-15'),
                    tasksUsed: 7500,
                    tasksLimit: 10000,
                    storage: 75.5,
                    apiCalls: 1250,
                    teamMembers: 12,
                    nextBilling: new Date('2024-02-15'),
                    paymentCompleted: true,
                    subscriptionStatus: 'active'
                },
                {
                    name: 'Jane Smith',
                    email: 'jane@example.com',
                    password: 'password123',
                    plan: 'Starter',
                    planPrice: 29,
                    joinDate: new Date('2024-02-01'),
                    tasksUsed: 450,
                    tasksLimit: 1000,
                    storage: 12.3,
                    apiCalls: 320,
                    teamMembers: 3,
                    nextBilling: new Date('2024-03-01'),
                    paymentCompleted: true,
                    subscriptionStatus: 'active'
                }
            ];

            await User.insertMany(demoUsers);
            console.log('✅ Demo users created successfully');
        }
    } catch (error) {
        console.error('❌ Error initializing demo users:', error);
    }
}

// Initialize sample blog posts in MongoDB on first run
async function initializeSampleBlogs() {
    try {
        const blogCount = await Blog.countDocuments();
        if (blogCount === 0) {
            console.log('🔄 Initializing sample blog posts...');

            const sampleBlogs = [
                {
                    title: 'Introducing RED AI: Your Intelligent Business Administrator',
                    excerpt: 'Today marks a revolutionary milestone in business automation. RED AI officially launches, bringing enterprise-grade intelligent administration to businesses of all sizes.',
                    content: `# Introducing RED AI: Your Intelligent Business Administrator

Today marks a revolutionary milestone in business automation. We're thrilled to announce the official launch of RED AI, an intelligent business administrator designed to transform how organizations operate, streamline workflows, and unlock unprecedented productivity.

## What is RED AI?

RED AI is more than just another automation tool—it's your dedicated digital business administrator that learns, adapts, and evolves with your organization. Built on cutting-edge artificial intelligence technology, RED AI handles complex business processes with the intelligence and decision-making capabilities you'd expect from your best human administrators.

## Key Features at Launch

### 🤖 Intelligent Task Automation
- Automate repetitive administrative tasks
- Smart workflow management
- Adaptive process optimization
- Context-aware decision making

### 📊 Advanced Analytics & Insights
- Real-time business intelligence
- Predictive analytics
- Performance optimization recommendations
- Data-driven decision support

### 🔗 Seamless Integrations
- Connect with 50+ popular business tools
- API-first architecture
- Custom integration support
- Enterprise-grade security

### 🎯 Customizable AI Modules
- Tailored to your industry needs
- Scalable capability expansion
- Custom workflow creation
- Personalized automation rules

## Why RED AI Matters

In today's fast-paced business environment, organizations are drowning in administrative overhead. Teams spend 60% of their time on routine tasks that could be automated, leaving little room for strategic thinking and innovation. RED AI changes this paradigm by:

- **Eliminating Administrative Burden**: Free your team from repetitive tasks
- **Enhancing Decision Making**: AI-powered insights for better choices
- **Scaling Operations**: Grow without proportional overhead increase
- **Improving Accuracy**: Reduce human error in critical processes

## Getting Started

RED AI is available in three tiers designed to meet the needs of different organizations:

- **Starter Plan ($29/month)**: Perfect for small teams and startups
- **Professional Plan ($79/month)**: Ideal for growing businesses
- **Enterprise Plan**: Custom solutions for large organizations

## What's Next?

This is just the beginning. Our roadmap includes exciting features like:
- Advanced AI conversations
- Multi-language support
- Mobile applications
- Enhanced collaboration tools
- Industry-specific AI modules

## Join the Revolution

We believe every business deserves access to intelligent automation. RED AI isn't just a product—it's a movement towards a more efficient, productive, and innovative future of work.

Ready to transform your business operations? Visit our website to start your free trial and experience the power of intelligent business administration.

Welcome to the future. Welcome to RED AI.`,
                    image: 'images/Gemini_Generated_Image_8l482q8l482q8l48.png',
                    category: 'Announcement',
                    featured: true,
                    publishDate: new Date(),
                    readTime: 8,
                    tags: ['Launch', 'AI', 'Business Automation', 'Announcement'],
                    slug: 'introducing-red-ai-your-intelligent-business-administrator'
                }
            ];

            await Blog.insertMany(sampleBlogs);
            console.log('✅ Sample blog posts created successfully');
        }
    } catch (error) {
        console.error('❌ Error initializing sample blogs:', error);
    }
}

// Production ready - no demo data initialization

// Middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated() || (req.session && req.session.userId)) {
        return next();
    } else {
        // Check if it's an API request
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Authentication required. Please sign in.' });
        }
        // Preserve the original URL as a redirect parameter if it's not the root
        const redirectUrl = req.originalUrl;
        if (redirectUrl && redirectUrl !== '/') {
            return res.redirect(`/signin?redirect=${encodeURIComponent(redirectUrl)}`);
        }
        return res.redirect('/signin');
    }
};

// Middleware to check if user is authenticated AND has completed payment
// NOTE: This is for premium features that require active subscription
const requireAuthAndPayment = async (req, res, next) => {
    console.log('🔒 requireAuthAndPayment middleware triggered');
    console.log('📋 Session ID:', req.sessionID);
    console.log('👤 Session userId:', req.session?.userId);
    console.log('🔐 isAuthenticated():', req.isAuthenticated());

    if (!req.isAuthenticated() && !(req.session && req.session.userId)) {
        console.log('❌ Not authenticated, redirecting to signin');
        if (req.path.startsWith('/api/')) {
            return res.status(401).json({ error: 'Authentication required. Please sign in.' });
        }
        return res.redirect('/signin');
    }

    console.log('✅ User is authenticated');

    try {
        let userId = req.session.userId;

        // If using Passport authentication
        if (req.user && !userId) {
            userId = req.user._id;
        }

        console.log('🔍 Looking up user with ID:', userId);
        const user = await User.findById(userId);

        if (!user) {
            console.log('❌ User not found in database');
            if (req.path.startsWith('/api/')) {
                return res.status(401).json({ error: 'User not found. Please sign in again.' });
            }
            return res.redirect('/signin');
        }

        // Allow free plan users to access (they have paymentCompleted but no subscription)
        // Only block users who haven't set up any plan yet
        // Free plan: plan='Free' or plan='Starter' with no subscription
        const isFreeUser = (user.plan === 'Free' || (user.plan === 'Starter' && !user.stripeSubscriptionId));

        if (isFreeUser) {
            // Free users can access - set their status to active if not already
            if (user.subscriptionStatus !== 'active') {
                user.subscriptionStatus = 'active';
                user.paymentCompleted = true; // Free is considered "complete"
                await user.save();
            }
            return next();
        }

        // For paid plans, check if payment is completed and subscription is active
        if (!user.paymentCompleted || user.subscriptionStatus !== 'active') {
            if (req.path.startsWith('/api/') && !req.path.includes('/create-subscription')) {
                return res.status(403).json({ error: 'Payment required. Please complete your subscription.' });
            }
            return res.redirect('/payment');
        }

        return next();
    } catch (error) {
        console.error('Auth and payment check error:', error);
        if (req.path.startsWith('/api/')) {
            return res.status(500).json({ error: 'Server error. Please try again.' });
        }
        return res.redirect('/signin');
    }
};

// Route for the main landing page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'red.html'));
});

// Route for the sign in/up page
app.get('/signin', (req, res) => {
    // Redirect to dashboard if already logged in
    if (req.isAuthenticated() || (req.session && req.session.userId)) {
        const redirectUrl = req.query.redirect || '/dashboard';
        return res.redirect(redirectUrl);
    }
    res.sendFile(path.join(__dirname, 'signin.html'));
});

// Google OAuth routes
app.get('/auth/google',
    async (req, res, next) => {
        // Store the redirect URL in session if present
        if (req.query.redirect) {
            req.session.returnTo = req.query.redirect;
        }
        // Store desktop flag for app authentication
        if (req.query.desktop) {
            req.session.desktopAuth = true;
            console.log('🖥️ Desktop authentication flag set in session');
        }
        
        // Save session before redirecting to Google
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Session save error:', err);
                    reject(err);
                } else {
                    console.log('✅ Session saved before Google OAuth redirect');
                    resolve();
                }
            });
        });
        
        next();
    },
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: '/signin?error=oauth_failed' }),
    async (req, res) => {
        // Successful authentication
        req.session.userId = req.user._id;
        req.session.userEmail = req.user.email;

        console.log('🔵 Google OAuth callback - Session data:', {
            desktopAuth: req.session.desktopAuth,
            userId: req.session.userId,
            userEmail: req.session.userEmail
        });

        // Check if this is a desktop app authentication
        const desktop = req.session.desktopAuth;
        if (desktop) {
            console.log('🖥️ Desktop authentication detected - creating desktop session');
            delete req.session.desktopAuth;
            
            // Create a desktop auth session
            const token = crypto.randomBytes(32).toString('hex');
            const session = new DesktopAuthSession({
                token,
                deviceId: 'browser-auth',
                userId: req.user._id,
                status: 'authenticated'
            });
            await session.save();
            
            // Redirect to desktop app protocol
            const redirectUrl = `redglass://auth?token=${token}`;
            
            return res.send(`
                <!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Authentication Successful - Red AI</title>
                    <link rel="preconnect" href="https://fonts.googleapis.com">
                    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
                    <style>
                        * { margin: 0; padding: 0; box-sizing: border-box; }
                        body {
                            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                            min-height: 100vh;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%);
                            position: relative;
                            overflow: hidden;
                        }
                        .bg-pattern {
                            position: absolute;
                            top: 0; left: 0; right: 0; bottom: 0;
                            background-image: radial-gradient(circle at 25% 25%, rgba(220, 38, 38, 0.03) 0%, transparent 50%),
                                              radial-gradient(circle at 75% 75%, rgba(220, 38, 38, 0.05) 0%, transparent 50%);
                            pointer-events: none;
                        }
                        .card {
                            background: white;
                            padding: 48px 40px;
                            border-radius: 20px;
                            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
                            text-align: center;
                            max-width: 400px;
                            width: 90%;
                            position: relative;
                            z-index: 1;
                            animation: slideUp 0.5s ease-out;
                        }
                        @keyframes slideUp {
                            from { opacity: 0; transform: translateY(20px); }
                            to { opacity: 1; transform: translateY(0); }
                        }
                        .logo {
                            width: 56px;
                            height: 56px;
                            margin: 0 auto 24px;
                            animation: fadeIn 0.6s ease-out 0.2s both;
                        }
                        @keyframes fadeIn {
                            from { opacity: 0; transform: scale(0.8); }
                            to { opacity: 1; transform: scale(1); }
                        }
                        .success-ring {
                            width: 72px;
                            height: 72px;
                            border-radius: 50%;
                            background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            margin: 0 auto 24px;
                            animation: ringPop 0.5s ease-out 0.3s both;
                        }
                        @keyframes ringPop {
                            0% { transform: scale(0); }
                            60% { transform: scale(1.1); }
                            100% { transform: scale(1); }
                        }
                        .checkmark {
                            width: 32px;
                            height: 32px;
                            stroke: #dc2626;
                            stroke-width: 2.5;
                            fill: none;
                        }
                        .checkmark-path {
                            stroke-dasharray: 30;
                            stroke-dashoffset: 30;
                            animation: draw 0.4s ease-out 0.6s forwards;
                        }
                        @keyframes draw {
                            to { stroke-dashoffset: 0; }
                        }
                        h1 {
                            font-size: 22px;
                            font-weight: 600;
                            color: #171717;
                            margin-bottom: 8px;
                            letter-spacing: -0.01em;
                            animation: fadeIn 0.5s ease-out 0.4s both;
                        }
                        p {
                            font-size: 14px;
                            color: #737373;
                            line-height: 1.6;
                            animation: fadeIn 0.5s ease-out 0.5s both;
                        }
                        .status {
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            margin-top: 20px;
                            font-size: 13px;
                            color: #a3a3a3;
                            animation: fadeIn 0.5s ease-out 0.6s both;
                        }
                        .status-dot {
                            width: 6px;
                            height: 6px;
                            background: #22c55e;
                            border-radius: 50%;
                            animation: pulse 1.5s ease-in-out infinite;
                        }
                        @keyframes pulse {
                            0%, 100% { opacity: 1; transform: scale(1); }
                            50% { opacity: 0.5; transform: scale(0.8); }
                        }
                        .button {
                            display: inline-flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                            background: #dc2626;
                            color: white;
                            padding: 14px 28px;
                            border-radius: 12px;
                            text-decoration: none;
                            font-weight: 500;
                            font-size: 15px;
                            margin-top: 24px;
                            transition: all 0.2s ease;
                            animation: fadeIn 0.5s ease-out 0.7s both;
                        }
                        .button:hover {
                            background: #b91c1c;
                            transform: translateY(-1px);
                        }
                        .button svg {
                            width: 18px;
                            height: 18px;
                        }
                    </style>
                </head>
                <body>
                    <div class="bg-pattern"></div>
                    <div class="card">
                        <div class="logo">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 375 375" preserveAspectRatio="xMidYMid meet">
                                <defs>
                                    <clipPath id="c1"><path d="M 45 88 L 330 88 L 330 307 L 45 307 Z"/></clipPath>
                                    <clipPath id="c2"><path d="M 45 68 L 330 68 L 330 287 L 45 287 Z"/></clipPath>
                                </defs>
                                <g clip-path="url(#c1)"><path fill="#921e1e" d="M 193.53125 97.371094 L 193.53125 124.734375 C 193.53125 129.769531 197.617188 133.855469 202.652344 133.855469 L 226.242188 133.855469 L 261.578125 169.183594 C 261.570312 169.421875 261.507812 169.660156 261.507812 169.894531 L 261.507812 210.941406 C 261.507812 211.1875 261.5625 211.417969 261.578125 211.652344 L 234.570312 238.664062 C 234.332031 238.652344 234.105469 238.589844 233.859375 238.589844 L 192.8125 238.589844 C 192.566406 238.589844 192.335938 238.644531 192.101562 238.664062 L 178.453125 225.015625 C 178.855469 223.519531 179.128906 221.96875 179.128906 220.347656 L 179.128906 165.617188 C 179.128906 155.539062 170.964844 147.375 160.886719 147.375 L 106.15625 147.375 C 96.078125 147.375 87.914062 155.539062 87.914062 165.617188 L 87.914062 220.347656 C 87.914062 221.96875 88.195312 223.519531 88.589844 225.015625 L 77.890625 235.714844 L 54.300781 235.714844 C 49.265625 235.714844 45.179688 239.804688 45.179688 244.839844 L 45.179688 272.203125 C 45.179688 277.238281 49.265625 281.324219 54.300781 281.324219 L 81.664062 281.324219 C 86.699219 281.324219 90.785156 277.238281 90.785156 272.203125 L 90.785156 248.625 L 101.496094 237.914062 C 102.992188 238.316406 104.535156 238.589844 106.15625 238.589844 L 160.886719 238.589844 C 162.511719 238.589844 164.050781 238.308594 165.546875 237.914062 L 179.195312 251.5625 C 179.183594 251.796875 179.121094 252.027344 179.121094 252.273438 L 179.121094 293.320312 C 179.121094 300.871094 185.25 307 192.804688 307 L 233.851562 307 C 241.402344 307 247.53125 300.871094 247.53125 293.320312 L 247.53125 252.273438 C 247.53125 252.027344 247.476562 251.796875 247.460938 251.5625 L 274.46875 224.550781 C 274.707031 224.5625 274.933594 224.625 275.179688 224.625 L 316.226562 224.625 C 323.78125 224.625 329.910156 218.496094 329.910156 210.941406 L 329.910156 169.894531 C 329.910156 162.34375 323.78125 156.214844 316.226562 156.214844 L 275.179688 156.214844 C 274.933594 156.214844 274.707031 156.269531 274.46875 156.285156 L 239.132812 120.957031 L 239.132812 97.371094 C 239.132812 92.335938 235.046875 88.25 230.011719 88.25 L 202.644531 88.25 C 197.609375 88.25 193.523438 92.335938 193.523438 97.371094 Z"/></g>
                                <g clip-path="url(#c2)"><path fill="#ed3030" d="M 193.53125 77.257812 L 193.53125 104.621094 C 193.53125 109.65625 197.617188 113.746094 202.652344 113.746094 L 226.242188 113.746094 L 261.578125 149.070312 C 261.570312 149.308594 261.507812 149.546875 261.507812 149.785156 L 261.507812 190.832031 C 261.507812 191.078125 261.5625 191.304688 261.578125 191.542969 L 234.570312 218.550781 C 234.332031 218.542969 234.105469 218.476562 233.859375 218.476562 L 192.8125 218.476562 C 192.566406 218.476562 192.335938 218.53125 192.101562 218.550781 L 178.453125 204.90625 C 178.855469 203.410156 179.128906 201.859375 179.128906 200.234375 L 179.128906 145.503906 C 179.128906 135.425781 170.964844 127.261719 160.886719 127.261719 L 106.15625 127.261719 C 96.078125 127.261719 87.914062 135.425781 87.914062 145.503906 L 87.914062 200.234375 C 87.914062 201.859375 88.195312 203.410156 88.589844 204.90625 L 77.890625 215.605469 L 54.300781 215.605469 C 49.265625 215.605469 45.179688 219.691406 45.179688 224.726562 L 45.179688 252.089844 C 45.179688 257.125 49.265625 261.210938 54.300781 261.210938 L 81.664062 261.210938 C 86.699219 261.210938 90.785156 257.125 90.785156 252.089844 L 90.785156 228.511719 L 101.496094 217.804688 C 102.992188 218.203125 104.535156 218.476562 106.15625 218.476562 L 160.886719 218.476562 C 162.511719 218.476562 164.050781 218.195312 165.546875 217.804688 L 179.195312 231.449219 C 179.183594 231.6875 179.121094 231.914062 179.121094 232.160156 L 179.121094 273.207031 C 179.121094 280.761719 185.25 286.890625 192.804688 286.890625 L 233.851562 286.890625 C 241.402344 286.890625 247.53125 280.761719 247.53125 273.207031 L 247.53125 232.160156 C 247.53125 231.914062 247.476562 231.6875 247.460938 231.449219 L 274.46875 204.441406 C 274.707031 204.449219 274.933594 204.511719 275.179688 204.511719 L 316.226562 204.511719 C 323.78125 204.511719 329.910156 198.382812 329.910156 190.832031 L 329.910156 149.785156 C 329.910156 142.230469 323.78125 136.101562 316.226562 136.101562 L 275.179688 136.101562 C 274.933594 136.101562 274.707031 136.15625 274.46875 136.175781 L 239.132812 100.847656 L 239.132812 77.257812 C 239.132812 72.222656 235.046875 68.136719 230.011719 68.136719 L 202.644531 68.136719 C 197.609375 68.136719 193.523438 72.222656 193.523438 77.257812 Z"/></g>
                            </svg>
                        </div>
                        <div class="success-ring">
                            <svg class="checkmark" viewBox="0 0 24 24">
                                <polyline class="checkmark-path" points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round"/>
                            </svg>
                        </div>
                        <h1>Authentication Successful</h1>
                        <p>You can now close this window and return to Red AI.</p>
                        <div class="status" id="status">
                            <span class="status-dot"></span>
                            Redirecting...
                        </div>
                        <a href="${redirectUrl}" class="button">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                                <polyline points="15 3 21 3 21 9"/>
                                <line x1="10" y1="14" x2="21" y2="3"/>
                            </svg>
                            Open Red AI
                        </a>
                    </div>
                    <script>
                        setTimeout(function() {
                            window.location.href = "${redirectUrl}";
                            document.getElementById('status').innerHTML = '<span class="status-dot" style="background:#f59e0b;"></span>Click the button if the app did not open';
                        }, 1500);
                    </script>
                </body>
                </html>
            `);
        }

        // Check for returnTo in session
        const returnTo = req.session.returnTo;
        delete req.session.returnTo;

        if (returnTo) {
            return res.redirect(returnTo);
        }

        // Free users go to download page if they haven't downloaded yet
        const isFreeUser = (req.user.plan === 'Free' || (req.user.plan === 'Starter' && !req.user.stripeSubscriptionId));

        // Check if user needs to complete payment setup (paid plans only)
        if (!isFreeUser && (!req.user.paymentCompleted || req.user.subscriptionStatus !== 'active')) {
            res.redirect('/payment');
        } else if (!req.user.hasDownloadedApp) {
            // New users or users who haven't downloaded should see download page
            res.redirect('/download');
        } else {
            // Existing users who have already downloaded go to dashboard
            res.redirect('/dashboard');
        }
    }
);

// Desktop App Authentication Endpoints

// 1. Initiate Desktop Auth
// Called by desktop app to start the flow
// 1. Initiate Desktop Auth
// Called by desktop app to start the flow
app.post('/api/auth/desktop/initiate', async (req, res) => {
    try {
        const { device_id, app_version, platform, callback_url } = req.body;

        if (!device_id) {
            return res.status(400).json({ success: false, error: 'Device ID is required' });
        }

        // Generate a secure random token
        const token = crypto.randomBytes(32).toString('hex');

        // Create session record with optional callback URL
        const session = new DesktopAuthSession({
            token,
            deviceId: device_id,
            status: 'pending',
            callbackUrl: callback_url || null // Store HTTP callback URL if provided
        });

        await session.save();

        // Return the auth URL that the desktop app should open
        // Use the configured app base URL or construct it from request
        const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
        const authUrl = `${baseUrl}/auth/desktop/authorize?token=${token}`;

        res.json({
            success: true,
            session_token: token,
            auth_url: authUrl
        });

    } catch (error) {
        console.error('Desktop auth initiate error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// 2. Authorize Desktop Session
// User visits this URL in browser to approve login
app.get('/auth/desktop/authorize', requireAuth, async (req, res) => {
    try {
        const { token } = req.query;

        if (!token) {
            return res.status(400).send('Invalid request: Missing token');
        }

        // Find the session
        const session = await DesktopAuthSession.findOne({ token, status: 'pending' });

        if (!session) {
            return res.status(404).send('<h1>Invalid or expired session</h1><p>Please try logging in from the desktop app again.</p>');
        }

        // Check expiration
        if (new Date() > session.expiresAt) {
            session.status = 'expired';
            await session.save();
            return res.status(400).send('<h1>Session expired</h1><p>Please try logging in from the desktop app again.</p>');
        }

        // Get current user ID
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }

        // Update session with user
        session.userId = userId;
        session.status = 'authenticated';
        await session.save();

        // Determine redirect URL - prefer HTTP callback over protocol
        let redirectUrl;
        if (session.callbackUrl) {
            // Use HTTP callback URL if provided by desktop app
            redirectUrl = `${session.callbackUrl}?token=${token}`;
            console.log(`REDIRECTING TO HTTP CALLBACK: ${redirectUrl}`);
        } else {
            // Fall back to protocol handler
            redirectUrl = `redglass://auth?token=${token}`;
            console.log(`REDIRECTING TO PROTOCOL: ${redirectUrl}`);
        }

        // Show a success page that also triggers the redirect
        res.send(`
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Authentication Successful - Red AI</title>
                <link rel="preconnect" href="https://fonts.googleapis.com">
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
                <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap" rel="stylesheet">
                <style>
                    * { margin: 0; padding: 0; box-sizing: border-box; }
                    body {
                        font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
                        min-height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        background: linear-gradient(135deg, #fafafa 0%, #f0f0f0 100%);
                        position: relative;
                        overflow: hidden;
                    }
                    .bg-pattern {
                        position: absolute;
                        top: 0; left: 0; right: 0; bottom: 0;
                        background-image: radial-gradient(circle at 25% 25%, rgba(220, 38, 38, 0.03) 0%, transparent 50%),
                                          radial-gradient(circle at 75% 75%, rgba(220, 38, 38, 0.05) 0%, transparent 50%);
                        pointer-events: none;
                    }
                    .card {
                        background: white;
                        padding: 48px 40px;
                        border-radius: 20px;
                        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
                        text-align: center;
                        max-width: 400px;
                        width: 90%;
                        position: relative;
                        z-index: 1;
                        animation: slideUp 0.5s ease-out;
                    }
                    @keyframes slideUp {
                        from { opacity: 0; transform: translateY(20px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    .logo {
                        width: 56px;
                        height: 56px;
                        margin: 0 auto 24px;
                        animation: fadeIn 0.6s ease-out 0.2s both;
                    }
                    @keyframes fadeIn {
                        from { opacity: 0; transform: scale(0.8); }
                        to { opacity: 1; transform: scale(1); }
                    }
                    .success-ring {
                        width: 72px;
                        height: 72px;
                        border-radius: 50%;
                        background: linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin: 0 auto 24px;
                        animation: ringPop 0.5s ease-out 0.3s both;
                    }
                    @keyframes ringPop {
                        0% { transform: scale(0); }
                        60% { transform: scale(1.1); }
                        100% { transform: scale(1); }
                    }
                    .checkmark {
                        width: 32px;
                        height: 32px;
                        stroke: #dc2626;
                        stroke-width: 2.5;
                        fill: none;
                    }
                    .checkmark-path {
                        stroke-dasharray: 30;
                        stroke-dashoffset: 30;
                        animation: draw 0.4s ease-out 0.6s forwards;
                    }
                    @keyframes draw {
                        to { stroke-dashoffset: 0; }
                    }
                    h1 {
                        font-size: 22px;
                        font-weight: 600;
                        color: #171717;
                        margin-bottom: 8px;
                        letter-spacing: -0.01em;
                        animation: fadeIn 0.5s ease-out 0.4s both;
                    }
                    p {
                        font-size: 14px;
                        color: #737373;
                        line-height: 1.6;
                        animation: fadeIn 0.5s ease-out 0.5s both;
                    }
                    .status {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        margin-top: 20px;
                        font-size: 13px;
                        color: #a3a3a3;
                        animation: fadeIn 0.5s ease-out 0.6s both;
                    }
                    .status-dot {
                        width: 6px;
                        height: 6px;
                        background: #22c55e;
                        border-radius: 50%;
                        animation: pulse 1.5s ease-in-out infinite;
                    }
                    @keyframes pulse {
                        0%, 100% { opacity: 1; transform: scale(1); }
                        50% { opacity: 0.5; transform: scale(0.8); }
                    }
                    .button {
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        gap: 8px;
                        background: #dc2626;
                        color: white;
                        padding: 14px 28px;
                        border-radius: 12px;
                        text-decoration: none;
                        font-weight: 500;
                        font-size: 15px;
                        margin-top: 24px;
                        transition: all 0.2s ease;
                        animation: fadeIn 0.5s ease-out 0.7s both;
                    }
                    .button:hover {
                        background: #b91c1c;
                        transform: translateY(-1px);
                    }
                    .button svg {
                        width: 18px;
                        height: 18px;
                    }
                </style>
            </head>
            <body>
                <div class="bg-pattern"></div>
                <div class="card">
                    <div class="logo">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 375 375" preserveAspectRatio="xMidYMid meet">
                            <defs>
                                <clipPath id="c1"><path d="M 45 88 L 330 88 L 330 307 L 45 307 Z"/></clipPath>
                                <clipPath id="c2"><path d="M 45 68 L 330 68 L 330 287 L 45 287 Z"/></clipPath>
                            </defs>
                            <g clip-path="url(#c1)"><path fill="#921e1e" d="M 193.53125 97.371094 L 193.53125 124.734375 C 193.53125 129.769531 197.617188 133.855469 202.652344 133.855469 L 226.242188 133.855469 L 261.578125 169.183594 C 261.570312 169.421875 261.507812 169.660156 261.507812 169.894531 L 261.507812 210.941406 C 261.507812 211.1875 261.5625 211.417969 261.578125 211.652344 L 234.570312 238.664062 C 234.332031 238.652344 234.105469 238.589844 233.859375 238.589844 L 192.8125 238.589844 C 192.566406 238.589844 192.335938 238.644531 192.101562 238.664062 L 178.453125 225.015625 C 178.855469 223.519531 179.128906 221.96875 179.128906 220.347656 L 179.128906 165.617188 C 179.128906 155.539062 170.964844 147.375 160.886719 147.375 L 106.15625 147.375 C 96.078125 147.375 87.914062 155.539062 87.914062 165.617188 L 87.914062 220.347656 C 87.914062 221.96875 88.195312 223.519531 88.589844 225.015625 L 77.890625 235.714844 L 54.300781 235.714844 C 49.265625 235.714844 45.179688 239.804688 45.179688 244.839844 L 45.179688 272.203125 C 45.179688 277.238281 49.265625 281.324219 54.300781 281.324219 L 81.664062 281.324219 C 86.699219 281.324219 90.785156 277.238281 90.785156 272.203125 L 90.785156 248.625 L 101.496094 237.914062 C 102.992188 238.316406 104.535156 238.589844 106.15625 238.589844 L 160.886719 238.589844 C 162.511719 238.589844 164.050781 238.308594 165.546875 237.914062 L 179.195312 251.5625 C 179.183594 251.796875 179.121094 252.027344 179.121094 252.273438 L 179.121094 293.320312 C 179.121094 300.871094 185.25 307 192.804688 307 L 233.851562 307 C 241.402344 307 247.53125 300.871094 247.53125 293.320312 L 247.53125 252.273438 C 247.53125 252.027344 247.476562 251.796875 247.460938 251.5625 L 274.46875 224.550781 C 274.707031 224.5625 274.933594 224.625 275.179688 224.625 L 316.226562 224.625 C 323.78125 224.625 329.910156 218.496094 329.910156 210.941406 L 329.910156 169.894531 C 329.910156 162.34375 323.78125 156.214844 316.226562 156.214844 L 275.179688 156.214844 C 274.933594 156.214844 274.707031 156.269531 274.46875 156.285156 L 239.132812 120.957031 L 239.132812 97.371094 C 239.132812 92.335938 235.046875 88.25 230.011719 88.25 L 202.644531 88.25 C 197.609375 88.25 193.523438 92.335938 193.523438 97.371094 Z"/></g>
                            <g clip-path="url(#c2)"><path fill="#ed3030" d="M 193.53125 77.257812 L 193.53125 104.621094 C 193.53125 109.65625 197.617188 113.746094 202.652344 113.746094 L 226.242188 113.746094 L 261.578125 149.070312 C 261.570312 149.308594 261.507812 149.546875 261.507812 149.785156 L 261.507812 190.832031 C 261.507812 191.078125 261.5625 191.304688 261.578125 191.542969 L 234.570312 218.550781 C 234.332031 218.542969 234.105469 218.476562 233.859375 218.476562 L 192.8125 218.476562 C 192.566406 218.476562 192.335938 218.53125 192.101562 218.550781 L 178.453125 204.90625 C 178.855469 203.410156 179.128906 201.859375 179.128906 200.234375 L 179.128906 145.503906 C 179.128906 135.425781 170.964844 127.261719 160.886719 127.261719 L 106.15625 127.261719 C 96.078125 127.261719 87.914062 135.425781 87.914062 145.503906 L 87.914062 200.234375 C 87.914062 201.859375 88.195312 203.410156 88.589844 204.90625 L 77.890625 215.605469 L 54.300781 215.605469 C 49.265625 215.605469 45.179688 219.691406 45.179688 224.726562 L 45.179688 252.089844 C 45.179688 257.125 49.265625 261.210938 54.300781 261.210938 L 81.664062 261.210938 C 86.699219 261.210938 90.785156 257.125 90.785156 252.089844 L 90.785156 228.511719 L 101.496094 217.804688 C 102.992188 218.203125 104.535156 218.476562 106.15625 218.476562 L 160.886719 218.476562 C 162.511719 218.476562 164.050781 218.195312 165.546875 217.804688 L 179.195312 231.449219 C 179.183594 231.6875 179.121094 231.914062 179.121094 232.160156 L 179.121094 273.207031 C 179.121094 280.761719 185.25 286.890625 192.804688 286.890625 L 233.851562 286.890625 C 241.402344 286.890625 247.53125 280.761719 247.53125 273.207031 L 247.53125 232.160156 C 247.53125 231.914062 247.476562 231.6875 247.460938 231.449219 L 274.46875 204.441406 C 274.707031 204.449219 274.933594 204.511719 275.179688 204.511719 L 316.226562 204.511719 C 323.78125 204.511719 329.910156 198.382812 329.910156 190.832031 L 329.910156 149.785156 C 329.910156 142.230469 323.78125 136.101562 316.226562 136.101562 L 275.179688 136.101562 C 274.933594 136.101562 274.707031 136.15625 274.46875 136.175781 L 239.132812 100.847656 L 239.132812 77.257812 C 239.132812 72.222656 235.046875 68.136719 230.011719 68.136719 L 202.644531 68.136719 C 197.609375 68.136719 193.523438 72.222656 193.523438 77.257812 Z"/></g>
                        </svg>
                    </div>
                    <div class="success-ring">
                        <svg class="checkmark" viewBox="0 0 24 24">
                            <polyline class="checkmark-path" points="20 6 9 17 4 12" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                    </div>
                    <h1>Authentication Successful</h1>
                    <p>You can now close this window and return to Red AI.</p>
                    <div class="status" id="status">
                        <span class="status-dot"></span>
                        Redirecting...
                    </div>
                    <a href="${redirectUrl}" class="button">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                            <polyline points="15 3 21 3 21 9"/>
                            <line x1="10" y1="14" x2="21" y2="3"/>
                        </svg>
                        Open Red AI
                    </a>
                </div>
                <script>
                    setTimeout(function() {
                        window.location.href = "${redirectUrl}";
                        document.getElementById('status').innerHTML = '<span class="status-dot" style="background:#f59e0b;"></span>Click the button if the app did not open';
                    }, 1500);
                </script>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('Desktop auth authorize error:', error);
        res.status(500).send('Internal server error');
    }
});

// 3. Exchange Token for User Data
// Called by desktop app after receiving callback
// 3. Exchange Token for User Data
// Called by desktop app after receiving callback
app.get('/api/auth/desktop/user-data', async (req, res) => {
    try {
        const token = req.headers.token;

        if (!token) {
            return res.status(401).json({ success: false, error: 'Token required' });
        }

        // Find session
        const session = await DesktopAuthSession.findOne({ token, status: 'authenticated' });

        if (!session) {
            return res.status(401).json({ success: false, error: 'Invalid or expired session' });
        }

        // Check expiration
        if (new Date() > session.expiresAt) {
            return res.status(401).json({ success: false, error: 'Session expired' });
        }

        // Get user data
        const user = await User.findById(session.userId);

        if (!user) {
            return res.status(404).json({ success: false, error: 'User not found' });
        }

        // Return user data in the format expected by the desktop app
        res.json({
            success: true,
            user: {
                _id: user._id,
                name: user.name,
                full_name: user.name,
                fullName: user.name,
                email: user.email,
                plan: user.plan,
                planPrice: user.planPrice,
                avatar: user.avatar,
                hasDownloadedApp: user.hasDownloadedApp,
                // Subscription info in expected format
                subscription: {
                    tier: user.plan || 'Free',
                    status: user.subscriptionStatus || 'active',
                    stripeSubscriptionId: user.stripeSubscriptionId,
                    stripeCustomerId: user.stripeCustomerId,
                    limits: {
                        messagesPerDay: user.plan === 'Free' ? 100 : 
                                       user.plan === 'Super Red' ? 1000 : 
                                       user.plan === 'Ultimate Red' ? -1 : 100,
                        transcriptionMinutes: user.plan === 'Free' ? 10 : 
                                             user.plan === 'Super Red' ? 60 : 
                                             user.plan === 'Ultimate Red' ? -1 : 10
                    }
                },
                // Usage info
                usage: {
                    messagesUsedToday: user.tasksUsed || 0,
                    transcriptionMinutesUsed: 0,
                    storageUsed: user.storage || 0
                }
            }
        });

    } catch (error) {
        console.error('Desktop auth user-data error:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// Health check endpoint (no rate limiting)
app.get('/health', (req, res) => {
    const healthcheck = {
        status: 'ok',
        uptime: process.uptime(),
        timestamp: Date.now(),
        environment: process.env.NODE_ENV || 'development',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    };

    try {
        res.status(200).json(healthcheck);
    } catch (error) {
        healthcheck.status = 'error';
        healthcheck.message = error.message;
        res.status(503).json(healthcheck);
    }
});

// API health check with more details
app.get('/api/health', (req, res) => {
    const health = {
        status: 'ok',
        timestamp: new Date().toISOString(),
        service: 'RED AI API',
        version: '1.0.0',
        uptime: Math.floor(process.uptime()),
        environment: process.env.NODE_ENV || 'development',
        checks: {
            database: {
                status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
                readyState: mongoose.connection.readyState,
                // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
            },
            memory: {
                usage: process.memoryUsage(),
                heapUsedMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                heapTotalMB: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
            }
        }
    };

    const httpStatus = health.checks.database.status === 'healthy' ? 200 : 503;
    res.status(httpStatus).json(health);
});

// Route for the dashboard (protected)
app.get('/dashboard', requireAuthAndPayment, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }

        const user = await User.findById(userId);

        // Redirect to download page if user hasn't downloaded the app yet
        if (user && !user.hasDownloadedApp) {
            return res.redirect('/download');
        }

        res.sendFile(path.join(__dirname, 'dashboard.html'));
    } catch (error) {
        console.error('Dashboard route error:', error);
        res.sendFile(path.join(__dirname, 'dashboard.html'));
    }
});

// Route for the settings page (protected)
app.get('/settings', requireAuthAndPayment, (req, res) => {
    res.sendFile(path.join(__dirname, 'settings.html'));
});

// Route for the download page (protected, shown after signup)
app.get('/download', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'download.html'));
});

// Route for the payment page
app.get('/payment', (req, res) => {
    res.sendFile(path.join(__dirname, 'payment.html'));
});

// Note: Blog and article routes removed as files don't exist
// If you need blog functionality, create blog.html and article.html files

// Legal pages routes
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'legal', 'privacy.html'));
});

app.get('/terms', (req, res) => {
    res.sendFile(path.join(__dirname, 'legal', 'terms.html'));
});

app.get('/cookies', (req, res) => {
    res.sendFile(path.join(__dirname, 'legal', 'cookies.html'));
});

// API endpoint to get blog posts with pagination
app.get('/api/blogs', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 6;
        const skip = (page - 1) * limit;

        // Get only published blogs, sorted by publish date (newest first)
        const blogs = await Blog.find({ published: true })
            .sort({ publishDate: -1 })
            .skip(skip)
            .limit(limit)
            .select('-content'); // Exclude full content for list view

        const totalBlogs = await Blog.countDocuments({ published: true });
        const totalPages = Math.ceil(totalBlogs / limit);

        res.json({
            blogs,
            pagination: {
                currentPage: page,
                totalPages,
                totalBlogs,
                hasMore: page < totalPages
            }
        });
    } catch (error) {
        console.error('Get blogs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get featured blog post
app.get('/api/blogs/featured', async (req, res) => {
    try {
        const featuredBlog = await Blog.findOne({ published: true, featured: true })
            .sort({ publishDate: -1 });

        if (!featuredBlog) {
            return res.status(404).json({ error: 'No featured blog found' });
        }

        res.json(featuredBlog);
    } catch (error) {
        console.error('Get featured blog error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get a single blog post by slug
app.get('/api/blogs/:slug', async (req, res) => {
    try {
        const blog = await Blog.findOne({
            slug: req.params.slug,
            published: true
        });

        if (!blog) {
            return res.status(404).json({ error: 'Blog post not found' });
        }

        res.json(blog);
    } catch (error) {
        console.error('Get blog by slug error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get current user data
app.get('/api/user', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;

        // If using Passport authentication
        if (req.user && !userId) {
            userId = req.user._id;
        }

        const user = await User.findById(userId);
        if (user) {
            res.json(user.toJSON());
        } else {
            res.status(404).json({ error: 'User not found' });
        }
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API endpoint to get user dashboard data with real Stripe info
app.get('/api/user/dashboard-data', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;

        // If using Passport authentication
        if (req.user && !userId) {
            userId = req.user._id;
        }

        console.log('📊 Fetching dashboard data for user:', userId);

        if (!userId) {
            console.error('❌ No userId found in session or req.user');
            return res.status(401).json({ error: 'User ID not found. Please sign in again.' });
        }

        const user = await User.findById(userId);
        if (!user) {
            console.error('❌ User not found in database for ID:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('👤 User found:', user.email);
        console.log('📋 Current plan:', user.plan);
        console.log('💰 Plan price:', user.planPrice);
        console.log('🔗 Stripe Subscription ID:', user.stripeSubscriptionId);
        console.log('💳 Stripe Customer ID:', user.stripeCustomerId);

        // Build response with user data
        const dashboardData = {
            name: user.name,
            email: user.email,
            plan: user.plan || 'Free',
            planPrice: user.planPrice || 0,
            subscriptionStatus: user.subscriptionStatus || 'active',
            joinDate: user.joinDate,
            nextBilling: user.nextBilling,
            tasksUsed: user.tasksUsed || 0,
            tasksLimit: user.tasksLimit || 100,
            storage: user.storage || 0,
            teamMembers: user.teamMembers || 1,
            paymentMethod: null, // Will be populated from Stripe if available
            stripeCustomerId: user.stripeCustomerId,
            stripeSubscriptionId: user.stripeSubscriptionId
        };

        console.log('📦 Dashboard data prepared:', dashboardData.plan, '-', dashboardData.planPrice);

        // If user has Stripe subscription, fetch real data from Stripe
        if (user.stripeSubscriptionId) {
            try {
                const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);

                // Update subscription status
                dashboardData.subscriptionStatus = subscription.status;

                // Get next billing date from Stripe
                if (subscription.current_period_end) {
                    dashboardData.nextBilling = new Date(subscription.current_period_end * 1000);
                }

                // Get payment method details
                if (subscription.default_payment_method) {
                    const paymentMethod = await stripe.paymentMethods.retrieve(subscription.default_payment_method);
                    if (paymentMethod.card) {
                        dashboardData.paymentMethod = `${paymentMethod.card.brand.charAt(0).toUpperCase() + paymentMethod.card.brand.slice(1)} •••• ${paymentMethod.card.last4}`;
                    }
                } else if (user.stripeCustomerId) {
                    // Try to get default payment method from customer
                    const customer = await stripe.customers.retrieve(user.stripeCustomerId);
                    if (customer.invoice_settings?.default_payment_method) {
                        const paymentMethod = await stripe.paymentMethods.retrieve(customer.invoice_settings.default_payment_method);
                        if (paymentMethod.card) {
                            dashboardData.paymentMethod = `${paymentMethod.card.brand.charAt(0).toUpperCase() + paymentMethod.card.brand.slice(1)} •••• ${paymentMethod.card.last4}`;
                        }
                    }
                }

                // Get plan details from subscription
                if (subscription.items?.data?.[0]?.price) {
                    const price = subscription.items.data[0].price;
                    dashboardData.planPrice = price.unit_amount / 100; // Convert from cents
                }
            } catch (stripeError) {
                console.error('Error fetching Stripe data:', stripeError);
                // Continue with database data if Stripe fetch fails
            }
        }

        // For free users, set appropriate values
        if (dashboardData.plan === 'Free' && !dashboardData.stripeSubscriptionId) {
            dashboardData.paymentMethod = 'No payment method';
            dashboardData.subscriptionStatus = 'active';
        }

        console.log('✅ Dashboard data compiled successfully');
        res.json(dashboardData);
    } catch (error) {
        console.error('❌ Get dashboard data error:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            error: 'Internal server error',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Normalize incoming plan/price identifiers from frontend to real Stripe price IDs
function normalizePriceId(inputPriceId) {
    const aliasToStripePrice = {
        // Aliases used by frontend selections
        'price_super_red': 'price_1SFgNPHtnW97iFDve68i2L8x', // Super Red - $25/month
        'price_ultimate_red': 'price_1SFgNPHtnW97iFDv5PuxPRX0', // Ultimate Red - $70/month
        'free': null,
    };
    if (!inputPriceId) return null;
    return aliasToStripePrice[inputPriceId] || inputPriceId;
}

// Sign in endpoint
app.post('/api/signin', authLimiter, async (req, res) => {
    const { email, password } = req.body;

    console.log('🔐 Sign in attempt for:', email);

    if (!email || !password) {
        console.log('❌ Missing credentials');
        return res.status(400).json({ error: 'Email and password are required' });
    }

    try {
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            console.log('❌ User not found:', email);
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('👤 User found:', user.email);
        console.log('📋 User plan:', user.plan);
        console.log('🔑 Auth provider:', user.authProvider);
        console.log('💳 Payment completed:', user.paymentCompleted);
        console.log('🔗 Subscription ID:', user.stripeSubscriptionId);

        // Check if user used Google OAuth
        if (user.authProvider === 'google') {
            console.log('⚠️ User registered with Google');
            return res.status(400).json({ error: 'Please sign in with Google' });
        }

        // Validate password using bcrypt
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            console.log('❌ Invalid password');
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        console.log('✅ Password valid, creating session...');

        // Create session
        req.session.userId = user._id.toString();
        req.session.userEmail = user.email;

        // Save session before proceeding
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Session save error:', err);
                    reject(err);
                } else {
                    console.log('✅ Session saved successfully');
                    console.log('📋 Session ID:', req.sessionID);
                    console.log('👤 User ID in session:', req.session.userId);
                    resolve();
                }
            });
        });

        // Give MongoDB a moment to commit the session write
        await new Promise(resolve => setTimeout(resolve, 100));

        // Auto-activate free/starter users without subscription
        const isFreeUser = (user.plan === 'Free' || (user.plan === 'Starter' && !user.stripeSubscriptionId));
        console.log('🆓 Is free user?', isFreeUser);

        if (isFreeUser && user.subscriptionStatus !== 'active') {
            console.log('🔄 Activating free user...');
            user.subscriptionStatus = 'active';
            user.paymentCompleted = true;
            await user.save();
            console.log('✅ Free user activated');
        }

        // Determine redirect based on payment status
        let redirectUrl = req.body.redirect || '/dashboard';
        if (!isFreeUser && (!user.paymentCompleted || user.subscriptionStatus !== 'active')) {
            redirectUrl = '/payment';
            console.log('💳 Redirecting to payment');
        } else {
            console.log('🎯 Redirecting to:', redirectUrl);
        }

        console.log('📤 Sending response with redirectUrl:', redirectUrl);
        console.log('🍪 Session cookie name: connect.sid, ID:', req.sessionID);

        // Check if this is a desktop app signin
        if (req.body.desktop === 'true' || req.body.desktop === true) {
            console.log('🖥️ Desktop app signin detected');
            
            // Create desktop auth session
            const token = crypto.randomBytes(32).toString('hex');
            const desktopSession = new DesktopAuthSession({
                token,
                deviceId: 'email-auth',
                userId: user._id,
                status: 'authenticated'
            });
            await desktopSession.save();
            
            const desktopRedirectUrl = `redglass://auth?token=${token}`;
            console.log('🔗 Desktop redirect URL:', desktopRedirectUrl);
            
            return res.json({
                success: true,
                message: 'Signed in successfully',
                redirectUrl: desktopRedirectUrl,
                desktop: true
            });
        }

        res.json({
            success: true,
            message: 'Signed in successfully',
            redirectUrl: redirectUrl,
            sessionId: req.sessionID // For debugging
        });
    } catch (error) {
        console.error('❌ Sign in error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Sign up endpoint
app.post('/api/signup', authLimiter, async (req, res) => {
    const { name, email, password } = req.body;

    console.log('📝 Sign up attempt for:', email);

    if (!name || !email || !password) {
        console.log('❌ Missing required fields');
        return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    try {
        // Check if user already exists
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            console.log('❌ User already exists:', email);
            return res.status(409).json({ error: 'User already exists with this email' });
        }

        console.log('✅ Creating new user...');

        // Create new user (password will be hashed by the pre-save middleware)
        // Start users on Free plan by default - they can upgrade from dashboard
        const newUser = new User({
            name,
            email: email.toLowerCase(),
            password,
            plan: 'Free',
            planPrice: 0,
            tasksUsed: 0,
            tasksLimit: 100,
            storage: 0,
            apiCalls: 0,
            teamMembers: 1,
            paymentCompleted: true, // Free plan is "complete"
            subscriptionStatus: 'active' // Free plan is active
        });

        const savedUser = await newUser.save();
        console.log('✅ User saved:', savedUser.email);
        console.log('📋 User plan:', savedUser.plan);
        console.log('💳 Payment completed:', savedUser.paymentCompleted);

        // Create session and save it
        req.session.userId = savedUser._id.toString();
        req.session.userEmail = savedUser.email;

        console.log('💾 Saving session...');

        // Save session before responding
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('❌ Session save error:', err);
                    reject(err);
                } else {
                    console.log('✅ Session saved successfully');
                    console.log('📋 Session ID:', req.sessionID);
                    console.log('👤 User ID in session:', req.session.userId);
                    resolve();
                }
            });
        });

        // Give MongoDB a moment to commit the session write
        await new Promise(resolve => setTimeout(resolve, 100));

        console.log('🎯 Redirecting to download page');
        console.log('📤 Sending response with redirectUrl: /download');

        // Check if this is a desktop app signup
        if (req.body.desktop === 'true' || req.body.desktop === true) {
            console.log('🖥️ Desktop app signup detected');
            
            // Create desktop auth session
            const token = crypto.randomBytes(32).toString('hex');
            const desktopSession = new DesktopAuthSession({
                token,
                deviceId: 'email-signup',
                userId: savedUser._id,
                status: 'authenticated'
            });
            await desktopSession.save();
            
            const desktopRedirectUrl = `redglass://auth?token=${token}`;
            console.log('🔗 Desktop redirect URL:', desktopRedirectUrl);
            
            return res.json({
                success: true,
                message: 'Account created successfully',
                redirectUrl: desktopRedirectUrl,
                desktop: true
            });
        }

        res.json({
            success: true,
            message: 'Account created successfully',
            redirectUrl: '/download',
            sessionId: req.sessionID
        });
    } catch (error) {
        console.error('❌ Sign up error:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Free plan activation endpoint (no payment required)
app.post('/api/activate-free-plan', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Activate free plan
        user.plan = 'Free';
        user.planPrice = 0;
        user.tasksLimit = 100;
        user.paymentCompleted = true;
        user.subscriptionStatus = 'active';
        user.stripeSubscriptionId = null;
        user.stripeCustomerId = null;

        await user.save();

        console.log(`✅ Free plan activated for ${user.email}`);

        res.json({
            success: true,
            message: 'Free plan activated successfully',
            redirectUrl: '/dashboard'
        });
    } catch (error) {
        console.error('Free plan activation error:', error);
        res.status(500).json({ error: 'Failed to activate free plan' });
    }
});

// Create Stripe subscription endpoint
app.post('/api/create-subscription', paymentLimiter, requireAuth, async (req, res) => {
    console.log('📝 Create subscription request received');
    console.log('Request body:', req.body);

    const { paymentMethodId, priceId, customerName } = req.body;

    if (!paymentMethodId || !priceId || !customerName) {
        console.error('❌ Missing required fields');
        return res.status(400).json({ error: 'Payment method, price ID, and customer name are required' });
    }

    try {
        // Find the user
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }

        console.log('👤 User ID:', userId);

        const user = await User.findById(userId);
        if (!user) {
            console.error('❌ User not found:', userId);
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('✅ User found:', user.email);

        // Create or retrieve Stripe customer
        let customer;
        if (user.stripeCustomerId) {
            customer = await stripe.customers.retrieve(user.stripeCustomerId);
        } else {
            customer = await stripe.customers.create({
                email: user.email,
                name: customerName,
                payment_method: paymentMethodId,
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });

            // Save customer ID to user
            user.stripeCustomerId = customer.id;
            await user.save();
        }

        // Attach payment method to customer
        await stripe.paymentMethods.attach(paymentMethodId, {
            customer: customer.id,
        });

        // Normalize incoming price ID (allow aliases from frontend)
        const normalizedPriceId = normalizePriceId(priceId);
        console.log('📋 Price ID mapping:', { input: priceId, normalized: normalizedPriceId });

        if (!normalizedPriceId) {
            return res.status(400).json({ error: 'Invalid or unsupported plan selected' });
        }

        console.log('💰 Processing subscription for plan:', priceId, '→', normalizedPriceId);

        // Create subscription
        console.log('💳 Creating Stripe subscription with price:', normalizedPriceId);
        const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: normalizedPriceId }],
            default_payment_method: paymentMethodId,
            expand: ['latest_invoice.payment_intent'],
        });

        console.log('✅ Subscription created:', subscription.id);
        console.log('📊 Subscription status:', subscription.status);
        console.log('📄 Latest invoice:', subscription.latest_invoice);

        // Safely extract payment intent
        const latestInvoice = subscription.latest_invoice;
        let paymentIntent = null;

        if (latestInvoice && typeof latestInvoice === 'object') {
            paymentIntent = latestInvoice.payment_intent;
            console.log('💳 Payment intent found:', paymentIntent?.id);
            console.log('💳 Payment intent status:', paymentIntent?.status);
        } else {
            console.log('⚠️ Latest invoice is not expanded properly');
        }

        // Determine plan details based on price ID
        const planMapping = {
            'price_1SFgNOHtnW97iFDvCeVjt1u3': { name: 'Starter Plan', price: 29, tasksLimit: 1000 },
            'price_1SFgNPHtnW97iFDve68i2L8x': { name: 'Super Red', price: 25, tasksLimit: 10000 },
            'price_1SFgNPHtnW97iFDv5PuxPRX0': { name: 'Ultimate Red', price: 70, tasksLimit: 50000 }
        };

        const planDetails = planMapping[normalizedPriceId] || { name: 'Super Red', price: 25, tasksLimit: 10000 };
        console.log('📋 Plan details:', planDetails);

        // Handle 3D Secure / requires action
        if (paymentIntent && (paymentIntent.status === 'requires_action' || paymentIntent.status === 'requires_source_action')) {
            console.log('🔐 Payment requires additional action (3D Secure)');
            return res.json({
                requiresAction: true,
                clientSecret: paymentIntent.client_secret,
                subscriptionId: subscription.id
            });
        }

        // Check if payment is successful
        // Accept multiple success scenarios:
        // 1. Payment intent succeeded
        // 2. Subscription is active (payment already processed)
        // 3. Subscription is trialing (free trial started)
        const isPaymentSuccessful = (
            (paymentIntent && paymentIntent.status === 'succeeded') ||
            subscription.status === 'active' ||
            subscription.status === 'trialing'
        );

        console.log('🎯 Is payment successful?', isPaymentSuccessful);
        console.log('🎯 Payment Intent Status:', paymentIntent?.status || 'N/A');
        console.log('🎯 Subscription Status:', subscription.status);

        if (isPaymentSuccessful) {
            console.log('✅ Payment successful! Updating user...');

            // Update user plan and subscription info
            user.plan = planDetails.name;
            user.planPrice = planDetails.price;
            user.tasksLimit = planDetails.tasksLimit;
            user.stripeSubscriptionId = subscription.id;
            user.paymentCompleted = true;
            user.subscriptionStatus = subscription.status;
            user.nextBilling = new Date(subscription.current_period_end * 1000);

            console.log('💾 Saving user with plan:', user.plan);
            await user.save();

            console.log('🎉 User updated successfully!');
            console.log('📧 User email:', user.email);
            console.log('📋 User plan:', user.plan);
            console.log('💰 Plan price:', user.planPrice);

            return res.json({
                success: true,
                message: 'Subscription created successfully',
                redirectUrl: '/dashboard'
            });
        }

        // If we get here, payment was not successful
        console.error('❌ Payment not successful');
        console.error('Payment Intent Status:', paymentIntent?.status || 'N/A');
        console.error('Subscription Status:', subscription.status);

        return res.status(400).json({
            error: 'Payment processing incomplete. Please contact support.',
            details: {
                subscriptionId: subscription.id,
                subscriptionStatus: subscription.status,
                paymentStatus: paymentIntent?.status || 'unknown'
            }
        });

    } catch (error) {
        console.error('❌ Stripe subscription error:', error);
        console.error('Error type:', error.type);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);

        // Handle specific Stripe errors
        if (error.type === 'StripeCardError') {
            return res.status(400).json({ error: error.message });
        }

        if (error.type === 'StripeInvalidRequestError') {
            console.error('❌ Invalid Stripe request:', error.message);
            return res.status(400).json({
                error: 'Invalid payment request. Please check your payment details.',
                details: error.message
            });
        }

        // Return more detailed error in development
        return res.status(500).json({
            error: 'Payment processing failed. Please try again.',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Stripe Billing Portal - allow users to manage payment methods, invoices, cancel, etc.
app.post('/api/billing-portal', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }
        const user = await User.findById(userId);

        console.log('📊 Billing Portal Request:', {
            userId: userId,
            hasUser: !!user,
            stripeCustomerId: user?.stripeCustomerId,
            plan: user?.plan
        });

        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        if (!user.stripeCustomerId) {
            return res.status(400).json({
                error: 'Billing portal is not available for Free plan users. Upgrade to a paid plan to access billing features.',
                isFreeUser: true
            });
        }

        const returnUrlBase = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;
        console.log('🔗 Creating billing portal session for customer:', user.stripeCustomerId);

        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripeCustomerId,
            return_url: `${returnUrlBase}/dashboard`,
        });

        console.log('✅ Billing portal session created:', session.url);
        return res.json({ url: session.url });
    } catch (error) {
        console.error('❌ Billing portal error:', error);
        console.error('Error details:', {
            message: error.message,
            type: error.type,
            code: error.code,
            statusCode: error.statusCode
        });

        // Check if it's a Stripe-specific error
        if (error.type === 'StripeInvalidRequestError') {
            return res.status(400).json({
                error: 'Invalid billing request. The customer ID may be invalid or the billing portal may not be activated in your Stripe account.'
            });
        }

        return res.status(500).json({
            error: 'Failed to create billing portal session',
            details: error.message
        });
    }
});

// Update subscription plan (upgrade/downgrade) with proration
app.post('/api/subscription/update', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }
        const { priceId } = req.body;
        const normalizedPriceId = normalizePriceId(priceId);
        if (!normalizedPriceId) {
            return res.status(400).json({ error: 'Invalid plan selected' });
        }

        const user = await User.findById(userId);
        if (!user || !user.stripeSubscriptionId) {
            return res.status(400).json({ error: 'No active subscription found' });
        }

        const subscription = await stripe.subscriptions.retrieve(user.stripeSubscriptionId);
        const currentItemId = subscription.items.data[0].id;
        const updated = await stripe.subscriptions.update(user.stripeSubscriptionId, {
            items: [{ id: currentItemId, price: normalizedPriceId }],
            proration_behavior: 'create_prorations',
        });

        // Update local plan metadata based on mapping
        const planMapping = {
            'price_1SFgNOHtnW97iFDvCeVjt1u3': { name: 'Starter Plan', price: 29, tasksLimit: 1000 },
            'price_1SFgNPHtnW97iFDve68i2L8x': { name: 'Super Red', price: 25, tasksLimit: 10000 },
            'price_1SFgNPHtnW97iFDv5PuxPRX0': { name: 'Ultimate Red', price: 70, tasksLimit: 50000 }
        };
        const planDetails = planMapping[normalizedPriceId];
        if (planDetails) {
            user.plan = planDetails.name;
            user.planPrice = planDetails.price;
            user.tasksLimit = planDetails.tasksLimit;
            user.nextBilling = new Date(updated.current_period_end * 1000);
            await user.save();
        }

        return res.json({ success: true, message: 'Subscription updated', subscription: { id: updated.id } });
    } catch (error) {
        console.error('Subscription update error:', error);
        return res.status(500).json({ error: 'Failed to update subscription' });
    }
});

// Plan changes now handled through payment page - removed change-plan endpoint

// Cancel subscription either immediately or at period end
app.post('/api/subscription/cancel', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }
        const { atPeriodEnd } = req.body || {};

        const user = await User.findById(userId);
        if (!user || !user.stripeSubscriptionId) {
            return res.status(400).json({ error: 'No active subscription found' });
        }

        let result;
        if (atPeriodEnd) {
            result = await stripe.subscriptions.update(user.stripeSubscriptionId, {
                cancel_at_period_end: true,
            });
            user.subscriptionStatus = 'cancelled';
            // Keep paymentCompleted true until the end of the period
        } else {
            result = await stripe.subscriptions.cancel(user.stripeSubscriptionId);
            user.subscriptionStatus = 'cancelled';
            user.paymentCompleted = false;
        }
        await user.save();

        return res.json({ success: true, message: 'Subscription cancel request processed', subscription: { id: result.id } });
    } catch (error) {
        console.error('Subscription cancel error:', error);
        return res.status(500).json({ error: 'Failed to cancel subscription' });
    }
});

// [Removed insecure /api/payment endpoint that accepted raw card data]
// [Stripe webhook handler moved to top of file before body parsers]

// Delete user account endpoint
app.delete('/api/user/delete-account', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }

        console.log('🗑️  Account deletion request for user:', userId);

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        console.log('👤 Deleting account for:', user.email);

        // Cancel Stripe subscription if exists
        if (user.stripeSubscriptionId) {
            try {
                console.log('💳 Cancelling Stripe subscription:', user.stripeSubscriptionId);
                await stripe.subscriptions.cancel(user.stripeSubscriptionId);
                console.log('✅ Stripe subscription cancelled');
            } catch (stripeError) {
                console.error('❌ Error cancelling subscription:', stripeError.message);
                // Continue with account deletion even if Stripe cancellation fails
            }
        }

        // Delete Stripe customer if exists
        if (user.stripeCustomerId) {
            try {
                console.log('💳 Deleting Stripe customer:', user.stripeCustomerId);
                await stripe.customers.del(user.stripeCustomerId);
                console.log('✅ Stripe customer deleted');
            } catch (stripeError) {
                console.error('❌ Error deleting Stripe customer:', stripeError.message);
                // Continue with account deletion even if customer deletion fails
            }
        }

        // Delete user from database
        await User.findByIdAndDelete(userId);
        console.log('✅ User deleted from database');

        // Destroy session
        req.session.destroy((err) => {
            if (err) {
                console.error('Error destroying session:', err);
            }
        });

        console.log('🎉 Account deletion completed for:', user.email);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });
    } catch (error) {
        console.error('❌ Account deletion error:', error);
        res.status(500).json({
            error: 'Failed to delete account',
            message: error.message
        });
    }
});

// Mark user download endpoint
app.post('/api/user/mark-download', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }

        const { platform } = req.body;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.hasDownloadedApp = true;
        user.downloadPlatform = platform;
        user.downloadDate = new Date();
        await user.save();

        console.log(`✅ User ${user.email} downloaded app for ${platform}`);

        res.json({
            success: true,
            message: 'Download marked successfully'
        });
    } catch (error) {
        console.error('Mark download error:', error);
        res.status(500).json({
            error: 'Failed to mark download',
            message: error.message
        });
    }
});

// Get user invoices endpoint
app.get('/api/user/invoices', requireAuth, async (req, res) => {
    try {
        let userId = req.session.userId;
        if (req.user && !userId) {
            userId = req.user._id;
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // If user doesn't have a Stripe customer, return empty array
        if (!user.stripeCustomerId) {
            return res.json({ invoices: [] });
        }

        // Fetch invoices from Stripe
        const invoices = await stripe.invoices.list({
            customer: user.stripeCustomerId,
            limit: 10 // Last 10 invoices
        });

        // Format invoices for frontend
        const formattedInvoices = invoices.data.map(invoice => ({
            id: invoice.id,
            date: new Date(invoice.created * 1000),
            amount: invoice.amount_paid / 100,
            status: invoice.status,
            currency: invoice.currency.toUpperCase(),
            invoicePdf: invoice.invoice_pdf,
            hostedInvoiceUrl: invoice.hosted_invoice_url,
            number: invoice.number
        }));

        res.json({ invoices: formattedInvoices });
    } catch (error) {
        console.error('Get invoices error:', error);
        res.status(500).json({
            error: 'Failed to fetch invoices',
            message: error.message
        });
    }
});

// Helper functions for webhook handling
async function handleSubscriptionUpdate(subscription) {
    try {
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (user) {
            user.subscriptionStatus = subscription.status;
            user.nextBilling = new Date(subscription.current_period_end * 1000);
            await user.save();
            console.log(`Updated subscription for user ${user.email}`);
        }
    } catch (error) {
        console.error('Error updating subscription:', error);
    }
}

async function handleSubscriptionCancellation(subscription) {
    try {
        const user = await User.findOne({ stripeSubscriptionId: subscription.id });
        if (user) {
            user.subscriptionStatus = 'cancelled';
            user.paymentCompleted = false;
            await user.save();
            console.log(`Cancelled subscription for user ${user.email}`);
        }
    } catch (error) {
        console.error('Error cancelling subscription:', error);
    }
}

async function handleSuccessfulPayment(invoice) {
    try {
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
            user.subscriptionStatus = 'active';
            user.paymentCompleted = true;
            user.nextBilling = new Date(invoice.period_end * 1000);
            await user.save();
            console.log(`Payment succeeded for user ${user.email}`);
        }
    } catch (error) {
        console.error('Error handling successful payment:', error);
    }
}

async function handleFailedPayment(invoice) {
    try {
        const user = await User.findOne({ stripeCustomerId: invoice.customer });
        if (user) {
            user.subscriptionStatus = 'past_due';
            await user.save();
            console.log(`Payment failed for user ${user.email}`);
        }
    } catch (error) {
        console.error('Error handling failed payment:', error);
    }
}

// Logout endpoint
app.post('/api/logout', async (req, res) => {
    console.log('🚪 Logout request received');

    try {
        // Clear the session cookie first
        res.clearCookie('connect.sid', { path: '/' });
        console.log('✅ Session cookie cleared');

        // Clear session data without calling passport logout
        // (passport logout causes issues when session is destroyed)
        if (req.session) {
            // Clear user data from session
            delete req.session.userId;
            delete req.session.userEmail;
            delete req.session.passport;
            
            // Destroy the session
            await new Promise((resolve) => {
                req.session.destroy((err) => {
                    if (err) {
                        console.error('⚠️ Session destroy error:', err);
                    } else {
                        console.log('✅ Session destroyed');
                    }
                    resolve();
                });
            });
        }

        console.log('✅ Logout complete');
        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('❌ Unexpected logout error:', error);
        
        // Still return success - the important thing is clearing the cookie
        if (!res.headersSent) {
            res.status(200).json({ success: true, message: 'Logged out' });
        }
    }
});

// Handle 404s
app.use((req, res) => {
    res.status(404).send('<h1>404 - Page Not Found</h1>');
});

// Export the Express app for Vercel serverless
module.exports = app;

// Only start the server if running locally (not on Vercel)
if (process.env.NODE_ENV !== 'production' || process.env.VERCEL !== '1') {
    app.listen(PORT, () => {
        console.log(`🚀 Supermi Landing Page Server running on:`);
        console.log(`   Local:    http://localhost:${PORT}`);
        console.log(`   Network:  http://127.0.0.1:${PORT}`);
        console.log('');
        console.log('📁 Serving files from:', __dirname);
        console.log('🌐 Main page: Red.html');
        console.log('');
        console.log('Press Ctrl+C to stop the server');
    });
} 