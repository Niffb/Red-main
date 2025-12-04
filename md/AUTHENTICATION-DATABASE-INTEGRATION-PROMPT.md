# Authentication & Database Integration Framework
## Information Gathering Prompt for Landing Page Integration

This document outlines the current authentication and database framework implemented in the Red AI App, and provides questions to ensure seamless integration with the landing page.

---

## Current Implementation Overview

### 1. Database Architecture

**Current Setup:**
- **Database Type:** MongoDB Atlas
- **Connection URI:** `mongodb+srv://YousefAly:Kubo0219@red-ai-app.ihzx0.mongodb.net/red-ai-app?retryWrites=true&w=majority`
- **Database Name:** `red-ai-app`
- **Primary Collection:** `users`

**User Schema Structure:**
```javascript
{
  _id: ObjectId,                    // MongoDB auto-generated ID
  email: String (unique, required), // User's email address
  password: String (hashed),        // bcrypt hashed password (10 rounds)
  fullName: String,                 // User's full name
  createdAt: Date,                  // Account creation timestamp
  lastLogin: Date,                  // Last login timestamp
  subscription: {
    tier: String,                   // 'free' | 'super-red' | 'ultra-red'
    status: String,                 // 'active' | 'inactive' | 'expired'
    expiresAt: Date                 // Subscription expiration (null for lifetime)
  },
  preferences: Object,              // User preferences (empty object by default)
  usage: {
    messagesUsedToday: Number,      // Daily message count
    lastResetDate: Date,            // Last daily reset timestamp
    transcriptionMinutesUsed: Number, // Total transcription minutes used
    activeWorkflows: Number         // Number of active workflows
  }
}
```

### 2. Authentication Flow

**Current Implementation:**

**In-App Authentication:**
- **Location:** Subscription Settings Tab (`public/subscription-settings.html`)
- **Endpoints:**
  - `mongodbAuthenticate(email, password)` - Login
  - `mongodbRegister(userData)` - Registration
  - `mongodbLogout()` - Logout

**Session Management:**
- Managed by `electron/subscription-manager.js`
- Stored in `electron-store` settings (`electron/settings-manager.js`)
- Session persists across app restarts

**Password Security:**
- Hashed using bcrypt with 10 salt rounds
- Passwords never stored in plain text

### 3. Subscription Tiers & Features

**Tier Definitions:**

#### Free Tier
- **Messages:** 20 per day
- **Workflows:** 2 simple workflows (max 1 step each)
- **MCP Connections:** 0
- **Transcription:** 0 hours
- **Support:** Community support
- **Features:**
  - Basic chat functionality
  - Up to 2 simple workflows
  - Community support

#### Super-Red Tier
- **Messages:** 300 per day
- **Workflows:** Unlimited (max 3 steps each)
- **MCP Connections:** 3
- **Transcription:** 3 hours per month
- **Support:** Priority support
- **Features:**
  - 300 messages per day
  - Unlimited multi-step workflows (up to 3 steps)
  - 3 MCP connections
  - 3 hours transcription per month
  - Priority support

#### Ultra-Red Tier
- **Messages:** Unlimited
- **Workflows:** Unlimited (unlimited steps)
- **MCP Connections:** Unlimited
- **Transcription:** Unlimited hours
- **Support:** Dedicated support
- **Features:**
  - Unlimited messages
  - Unlimited workflows & integrations
  - Full transcription access
  - Behavioral analysis
  - Dedicated support

### 4. Feature Access Control

**Implementation Files:**
- `electron/subscription-manager.js` - Feature gating and usage tracking
- `electron/mongodb-service.js` - Database operations and tier management

**Access Control Methods:**
```javascript
// Check if user can use a feature
canUseFeature(featureName) // Returns { allowed: boolean, reason?: string }

// Specific checks
canSendMessage()           // Check message limit
canCreateWorkflow(steps)   // Check workflow limits
canAddMCPConnection(count) // Check MCP limits
canUseTranscription()      // Check transcription limits

// Usage tracking
incrementMessageUsage()
updateTranscriptionUsage(minutes)
updateWorkflowCount(count)
```

### 5. Current API Endpoints (Electron IPC)

**Authentication:**
- `mongodb-authenticate` - Login with email/password
- `mongodb-register` - Create new account
- `mongodb-logout` - Logout current user

**User Management:**
- `mongodb-get-user-by-email` - Fetch user by email
- `mongodb-update-user` - Update user information
- `subscription-get` - Get current user subscription
- `subscription-get-usage` - Get usage statistics
- `refresh-user-data` - Refresh user from database

**Feature Checks:**
- `check-feature-access` - Check if feature is available
- `check-message-limit` - Check message quota
- `check-workflow-limit` - Check workflow creation
- `check-mcp-limit` - Check MCP connection limit

**Usage Tracking:**
- `increment-message-usage` - Increment daily message count
- `update-transcription-usage` - Track transcription time
- `update-workflow-count` - Update workflow count

---

## Questions for Landing Page Integration

### A. Landing Page Authentication Flow

**1. Authentication Method:**
   - Does the landing page use the same MongoDB database and collection?
   - If different database, what are the connection details?
   - Does it use the same user schema or a different one?

**2. Login/Signup Implementation:**
   - Where does login/signup happen? (Before app launch or redirects to app?)
   - Does the landing page handle registration directly or pass credentials to the app?
   - What happens after successful login on landing page? (Open app with session token? Pass credentials?)

