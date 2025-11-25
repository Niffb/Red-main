const { app } = require('electron');
const path = require('path');

const PROTOCOL_NAME = 'redglass';

class ProtocolHandler {
  constructor() {
    this.mainWindow = null;
    this.authTokenHandler = null;
    this.authCodeHandler = null;
    this.pendingUrl = null;
    
    // Register open-url handler IMMEDIATELY in constructor
    // This is critical for macOS as the event can fire before app.ready
    app.on('open-url', (event, url) => {
      event.preventDefault();
      console.log('🍎 macOS open-url event received:', url);
      this.handleLoginUrl(url);
    });
  }

  setMainWindow(window) {
    this.mainWindow = window;
  }

  setAuthTokenHandler(handler) {
    this.authTokenHandler = handler;
    
    // Process any pending URL that arrived before handler was set
    if (this.pendingUrl && this.pendingUrl.token) {
      console.log('🔄 Processing pending token');
      handler(this.pendingUrl.token);
      this.pendingUrl = null;
    }
  }

  setAuthCodeHandler(handler) {
    this.authCodeHandler = handler;
    
    // Process any pending URL that arrived before handler was set
    if (this.pendingUrl && this.pendingUrl.code) {
      console.log('🔄 Processing pending code');
      handler(this.pendingUrl.code);
      this.pendingUrl = null;
    }
  }

  initialize() {
    // Register protocol with OS
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient(PROTOCOL_NAME, process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient(PROTOCOL_NAME);
    }

    // Single instance lock for Windows/Linux
    const gotTheLock = app.requestSingleInstanceLock();

    if (!gotTheLock) {
      console.log('⚠️ Second instance detected, quitting...');
      app.quit();
      return false;
    }
    
    // Handle second instance (Windows/Linux warm start)
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      console.log('🪟 Second instance launched (Windows/Linux warm start)');
      console.log('📋 Command line:', commandLine);
      
      if (this.mainWindow) {
        if (this.mainWindow.isMinimized()) this.mainWindow.restore();
        this.mainWindow.focus();
      }
      
      const url = commandLine.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
      if (url) {
        console.log('🔗 Protocol URL from command line:', url);
        this.handleLoginUrl(url);
      }
    });

    // Check command line args for cold start on Windows/Linux
    const protocolUrl = process.argv.find(arg => arg.startsWith(`${PROTOCOL_NAME}://`));
    if (protocolUrl) {
      console.log('🔗 Protocol URL from startup args:', protocolUrl);
      // Delay processing to ensure handlers are set
      setTimeout(() => this.handleLoginUrl(protocolUrl), 100);
    }

    console.log(`✅ Protocol handler initialized for ${PROTOCOL_NAME}://`);
    return true;
  }

  handleLoginUrl(url) {
    console.log('🔗 handleLoginUrl called with:', url);
    
    try {
      const urlObj = new URL(url);
      const params = new URLSearchParams(urlObj.search);
      const token = params.get('token');
      const code = params.get('code');

      console.log('📦 Parsed URL - token:', !!token, 'code:', !!code);

      if (code) {
        console.log('🔐 Auth code received');
        if (this.authCodeHandler) {
          this.authCodeHandler(code);
        } else {
          console.log('⏳ Auth code handler not set yet, storing for later');
          this.pendingUrl = { code };
        }
      } else if (token) {
        console.log('🔐 Auth token received');
        if (this.authTokenHandler) {
          this.authTokenHandler(token);
        } else {
          console.log('⏳ Auth token handler not set yet, storing for later');
          this.pendingUrl = { token };
        }
      } else {
        console.error('❌ No token or code found in URL');
      }
    } catch (error) {
      console.error('❌ Error parsing URL:', error);
    }
  }
}

module.exports = new ProtocolHandler();
