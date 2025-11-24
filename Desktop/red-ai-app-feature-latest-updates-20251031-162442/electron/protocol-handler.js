const { app, protocol } = require('electron');
const path = require('path');

class ProtocolHandler {
  constructor() {
    this.authCallbacks = new Map();
  }

  /**
   * Initialize protocol handler (call this in main.js before app.ready)
   */
  initialize() {
    // Register protocol as standard
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('redai', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('redai');
    }

    // Handle macOS protocol
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleProtocolUrl(url);
    });

    // Handle Windows/Linux protocol
    const gotTheLock = app.requestSingleInstanceLock();
    
    if (!gotTheLock) {
      app.quit();
    } else {
      app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Protocol URL is in commandLine on Windows
        const url = commandLine.find(arg => arg.startsWith('redai://'));
        if (url) {
          this.handleProtocolUrl(url);
        }
      });
    }

    console.log('✅ Protocol handler initialized for redai://');
  }

  /**
   * Handle incoming protocol URL
   */
  handleProtocolUrl(url) {
    console.log('🔗 Protocol URL received:', url);
    
    try {
      const urlObj = new URL(url);
      
      // Handle auth callback: redai://auth/callback?token=xyz&session=abc
      if (urlObj.hostname === 'auth' && urlObj.pathname === '/callback') {
        const token = urlObj.searchParams.get('token');
        const session = urlObj.searchParams.get('session');
        
        if (token && session) {
          // Trigger all registered auth callbacks
          this.authCallbacks.forEach(callback => {
            callback({ token, session });
          });
        } else {
          console.error('❌ Missing token or session in protocol URL');
        }
      }
    } catch (error) {
      console.error('❌ Error parsing protocol URL:', error);
    }
  }

  /**
   * Register a callback for auth events
   */
  onAuthCallback(callback) {
    const id = Date.now().toString();
    this.authCallbacks.set(id, callback);
    return () => this.authCallbacks.delete(id);
  }
}

module.exports = new ProtocolHandler();