**3. Session Handoff:**
   - How does the landing page communicate authentication status to the Electron app?
   - Is there a token-based system? Session token? JWT?
   - Or does the landing page pass email/password to the app for re-authentication?

### B. User Data Structure Compatibility

**4. User Schema:**
   - Does the landing page create users with the exact same schema as above?
   - Are there additional fields the landing page adds that the app should know about?
   - Does the landing page pre-set subscription tiers during registration?

**5. Initial Subscription Assignment:**
   - What tier are new users assigned on the landing page? (Default: 'free'?)
   - Does landing page handle payment/upgrade during signup?
   - Should the app expect users to already have non-free tiers from landing page?

### C. Database Access & Synchronization

**6. Database Connection:**
   - Should the landing page and app share the SAME MongoDB connection string?
   - Or does landing page use a backend API that the app should also use?
   - Who is the "source of truth" for user data - landing page backend or app's MongoDB service?

**7. User Updates:**
   - If user updates profile on landing page, how does app know?
   - Should app always fetch fresh data on startup?
   - Is there a webhook/notification system for data changes?

### D. Password & Security

**8. Password Hashing:**
   - Does landing page use bcrypt with same salt rounds (10)?
   - Or different hashing algorithm?
   - Should app be able to verify passwords hashed by landing page?

**9. Session Security:**
   - Does landing page issue session tokens?
   - Should app validate these tokens with a backend?
   - Or does app create its own session after initial handoff?

### E. Post-Login Flow

**10. App Launch Behavior:**
   - When user clicks "Open App" from landing page while logged in:
     - Should app automatically log them in?
     - Should landing page pass authentication token/credentials?
     - Or should user log in again in the app?

**11. First-Time vs Returning Users:**
   - How to differentiate first-time users from returning users?
   - Should app show onboarding for first-time users?
   - Where is this flag stored? (Landing page DB or app's local storage?)

### F. Subscription & Payment Integration

**12. Payment Processing:**
   - Is payment handled on landing page or in-app or both?
   - Does landing page use Stripe/PayPal/other payment processor?
   - Should app be aware of payment status and update tiers accordingly?

**13. Tier Changes:**
   - If user upgrades on landing page, how does app detect this?
   - Should app poll for tier changes periodically?
   - Is there a webhook system for subscription changes?

**14. Trial Periods:**
   - Does landing page offer trials?
   - Should app enforce trial expiration?
   - Where is trial status tracked?

### G. Backend API (If Applicable)

**15. Backend Architecture:**
   - Does landing page have a backend API (REST/GraphQL)?
   - Should the Electron app use this API instead of direct MongoDB access?
   - What are the API endpoints for:
     - Authentication (`/api/login`, `/api/register`?)
     - User profile (`/api/user`?)
     - Subscription management (`/api/subscription`?)

**16. API Authentication:**
   - What authentication method? (Bearer token, API key, session cookies?)
   - How long do tokens last?
   - How to refresh expired tokens?

### H. Data Migration & Backwards Compatibility

**17. Existing Users:**
   - Are there users who registered in-app before landing page existed?
   - Should landing page recognize and accept these users?
   - Any data migration needed?

**18. Dual Access:**
   - Can users modify their account from both landing page and app?
   - Which takes precedence if there's a conflict?
   - How to handle concurrent edits?

---

## Integration Scenarios

Please specify which scenario matches your implementation:

### Scenario A: Landing Page as Gateway (Recommended)
- Landing page handles all authentication
- Landing page passes session token to app
- App validates token and fetches user from same MongoDB
- App uses same user schema

### Scenario B: Separate Backend API
- Landing page has backend API
- App calls same API for authentication
- MongoDB accessed only through API
- API returns user data and handles all operations

### Scenario C: Credential Pass-Through
- Landing page collects credentials
- Passes email/password to app on launch
- App authenticates directly with MongoDB
- Landing page is just a collection form

### Scenario D: Independent Systems
- Landing page and app maintain separate auth
- Users may need to log in twice
- Data synchronized via shared database or API

---

## Required Deliverables from Landing Page Team

Please provide:

1. **Authentication Flow Diagram:** Visual representation of login/signup process
2. **API Documentation:** If backend API exists, provide endpoint documentation
3. **User Schema:** Exact structure of user documents created by landing page
4. **Session/Token Format:** How authentication state is passed to app
5. **Database Access:** Connection details or API keys
6. **Environment Variables:** Any required config for integration
7. **Error Handling:** How to handle auth failures, network errors, etc.
8. **Test Accounts:** Sample accounts for testing different subscription tiers

---

## App-Side Promises

The app currently provides:

✅ MongoDB user authentication (email/password)
✅ User registration with bcrypt password hashing
✅ Session persistence across app restarts
✅ Subscription tier enforcement
✅ Usage tracking and quota management
✅ Feature gating based on subscription
✅ User profile management
✅ Logout functionality

---

## Next Steps

1. Answer the questions in sections A-H above
2. Specify which integration scenario (A-D) you're using
3. Provide the deliverables listed
4. We'll create unified authentication flow documentation
5. Implement any necessary adapters/middleware for seamless integration

---

## Contact & Collaboration

Once you have answers to these questions, we can:
- Create a unified authentication middleware
- Update the app to work with landing page's auth system
- Ensure no conflicts between systems
- Test the complete user journey from landing to app usage

---

**Date Created:** November 4, 2025
**Version:** 1.0
**Status:** Awaiting Landing Page Team Feedback

