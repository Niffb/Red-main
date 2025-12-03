const { shell, ipcMain } = require('electron');
const fs = require('fs');
const path = require('path');
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
  }

  /**
   * Check if user is authenticated
   */
  isAuthenticated() {
    return this.loadStoredAuth();
  }

  /**
   * Load stored authentication data
   */
  loadStoredAuth() {
    try {
      if (fs.existsSync(this.authFilePath)) {
        const authData = JSON.parse(fs.readFileSync(this.authFilePath, 'utf8'));

        // Check if token is expired
        if (authData.expires_at && new Date(authData.expires_at) > new Date()) {
          this.authToken = authData.token;
          this.currentUser = authData.user;
          console.log('✅ Restored authenticated session:', this.currentUser.email);
          return true;
        } else {
          // Token expired
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
   * Start OAuth flow
   */
  async startAuthFlow(protocolHandler) {
    return new Promise(async (resolve, reject) => {
      try {
        console.log('🔐 Starting OAuth flow...');

        // Generate device ID
        const device_id = this.getOrCreateDeviceId();

        // Step 1: Initiate auth session with backend
        const initResponse = await fetch(`${this.API_BASE_URL}/auth/desktop/initiate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            device_id,
            app_version: app.getVersion(),
            platform: process.platform
          })
        });

        const initData = await initResponse.json();

        if (!initData.success) {
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

        // Step 2: Register callback for protocol response
        const unregister = protocolHandler.onAuthCallback(async ({ token, session }) => {
          console.log('🎉 Auth callback received');

          try {
            // Step 3: Exchange token for user data
            const userData = await this.fetchUserData(token);

            if (userData.success) {
              // Step 4: Save auth data
              this.saveAuth(token, userData.user);

              unregister();
              resolve(userData.user);
            } else {
              throw new Error(userData.error || 'Failed to fetch user data');
            }
          } catch (error) {
            console.error('❌ Error in auth callback:', error);
            unregister();
            reject(error);
          }
        });

        // Step 3: Open browser to auth URL
        console.log('🌐 Opening browser for authentication:', finalAuthUrl);
        await shell.openExternal(finalAuthUrl);

        // Timeout after 5 minutes
        setTimeout(() => {
          unregister();
          reject(new Error('Authentication timeout'));
        }, 5 * 60 * 1000);

      } catch (error) {
        console.error('❌ Error starting auth flow:', error);
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







