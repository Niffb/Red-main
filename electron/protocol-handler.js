const { app, protocol } = require('electron');
const path = require('path');

class ProtocolHandler {
  constructor() {
    this.authCallbacks = new Map();
    this.focusCallbacks = new Map();
  }

  /**
   * Initialize protocol handler (call this in main.js before app.ready)
   */
  initialize() {
    // Register protocol as standard
    if (process.defaultApp) {
      if (process.argv.length >= 2) {
        app.setAsDefaultProtocolClient('redglass', process.execPath, [path.resolve(process.argv[1])]);
      }
    } else {
      app.setAsDefaultProtocolClient('redglass');
    }

    // Handle macOS protocol
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.focusExistingWindow();
      this.handleProtocolUrl(url);
    });

    // Handle Windows/Linux protocol
    const gotTheLock = app.requestSingleInstanceLock();
    
    if (!gotTheLock) {
      app.quit();
    } else {
      app.on('second-instance', (event, commandLine, workingDirectory) => {
        // Focus the existing window when second instance is launched
        this.focusExistingWindow();
        
        // Protocol URL is in commandLine on Windows
        const url = commandLine.find(arg => arg.startsWith('redglass://'));
        if (url) {
          this.handleProtocolUrl(url);
        }
      });
    }

    console.log('✅ Protocol handler initialized for redglass://');
  }

  /**
   * Trigger all registered focus callbacks to bring existing window to front
   */
  focusExistingWindow() {
    console.log('🔍 Focusing existing window...');
    this.focusCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('❌ Error in focus callback:', error);
      }
    });
  }

  /**
   * Register a callback to focus the app window
   */
  onFocusRequest(callback) {
    const id = Date.now().toString();
    this.focusCallbacks.set(id, callback);
    return () => this.focusCallbacks.delete(id);
  }

  /**
   * Handle incoming protocol URL
   */
  handleProtocolUrl(url) {
    console.log('🔗 Protocol URL received:', url);
    
    try {
      const urlObj = new URL(url);
      
      // Handle auth callback: redglass://auth?token=xyz or redglass://auth/callback?token=xyz&session=abc
      if (urlObj.hostname === 'auth') {
        const token = urlObj.searchParams.get('token');
        const session = urlObj.searchParams.get('session');
        
        if (token) {
          // Trigger all registered auth callbacks
          this.authCallbacks.forEach(callback => {
            callback({ token, session: session || null });
          });
        } else {
          console.error('❌ Missing token in protocol URL');
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







