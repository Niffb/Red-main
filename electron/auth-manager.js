const { shell, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
const http = require('http');
const { app } = require('electron');
const fetch = require('node-fetch');
const crypto = require('crypto');

class AuthManager {
  constructor() {
    this.authWindow = null;
    this.currentUser = null;
    this.authToken = null;
    this.authFilePath = path.join(app.getPath('userData'), '.red-ai-auth.json');
    this.API_BASE_URL = 'https://www.red-ai.app/api';
    this.callbackServer = null;
    this.callbackPort = null;
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    console.log('🔍 Checking auth file:', this.authFilePath);
    return this.loadStoredAuth();
  }

  /**
   * Load stored authentication data
   */
  loadStoredAuth() {
    try {
      const fileExists = fs.existsSync(this.authFilePath);
      console.log('🔍 Auth file exists:', fileExists);
      
      if (fileExists) {
        const authData = JSON.parse(fs.readFileSync(this.authFilePath, 'utf8'));
        console.log('🔍 Auth data found, expires_at:', authData.expires_at);

        // Check if token is expired
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
      } else {
        console.log('🔍 No auth file found - user needs to sign in');
      }
    } catch (error) {
      console.error('❌ Error loading stored auth:', error);
      this.clearAuth();
    }
    return false;
  }

  /**
   * Save authentication data
   */
  saveAuth(token, user) {
    try {
      const authData = {
        token,
        user,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
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

  /**
   * Clear authentication data
   */
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

  /**
   * Start local HTTP callback server for auth
   */
  async startCallbackServer() {
    return new Promise((resolve, reject) => {
      // Try ports 17891-17899 for the callback server
      const tryPort = (port) => {
        const server = http.createServer();
        
        server.once('error', (err) => {
          if (err.code === 'EADDRINUSE' && port < 17899) {
            tryPort(port + 1);
          } else {
            reject(new Error('Could not find available port for auth callback'));
          }
        });

        server.listen(port, '127.0.0.1', () => {
          this.callbackServer = server;
          this.callbackPort = port;
          console.log(`✅ Auth callback server started on port ${port}`);
          resolve(port);
        });
      };

      tryPort(17891);
    });
  }

  /**
   * Stop the callback server
   */
  stopCallbackServer() {
    if (this.callbackServer) {
      this.callbackServer.close();
      this.callbackServer = null;
      this.callbackPort = null;
      console.log('🔌 Auth callback server stopped');
    }
  }

  /**
   * Start OAuth flow
   */
  async startAuthFlow(protocolHandler) {
    return new Promise(async (resolve, reject) => {
      let unregisterProtocol = null;
      let authCompleted = false;

      const cleanup = () => {
        if (unregisterProtocol) unregisterProtocol();
        this.stopCallbackServer();
      };

      const handleAuthToken = async (token) => {
        if (authCompleted) return;
        authCompleted = true;

        console.log('🎉 Auth callback received');

        try {
          const userData = await this.fetchUserData(token);

          if (userData.success) {
            this.saveAuth(token, userData.user);
            cleanup();
            resolve(userData.user);
          } else {
            throw new Error(userData.error || 'Failed to fetch user data');
          }
        } catch (error) {
          console.error('❌ Error in auth callback:', error);
          cleanup();
          reject(error);
        }
      };

      try {
        console.log('🔐 Starting OAuth flow...');

        // Generate device ID
        const device_id = this.getOrCreateDeviceId();

        // Start local HTTP callback server
        const callbackPort = await this.startCallbackServer();
        const callbackUrl = `http://127.0.0.1:${callbackPort}/auth/callback`;
        console.log('🌐 HTTP callback URL:', callbackUrl);

        // Set up HTTP callback handler
        this.callbackServer.on('request', async (req, res) => {
          const url = new URL(req.url, `http://127.0.0.1:${callbackPort}`);
          
          if (url.pathname === '/auth/callback') {
            const token = url.searchParams.get('token');
            
            // Auto-close the browser tab
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`<!DOCTYPE html><html><head><script>window.close()</script></head><body></body></html>`);

            if (token) {
              console.log('🔗 HTTP callback received with token');
              await handleAuthToken(token);
            } else {
              console.error('❌ Missing token in HTTP callback');
            }
          }
        });

        // Step 1: Initiate auth session with backend
        const initResponse = await fetch(`${this.API_BASE_URL}/auth/desktop/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id,
            app_version: app.getVersion(),
            platform: process.platform,
            callback_url: callbackUrl
          })
        });

        const initData = await initResponse.json();

        if (!initData.success) {
          cleanup();
          throw new Error(initData.error || 'Failed to initiate auth');
        }

        const { auth_url, session_token } = initData;
        console.log('✅ Auth session created:', session_token);
        console.log('🔗 Received auth URL:', auth_url);

        // Fix: If server returns localhost URL (misconfiguration), rewrite to production
        let finalAuthUrl = auth_url;
        if (finalAuthUrl.includes('localhost:3000')) {
          console.log('⚠️ Detected localhost URL from production server, fixing...');
          finalAuthUrl = finalAuthUrl.replace('http://localhost:3000', 'https://www.red-ai.app');
          finalAuthUrl = finalAuthUrl.replace('localhost:3000', 'www.red-ai.app');
        }

        // Step 2: Also register callback for protocol response (fallback)
        unregisterProtocol = protocolHandler.onAuthCallback(async ({ token, session }) => {
          console.log('🔗 Protocol callback received');
          await handleAuthToken(token);
        });

        // Step 3: Open browser to auth URL
        console.log('🌐 Opening browser for authentication:', finalAuthUrl);
        await shell.openExternal(finalAuthUrl);

        // Timeout after 5 minutes
        setTimeout(() => {
          if (!authCompleted) {
            cleanup();
            reject(new Error('Authentication timeout'));
          }
        }, 5 * 60 * 1000);

      } catch (error) {
        console.error('❌ Error starting auth flow:', error);
        cleanup();
        reject(error);
      }
    });
  }

  /**
   * Fetch user data from API
   */
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

  /**
   * Refresh user data (check credits, subscription, etc.)
   */
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

  /**
   * Get or create unique device ID
   */
  getOrCreateDeviceId() {
    const deviceIdPath = path.join(app.getPath('userData'), '.device-id');

    try {
      if (fs.existsSync(deviceIdPath)) {
        return fs.readFileSync(deviceIdPath, 'utf8');
      }
    } catch (error) {
      console.error('Error reading device ID:', error);
    }

    // Create new device ID
    const deviceId = crypto.randomBytes(16).toString('hex');

    try {
      fs.writeFileSync(deviceIdPath, deviceId, 'utf8');
    } catch (error) {
      console.error('Error saving device ID:', error);
    }

    return deviceId;
  }

  /**
   * Get current user
   */
  getCurrentUser() {
    return this.currentUser;
  }

  /**
   * Logout
   */
  logout() {
    this.clearAuth();
    return { success: true };
  }
}

module.exports = new AuthManager();







