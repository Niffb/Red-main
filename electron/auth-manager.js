const { shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const fetch = require('node-fetch');
const crypto = require('crypto');
const http = require('http');

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.authToken = null;
    this.authFilePath = path.join(app.getPath('userData'), '.red-ai-auth.json');
    this.API_BASE_URL = 'https://www.red-ai.app/api';
    this.callbackServer = null;
    this.callbackPort = 8378; // Random port for local callback
    this.onAuthSuccess = null;
  }

  isAuthenticated() {
    return this.loadStoredAuth();
  }

  loadStoredAuth() {
    try {
      if (fs.existsSync(this.authFilePath)) {
        const authData = JSON.parse(fs.readFileSync(this.authFilePath, 'utf8'));

        if (authData.expires_at && new Date(authData.expires_at) > new Date()) {
          this.authToken = authData.token;
          this.currentUser = authData.user;
          console.log('✅ Restored authenticated session:', this.currentUser.email);
          return true;
        } else {
          console.log('⚠️ Auth token expired');
          this.clearAuth();
          return false;
        }
      }
    } catch (error) {
      console.error('❌ Error loading stored auth:', error);
      this.clearAuth();
    }
    return false;
  }

  saveAuth(token, user) {
    try {
      const authData = {
        token,
        user,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString()
      };

      fs.writeFileSync(this.authFilePath, JSON.stringify(authData, null, 2), 'utf8');

      this.authToken = token;
      this.currentUser = user;

      console.log('✅ Authentication data saved');
      return true;
    } catch (error) {
      console.error('❌ Error saving auth:', error);
      return false;
    }
  }

  clearAuth() {
    try {
      if (fs.existsSync(this.authFilePath)) {
        fs.unlinkSync(this.authFilePath);
      }
      this.authToken = null;
      this.currentUser = null;
      console.log('🗑️ Authentication data cleared');
    } catch (error) {
      console.error('❌ Error clearing auth:', error);
    }
  }

  setAuthSuccessCallback(callback) {
    this.onAuthSuccess = callback;
  }

  startCallbackServer() {
    return new Promise((resolve, reject) => {
      if (this.callbackServer) {
        resolve(this.callbackPort);
        return;
      }

      this.callbackServer = http.createServer((req, res) => {
        const url = new URL(req.url, `http://localhost:${this.callbackPort}`);
        
        // Handle CORS preflight
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (url.pathname === '/auth/callback') {
          const token = url.searchParams.get('token');
          
          if (token) {
            console.log('🎉 Auth callback received via HTTP server!');
            
            // Send success response with redirect script
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`
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
                  @keyframes draw { to { stroke-dashoffset: 0; } }
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
                  .closing-text {
                    margin-top: 20px;
                    font-size: 13px;
                    color: #a3a3a3;
                    animation: fadeIn 0.5s ease-out 0.6s both;
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
                  <p class="closing-text">This window will close automatically...</p>
                </div>
                <script>setTimeout(() => window.close(), 2500);</script>
              </body>
              </html>
            `);
            
            // Process the token
            if (this.onAuthSuccess) {
              this.onAuthSuccess(token);
            }
          } else {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Missing token');
          }
        } else {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not found');
        }
      });

      this.callbackServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          this.callbackPort++;
          this.callbackServer = null;
          this.startCallbackServer().then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });

      this.callbackServer.listen(this.callbackPort, '127.0.0.1', () => {
        console.log(`🌐 Auth callback server listening on http://127.0.0.1:${this.callbackPort}`);
        resolve(this.callbackPort);
      });
    });
  }

  stopCallbackServer() {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
      console.log('🛑 Auth callback server stopped');
    }
  }

  async openBrowserForLogin() {
    try {
      console.log('🔐 Opening browser for authentication');
      
      // Start local callback server
      const port = await this.startCallbackServer();
      const callbackUrl = `http://127.0.0.1:${port}/auth/callback`;
      
      const device_id = this.getOrCreateDeviceId();
      
      const initResponse = await fetch(`${this.API_BASE_URL}/auth/desktop/initiate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device_id,
          app_version: app.getVersion(),
          platform: process.platform,
          callback_url: callbackUrl // Tell server to use HTTP callback
        })
      });

      const initData = await initResponse.json();

      if (!initData.success) {
        throw new Error(initData.error || 'Failed to initiate auth');
      }

      const { auth_url } = initData;
      console.log('🔗 Auth URL:', auth_url);

      await shell.openExternal(auth_url);
      
      return { success: true, callbackPort: port };
    } catch (error) {
      console.error('❌ Error opening browser for login:', error);
      return { success: false, error: error.message };
    }
  }

  async exchangeCodeForToken(code) {
    try {
      console.log('🔄 Exchanging code for token');
      
      const response = await fetch(`${this.API_BASE_URL}/auth/exchange-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code })
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to exchange code');
      }

      return data;
    } catch (error) {
      console.error('❌ Error exchanging code:', error);
      return { success: false, error: error.message };
    }
  }

  async fetchUserData(token) {
    try {
      const response = await fetch(`${this.API_BASE_URL}/auth/desktop/user-data`, {
        headers: {
          'token': token,
          'Content-Type': 'application/json'
        }
      });

      return await response.json();
    } catch (error) {
      console.error('❌ Error fetching user data:', error);
      return { success: false, error: error.message };
    }
  }

  async refreshUserData() {
    if (!this.authToken) {
      return { success: false, error: 'Not authenticated' };
    }

    const userData = await this.fetchUserData(this.authToken);

    if (userData.success) {
      this.currentUser = userData.user;
      this.saveAuth(this.authToken, userData.user);
    }

    return userData;
  }

  getOrCreateDeviceId() {
    const deviceIdPath = path.join(app.getPath('userData'), '.device-id');

    try {
      if (fs.existsSync(deviceIdPath)) {
        return fs.readFileSync(deviceIdPath, 'utf8');
      }
    } catch (error) {
      console.error('Error reading device ID:', error);
    }

    const deviceId = crypto.randomBytes(16).toString('hex');

    try {
      fs.writeFileSync(deviceIdPath, deviceId, 'utf8');
    } catch (error) {
      console.error('Error saving device ID:', error);
    }

    return deviceId;
  }

  getCurrentUser() {
    return this.currentUser;
  }

  logout() {
    this.clearAuth();
    this.stopCallbackServer();
    return { success: true };
  }
}

module.exports = new AuthManager();
