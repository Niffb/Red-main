# Deep Linking Authentication Guide

## Overview

The Electron app now uses a simplified deep linking authentication system. When users sign in via the website, the browser redirects to a custom protocol URL that opens the app and passes authentication credentials.

## Protocol Configuration

- **Protocol Name**: `redglass://`
- **URL Format**: `redglass://auth?token=<TOKEN>` or `redglass://auth?code=<CODE>`

## Implementation Summary

### Electron App Changes

1. **Protocol Handler** (`electron/protocol-handler.js`)
   - Registers the `redglass://` protocol with the OS
   - Handles single instance locking for Windows/Linux
   - Handles `open-url` events for macOS
   - Handles `second-instance` events for Windows/Linux
   - Parses incoming URLs and extracts tokens or codes
   - Calls registered handler functions

2. **Auth Manager** (`electron/auth-manager.js`)
   - Simplified to handle token-based authentication
   - `openBrowserForLogin()` - Opens browser for sign-in
   - `exchangeCodeForToken(code)` - Exchanges auth code for access token (recommended)
   - `fetchUserData(token)` - Fetches user data with token
   - Stores authentication in local file

3. **Main Process** (`electron/main.js`)
   - Sets up auth token and code handlers
   - Processes authentication and updates UI
   - Manages auth window lifecycle

4. **Preload** (`electron/preload.js`)
   - Exposes auth event listeners to renderer
   - `onAuthToken(callback)` - Listen for token events
   - `onAuthCode(callback)` - Listen for code events
   - `onAuthSuccess(callback)` - Listen for successful auth

### Website Integration

Your website needs to redirect to the custom protocol after successful authentication.

#### Option 1: Direct Token (Simple, Less Secure)

**Backend (Node.js/Express example):**

```javascript
app.get('/auth/success', (req, res) => {
  const token = generateUserToken(req.user);
  
  // Redirect to Electron app
  res.redirect(`redglass://auth?token=${token}`);
});
```

**Security Warning**: Passing tokens directly in URLs can expose them to browser history and logs.

#### Option 2: Authorization Code (Recommended, More Secure)

**Backend (Node.js/Express example):**

```javascript
app.get('/auth/success', (req, res) => {
  // Generate short-lived, one-time use code (30 seconds expiry)
  const authCode = generateAuthCode(req.user); // Store in Redis/DB
  
  // Redirect to Electron app with code
  res.redirect(`redglass://auth?code=${authCode}`);
});

// Endpoint for Electron to exchange code for token
app.post('/api/auth/exchange-token', async (req, res) => {
  const { code } = req.body;
  
  // Validate code (check expiry, single-use)
  const userData = await validateAndConsumeAuthCode(code);
  
  if (!userData) {
    return res.json({ success: false, error: 'Invalid or expired code' });
  }
  
  // Generate and return access token
  const accessToken = generateAccessToken(userData);
  
  res.json({
    success: true,
    access_token: accessToken,
    user: userData
  });
});
```

## Authentication Flow

### Using Authorization Code (Recommended)

1. **User clicks "Login" in Electron app**
   - App opens browser to: `http://localhost:3000/signin.html?desktop=true`

2. **User signs in on website**
   - Website validates credentials
   - Generates short-lived authorization code
   - Stores code with 30-second expiry

3. **Website redirects to protocol**
   - Browser redirects to: `redglass://auth?code=abc123xyz`
   - OS catches the protocol and opens/focuses Electron app

4. **Electron receives code**
   - Protocol handler extracts code from URL
   - Calls auth code handler in main process

5. **Electron exchanges code for token**
   - Makes POST request to `/api/auth/exchange-token`
   - Server validates code (checks expiry, single-use)
   - Server marks code as used
   - Server returns access token

6. **Electron fetches user data**
   - Uses access token to fetch user profile
   - Saves auth data locally
   - Updates UI to show logged-in state

## Browser Behavior

When the website redirects to `redglass://auth?...`, the browser will typically show a confirmation dialog:

- **Chrome/Edge**: "Open Red Glass?"
- **Firefox**: "Launch Application"
- **Safari**: "Open Red Glass.app?"

This is a browser security feature and cannot be bypassed.

## Platform-Specific Notes

### macOS
- Uses `open-url` event
- Works with both cold start (app not running) and warm start (app already running)

### Windows
- Uses `second-instance` event for warm starts
- Uses command-line arguments for cold starts
- Requires single instance lock

### Linux
- Similar to Windows
- Uses command-line arguments and `second-instance` events

## Testing

### Development Mode

In development, test the protocol handler:

```bash
# macOS/Linux
open "redglass://auth?token=test123"

# Windows
start redglass://auth?token=test123
```

### Production

After building and installing the app, the protocol should be registered automatically. Test by:

1. Opening a browser
2. Navigating to a URL that redirects to `redglass://auth?...`
3. Confirming the OS prompt to open the app

## Security Best Practices

1. **Use Authorization Codes**: Never pass permanent tokens in URLs
2. **Short Expiry**: Auth codes should expire in 30 seconds or less
3. **Single Use**: Auth codes should be consumed immediately and marked as used
4. **HTTPS Only**: Always use HTTPS for the website (not in dev, but in production)
5. **Validate Origins**: Verify the auth code came from your server
6. **Rate Limiting**: Implement rate limiting on the exchange endpoint

## Troubleshooting

### Protocol not registered
- Rebuild the app
- Check that `package.json` includes the protocol configuration
- On macOS, check `/Applications/Red Glass.app/Contents/Info.plist`

### App doesn't open
- Check console logs in the terminal where you started the app
- Verify single instance lock isn't preventing the app from starting
- Check OS default protocol handlers

### Token/Code not received
- Check protocol handler logs
- Verify URL format matches exactly
- Test with manual URL opening

## Code References

### Protocol Handler

```javascript
// Protocol handler sets up handlers
protocolHandler.setAuthTokenHandler(async (token) => {
  // Handle token authentication
});

protocolHandler.setAuthCodeHandler(async (code) => {
  // Handle code exchange
});
```

### Auth Manager

```javascript
// Open browser for login
await authManager.openBrowserForLogin();

// Exchange code for token
const result = await authManager.exchangeCodeForToken(code);

// Fetch user data
const userData = await authManager.fetchUserData(token);
```

## Migration from Old System

The old system used:
- `redai://` protocol (now `redglass://`)
- Callback-based registration with `onAuthCallback()`
- Complex OAuth flow with session tokens

The new system:
- Uses `redglass://` protocol
- Direct handler functions
- Simplified token or authorization code flow
- No session management in protocol handler

### Breaking Changes

- Protocol name changed from `redai://` to `redglass://`
- `protocolHandler.onAuthCallback()` removed
- Use `setAuthTokenHandler()` and `setAuthCodeHandler()` instead
- Website redirect URLs must be updated to use new protocol

