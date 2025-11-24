# Quick Integration Checklist
## Landing Page ↔️ Electron App Authentication

### 🔑 Critical Questions (Answer These First)

1. **How does authentication work on the landing page?**
   - [ ] Same MongoDB database as the app?
   - [ ] Different database/backend API?
   - [ ] Pass credentials to app after login?

2. **What happens when user clicks "Open App" from landing page?**
   - [ ] App opens with user already logged in?
   - [ ] App receives auth token?
   - [ ] User must log in again?

3. **Where are users stored?**
   - [ ] MongoDB: `mongodb+srv://YousefAly:Kubo0219@red-ai-app.ihzx0.mongodb.net/red-ai-app`
   - [ ] Different MongoDB URI: `_______________`
   - [ ] Backend API: `_______________`

4. **Password hashing:**
   - [ ] bcrypt (same as app)
   - [ ] Different method: `_______________`

5. **Subscription tier at signup:**
   - [ ] Always 'free'
   - [ ] User selects tier during signup
   - [ ] Payment processed on landing page

---

### 📋 Current App Implementation (What You're Integrating With)

**Database:** MongoDB Atlas
**Collection:** `users`
**User Fields:**
```
- email (unique)
- password (bcrypt hashed)
- fullName
- subscription.tier ('free'|'super-red'|'ultra-red')
- subscription.status
- usage.messagesUsedToday
- usage.transcriptionMinutesUsed
- usage.activeWorkflows
```

**App Auth APIs:**
- `mongodbAuthenticate(email, password)`
- `mongodbRegister({ email, password, fullName })`
- `mongodbLogout()`

---

### 🎯 Choose Your Integration Pattern

**Option 1: Shared Database (Simplest)**
- Landing page writes to same MongoDB
- App reads from same MongoDB
- Landing page creates user → App logs them in automatically
- ✅ Requires: MongoDB URI, matching user schema

**Option 2: Backend API (Most Secure)**
- Landing page has Node.js/Express backend
- App calls same API endpoints
- Both use API for auth/user management
- ✅ Requires: API URLs, auth token format

**Option 3: Credential Handoff**
- Landing page collects email/password
- Passes to app via deep link/launch parameter
- App authenticates with MongoDB
- ✅ Requires: Deep link setup, secure parameter passing

**Option 4: Independent Auth (Least Recommended)**
- Landing page and app separate
- User logs in twice
- Manual data sync
- ⚠️ Poor user experience

---

### 📦 What We Need From You

**For Shared Database (Option 1):**
```javascript
// Exact user creation code from landing page
{
  email: "user@example.com",
  password: /* how is this hashed? */,
  fullName: "John Doe",
  subscription: {
    tier: /* 'free' or ? */,
    status: /* 'active' or ? */
  }
  // Any other fields?
}
```

**For Backend API (Option 2):**
```
POST /api/register
POST /api/login
GET  /api/user
PUT  /api/user
GET  /api/subscription

// Auth format?
Authorization: Bearer <token>
// or?
```

**For Credential Handoff (Option 3):**
```
// How does landing page launch app?
myapp://login?email=...&token=...
// or?
```

---

### ✅ Quick Test Scenarios

Test these flows and tell us what happens:

1. **New User Journey:**
   - User signs up on landing page
   - User clicks "Open App"
   - What happens in app? _____________

2. **Returning User:**
   - User already has account
   - Logs in on landing page
   - Opens app
   - What happens in app? _____________

3. **Tier Upgrade:**
   - User upgrades from Free to Super-Red on landing page
   - Already has app open
   - How does app know about upgrade? _____________

---

### 🚀 Next Steps

1. **Answer the 5 critical questions above** ⬆️
2. **Choose your integration pattern** (1-4)
3. **Provide the required info** for your chosen pattern
4. We'll create the integration adapter
5. Test together

---

### 📞 Share This Info

Copy and fill out:

```
INTEGRATION INFO FOR RED AI APP
================================

1. Auth Method: [Shared DB / Backend API / Credential Handoff / Other]

2. Database/API Details:
   - MongoDB URI: _______________
   OR
   - API Base URL: _______________

3. User Schema (JSON):
```json
{
  "email": "",
  "password": "",
  // ... rest of fields
}
```

4. Password Hashing: [bcrypt / other: ___]

5. Default Subscription Tier: [free / super-red / ultra-red]

6. App Launch Behavior:
   [Auto-login / Token passed / Manual login]

7. Session Token Format (if any): _______________

8. Test Account:
   - Email: _______________
   - Password: _______________
```

---

**Send This Filled-Out Form →** Then we can integrate seamlessly!

