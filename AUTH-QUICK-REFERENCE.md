# Deep Linking Authentication - Quick Reference

## Protocol Information

**Protocol Name:** `redglass`  
**URL Schemes:** `redglass://`

## URL Formats

### Token-Based (Simple)
```
redglass://auth?token=<ACCESS_TOKEN>
```

### Authorization Code (Recommended)
```
redglass://auth?code=<AUTH_CODE>
```

## Electron App API

### Protocol Handler Setup
```javascript
// In main.js before app.whenReady()
protocolHandler.initialize();

// Register handlers
protocolHandler.setAuthTokenHandler(async (token) => {
  const userData = await authManager.fetchUserData(token);
  // Handle authentication
});

protocolHandler.setAuthCodeHandler(async (code) => {
  const tokenData = await authManager.exchangeCodeForToken(code);
  // Handle authentication
});
```

### Auth Manager Methods
```javascript
// Open browser for login
await authManager.openBrowserForLogin();

// Exchange code for token
const result = await authManager.exchangeCodeForToken(code);
// Returns: { success, access_token, error }

// Fetch user data
const userData = await authManager.fetchUserData(token);
// Returns: { success, user, error }

// Check authentication
const isAuth = authManager.isAuthenticated();

// Get current user
const user = authManager.getCurrentUser();

// Logout
authManager.logout();
```

### Preload API (Renderer Process)
```javascript
// Listen for auth token
window.electronAPI.onAuthToken((token) => {
  console.log('Token received:', token);
});

// Listen for auth code
window.electronAPI.onAuthCode((code) => {
  console.log('Code received:', code);
});

// Listen for successful auth
window.electronAPI.onAuthSuccess((user) => {
  console.log('User authenticated:', user);
});
```

## Website Integration

### Backend Redirect (Node.js/Express)

#### Simple Token
```javascript
app.get('/auth/success', (req, res) => {
  const token = generateUserToken(req.user);
  res.redirect(`redglass://auth?token=${token}`);
});
```

#### Authorization Code (Recommended)
```javascript
// Step 1: Redirect with code
app.get('/auth/success', async (req, res) => {
  const code = crypto.randomBytes(16).toString('hex');
  
  await redis.setex(`auth:code:${code}`, 30, JSON.stringify({
    userId: req.user._id,
    createdAt: Date.now()
  }));
  
  res.redirect(`redglass://auth?code=${code}`);
});

// Step 2: Exchange endpoint
app.post('/api/auth/exchange-token', async (req, res) => {
  const { code } = req.body;
  
  const data = await redis.get(`auth:code:${code}`);
  if (!data) {
    return res.json({ success: false, error: 'Invalid code' });
  }
  
  await redis.del(`auth:code:${code}`);
  
  const { userId } = JSON.parse(data);
  const token = generateAccessToken(userId);
  
  res.json({ success: true, access_token: token });
});
```

### Frontend Detection
```javascript
// Check if desktop app redirect
if (result.redirectUrl && result.redirectUrl.startsWith('redglass://')) {
  window.location.href = result.redirectUrl;
}
```

## Testing Commands

### macOS
```bash
open "redglass://auth?token=test123"
```

### Windows (CMD)
```cmd
start redglass://auth?token=test123
```

### Windows (PowerShell)
```powershell
Start-Process "redglass://auth?token=test123"
```

### Linux
```bash
xdg-open "redglass://auth?token=test123"
```

## Platform-Specific Handling

### macOS
- Event: `open-url`
- Works on cold and warm starts
- Automatic

### Windows
- Event: `second-instance` (warm start)
- Command line args (cold start)
- Requires single instance lock

### Linux
- Similar to Windows
- Uses `second-instance` and command line

## Common Issues

### Protocol Not Registered
**Solution:** Rebuild app or check `package.json`:
```json
"protocols": {
  "name": "redglass",
  "schemes": ["redglass"]
}
```

### App Doesn't Open
**Check:**
1. Single instance lock not blocking
2. Protocol correctly registered
3. App is installed (not just running from source)

### Token/Code Not Received
**Debug:**
1. Check console logs
2. Verify URL format exactly matches
3. Test with manual URL opening

## File Locations

- **Protocol Handler:** `electron/protocol-handler.js`
- **Auth Manager:** `electron/auth-manager.js`
- **Main Process:** `electron/main.js` (search for "setAuthTokenHandler")
- **Preload:** `electron/preload.js` (search for "onAuthToken")
- **Package Config:** `package.json` (search for "protocols")

## Security Checklist

- [ ] Use HTTPS in production
- [ ] Implement authorization code flow
- [ ] Set code expiry (max 30 seconds)
- [ ] Ensure codes are single-use
- [ ] Validate token on server
- [ ] Rate limit exchange endpoint
- [ ] Don't log tokens/codes
- [ ] Use secure token generation

## Quick Links

- Full Guide: `DEEP-LINKING-AUTH-GUIDE.md`
- Migration Info: `MIGRATION-SUMMARY.md`
- Main README: `README.md`

