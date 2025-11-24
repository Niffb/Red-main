const { app, BrowserWindow, globalShortcut, ipcMain, Tray, Menu, shell, nativeImage, desktopCapturer, screen } = require('electron');
const path = require('path');
const dotenv = require('dotenv');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

// Load environment variables from .env file
const isDev = !app.isPackaged;
const envPath = isDev
  ? path.join(__dirname, '../.env')
  : path.join(process.resourcesPath, '.env');

console.log('📁 Loading .env from:', envPath);
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.error('❌ Failed to load .env file:', envResult.error);
} else {
  console.log('✅ .env file loaded successfully');
  // Log loaded keys for debugging (safely)
  const loadedKeys = Object.keys(envResult.parsed || {});
  console.log('🔑 Environment variables loaded:', loadedKeys.join(', '));
}

// Web Speech API will be used in renderer process instead of native dependencies

// Settings Manager
const settingsManager = require('./settings-manager');
const mongoDBService = require('./mongodb-service');
const subscriptionManager = require('./subscription-manager');
const { sanitizeString, validateInput } = require('./ipc-security');
const protocolHandler = require('./protocol-handler');
const authManager = require('./auth-manager');

// Gemini Live service variables
let geminiLiveProcess = null;
let geminiLiveReady = false;      // Python process started and stdout JSON available
let geminiLiveRunning = false;    // Live session started and ready to accept messages
let geminiLiveQueue = [];         // Queue messages until running

// ============================================
// MCP Server Manager
// ============================================
class MCPServerManager {
  constructor() {
    this.servers = new Map(); // serverName -> { process, config, status, tools }
    this.eventHandlers = new Map(); // eventType -> Set of callbacks
  }

  /**
   * Add and start a new MCP server
   * @param {string} serverName - Unique name for the server
   * @param {object} config - Server configuration
   * @param {string} config.command - Command to run (e.g., 'npx', 'python', 'node')
   * @param {string[]} config.args - Arguments for the command
   * @param {object} config.env - Environment variables
   * @returns {Promise<object>} Result with success status and server info
   */
  async addServer(serverName, config) {
    if (this.servers.has(serverName)) {
      return {
        success: false,
        error: `Server '${serverName}' already exists`
      };
    }

    try {
      console.log(`🔌 Starting MCP server '${serverName}'...`);

      const serverInfo = {
        config,
        status: 'starting',
        tools: [],
        lastError: null,
        restartCount: 0,
        startTime: Date.now()
      };

      // Spawn the MCP server process
      const env = { ...process.env, ...config.env };
      const serverProcess = spawn(config.command, config.args, {
        env,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      serverInfo.process = serverProcess;

      // Handle process events
      serverProcess.on('error', (error) => {
        console.error(`❌ MCP server '${serverName}' error:`, error);
        serverInfo.lastError = error.message;
        serverInfo.status = 'error';
        this._emit('server-error', { serverName, error: error.message });
      });

      serverProcess.on('exit', (code, signal) => {
        console.log(`🔌 MCP server '${serverName}' exited (code: ${code}, signal: ${signal})`);
        serverInfo.status = 'stopped';

        // Auto-restart if it crashed unexpectedly
        if (code !== 0 && serverInfo.status !== 'stopping') {
          console.log(`🔄 Attempting to restart MCP server '${serverName}'...`);
          this._restartServer(serverName, serverInfo);
        }

        this._emit('server-exit', { serverName, code, signal });
      });

      // Handle stdout (server responses)
      let stdoutBuffer = '';
      serverProcess.stdout.on('data', (data) => {
        stdoutBuffer += data.toString();

        // Process complete JSON lines
        const lines = stdoutBuffer.split('\n');
        stdoutBuffer = lines.pop(); // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.trim()) {
            try {
              const message = JSON.parse(line);
              this._handleServerMessage(serverName, message);
            } catch (error) {
              console.error(`❌ Failed to parse MCP message from '${serverName}':`, line);
            }
          }
        }
      });

      // Handle stderr (server logs)
      serverProcess.stderr.on('data', (data) => {
        console.log(`📋 MCP server '${serverName}' log:`, data.toString().trim());
      });

      // Store server info
      this.servers.set(serverName, serverInfo);

      // Give the process a moment to start
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Mark as running so IPC handler can send messages
      // Status will be updated after successful initialization
      serverInfo.status = 'running';
      console.log(`✅ MCP server '${serverName}' process started and ready for initialization`);

      return {
        success: true,
        serverName,
        tools: serverInfo.tools,
        status: serverInfo.status
      };

    } catch (error) {
      console.error(`❌ Failed to start MCP server '${serverName}':`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Remove and stop an MCP server
   * @param {string} serverName - Name of the server to remove
   * @returns {Promise<object>} Result with success status
   */
  async removeServer(serverName) {
    const serverInfo = this.servers.get(serverName);

    if (!serverInfo) {
      return {
        success: false,
        error: `Server '${serverName}' not found`
      };
    }

    try {
      console.log(`🔌 Stopping MCP server '${serverName}'...`);
      serverInfo.status = 'stopping';

      // Kill the process
      if (serverInfo.process) {
        serverInfo.process.kill('SIGTERM');

        // Force kill after 5 seconds
        setTimeout(() => {
          if (serverInfo.process && !serverInfo.process.killed) {
            console.log(`⚠️ Force killing MCP server '${serverName}'`);
            serverInfo.process.kill('SIGKILL');
          }
        }, 5000);
      }

      this.servers.delete(serverName);
      this._emit('server-removed', { serverName });

      console.log(`✅ MCP server '${serverName}' stopped`);
      return { success: true };

    } catch (error) {
      console.error(`❌ Failed to stop MCP server '${serverName}':`, error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get status of all servers or a specific server
   * @param {string} [serverName] - Optional server name
   * @returns {object} Status information
   */
  getServerStatus(serverName = null) {
    if (serverName) {
      const serverInfo = this.servers.get(serverName);
      if (!serverInfo) {
        return { error: `Server '${serverName}' not found` };
      }

      return {
        serverName,
        status: serverInfo.status,
        toolCount: serverInfo.tools.length,
        tools: serverInfo.tools.map(t => t.name),
        uptime: Date.now() - serverInfo.startTime,
        restartCount: serverInfo.restartCount,
        lastError: serverInfo.lastError
      };
    }

    // Return status of all servers
    const statuses = {};
    for (const [name, info] of this.servers.entries()) {
      statuses[name] = {
        status: info.status,
        toolCount: info.tools.length,
        uptime: Date.now() - info.startTime,
        restartCount: info.restartCount
      };
    }
    return statuses;
  }

  /**
   * Get all tools from all servers
   * @returns {object} Tool registry
   */
  getAllTools() {
    const registry = {};

    for (const [serverName, serverInfo] of this.servers.entries()) {
      for (const tool of serverInfo.tools) {
        const toolKey = `${serverName}_${tool.name}`;
        registry[toolKey] = {
          server: serverName,
          name: tool.name,
          description: tool.description || '',
          inputSchema: tool.inputSchema || {}
        };
      }
    }

    return registry;
  }

  /**
   * Send a message to a specific server
   * @param {string} serverName - Server to send to
   * @param {object} message - JSON-RPC message
   * @returns {Promise<object>} Server response
   */
  async sendToServer(serverName, message) {
    const serverInfo = this.servers.get(serverName);

    if (!serverInfo) {
      throw new Error(`Server '${serverName}' not found`);
    }

    if (serverInfo.status !== 'running') {
      throw new Error(`Server '${serverName}' is not running (status: ${serverInfo.status})`);
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Timeout waiting for response from '${serverName}'`));
      }, 30000);

      // Listen for response with this request ID
      const messageId = message.id;
      const responseHandler = (response) => {
        if (response.id === messageId) {
          clearTimeout(timeout);
          this.off(`response-${serverName}`, responseHandler);
          resolve(response);
        }
      };

      this.on(`response-${serverName}`, responseHandler);

      // Send message
      try {
        serverInfo.process.stdin.write(JSON.stringify(message) + '\n');
      } catch (error) {
        clearTimeout(timeout);
        this.off(`response-${serverName}`, responseHandler);
        reject(error);
      }
    });
  }

  /**
   * Register an event handler
   * @param {string} eventType - Event type
   * @param {function} handler - Event handler
   */
  on(eventType, handler) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType).add(handler);
  }

  /**
   * Unregister an event handler
   * @param {string} eventType - Event type
   * @param {function} handler - Event handler
   */
  off(eventType, handler) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  /**
   * Emit an event to all registered handlers
   * @private
   */
  _emit(eventType, data) {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`Error in event handler for '${eventType}':`, error);
        }
      }
    }

    // Also forward to renderer if mainWindow exists
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mcp-event', { type: eventType, data });
    }
  }

  /**
   * Handle messages from MCP servers
   * @private
   */
  _handleServerMessage(serverName, message) {
    const serverInfo = this.servers.get(serverName);
    if (!serverInfo) return;

    // Handle JSON-RPC responses
    if (message.id !== undefined) {
      this._emit(`response-${serverName}`, message);
    }

    // Handle specific message types
    if (message.result) {
      // Tools list response
      if (message.result.tools) {
        serverInfo.tools = message.result.tools;
        console.log(`📋 Server '${serverName}' has ${serverInfo.tools.length} tools`);
      }
    }
  }

  /**
   * Wait for server to be ready
   * @private
   */
  async _waitForReady(serverName, timeout) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const serverInfo = this.servers.get(serverName);
      if (!serverInfo) return false;

      if (serverInfo.status === 'error') return false;
      if (serverInfo.tools.length > 0) return true;

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  }

  /**
   * Restart a crashed server
   * @private
   */
  async _restartServer(serverName, serverInfo) {
    if (serverInfo.restartCount >= 3) {
      console.error(`❌ Server '${serverName}' exceeded max restart attempts`);
      serverInfo.status = 'failed';
      return;
    }

    serverInfo.restartCount++;
    console.log(`🔄 Restarting server '${serverName}' (attempt ${serverInfo.restartCount})...`);

    // Wait before restart
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove old entry
    this.servers.delete(serverName);

    // Try to restart
    const result = await this.addServer(serverName, serverInfo.config);
    if (!result.success) {
      console.error(`❌ Failed to restart server '${serverName}':`, result.error);
    }
  }

  /**
   * Shutdown all servers
   */
  async shutdown() {
    console.log('🔌 Shutting down all MCP servers...');

    const shutdownPromises = [];
    for (const serverName of this.servers.keys()) {
      shutdownPromises.push(this.removeServer(serverName));
    }

    await Promise.all(shutdownPromises);
    console.log('✅ All MCP servers shut down');
  }

  /**
   * Save currently running servers to restore later
   */
  saveRunningServers() {
    try {
      const runningServers = [];
      for (const [name, info] of this.servers) {
        if (info.status === 'running') {
          runningServers.push({
            name,
            config: info.config
          });
        }
      }

      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../.mcp-servers/running.json');
      const dir = path.dirname(configPath);

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(configPath, JSON.stringify({ servers: runningServers }, null, 2));
      console.log(`💾 Saved ${runningServers.length} running MCP servers`);
    } catch (error) {
      console.error('❌ Failed to save running servers:', error);
    }
  }

  /**
   * Restore previously running servers
   */
  async restoreRunningServers() {
    try {
      const fs = require('fs');
      const path = require('path');
      const configPath = path.join(__dirname, '../.mcp-servers/running.json');

      if (!fs.existsSync(configPath)) {
        console.log('ℹ️ No saved MCP servers to restore');
        return;
      }

      const data = fs.readFileSync(configPath, 'utf8');
      const { servers } = JSON.parse(data);

      if (!servers || servers.length === 0) {
        console.log('ℹ️ No running servers to restore');
        return;
      }

      console.log(`🔄 Restoring ${servers.length} MCP servers...`);

      for (const { name, config } of servers) {
        try {
          console.log(`  🔌 Restarting '${name}'...`);

          const result = await this.addServer(name, config);

          if (result.success) {
            // Initialize the server
            const initMessage = {
              jsonrpc: '2.0',
              id: Date.now(),
              method: 'initialize',
              params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: {
                  name: 'red-glass',
                  version: '1.0.0'
                }
              }
            };

            await this.sendToServer(name, initMessage);
            await this.sendToServer(name, {
              jsonrpc: '2.0',
              method: 'notifications/initialized'
            });

            console.log(`  ✅ '${name}' restored`);
          }
        } catch (error) {
          console.error(`  ❌ Failed to restore '${name}':`, error.message);
        }
      }

      console.log('✅ MCP server restoration complete');
    } catch (error) {
      console.error('❌ Failed to restore running servers:', error);
    }
  }
}

// Initialize MCP Server Manager
const mcpManager = new MCPServerManager();

// Initialize Workflow Executor
const WorkflowExecutor = require('./workflow-executor');
const workflowExecutor = new WorkflowExecutor(mcpManager);

function waitForGeminiRunning(timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    if (geminiLiveRunning) return resolve(true);
    const start = Date.now();
    const interval = setInterval(() => {
      if (geminiLiveRunning) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
}

// Load environment variables from .env file - MOVED TO TOP
// const envPath = path.join(__dirname, '../.env');
// console.log('📁 Loading .env from:', envPath);

// const dotenvResult = dotenv.config({ path: envPath });
// if (dotenvResult.error) {
//   console.error('❌ Error loading .env file:', dotenvResult.error.message);
//   console.log('📝 Please ensure .env file exists in project root with: GEMINI_API_KEY=your_api_key_here');
// } else {
//   console.log('✅ .env file loaded successfully');
//   console.log('🔑 Environment variables loaded:', Object.keys(dotenvResult.parsed || {}).join(', '));
// }

// Ensure GEMINI_API_KEY is loaded
if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY not found in environment variables');
  console.log('📝 Please check your .env file contains: GEMINI_API_KEY=your_api_key_here');
} else {
  console.log('✅ GEMINI_API_KEY loaded successfully');
}

// Variables for window dragging
let isDragging = false;
let dragOffset = { x: 0, y: 0 };

// Replace electron-is-dev with a simple implementation
// const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === undefined;

// Performance optimizations
const ipcCache = new Map();
const ipcBatchQueue = new Map();
const BATCH_TIMEOUT = 50; // Batch IPC calls for 50ms
const CACHE_TTL = 5000; // Cache for 5 seconds

// Add error handler for EPIPE errors
process.on('uncaughtException', (err) => {
  if (err.code === 'EPIPE') {
    // Ignore EPIPE errors (broken pipe when console output is lost)
    return;
  }
  console.error('Uncaught Exception:', err);
});

// Demo response system for faster demo interactions
const checkForDemoQuery = (message) => {
  const lowerMessage = message.toLowerCase();

  // Capability queries
  const capabilityPatterns = [
    /(?:hey|hi|hello).*red.*(?:what.*can.*you.*do|what.*are.*your.*capabilities|what.*can.*you.*help.*with|tell.*me.*about.*yourself|what.*do.*you.*do)/i,
    /(?:red|assistant).*(?:capabilities|features|abilities)/i,
    /what.*can.*red.*do/i,
    /tell.*me.*about.*red/i
  ];

  // Demo-specific queries
  const demoPatterns = [
    /(?:hey|hi|hello).*red.*(?:demo|show.*me|example)/i,
    /how.*does.*this.*work/i,
    /what.*is.*this.*app/i,
    /red.*glass.*demo/i
  ];

  return {
    isDemo: capabilityPatterns.some(pattern => pattern.test(lowerMessage)) ||
      demoPatterns.some(pattern => pattern.test(lowerMessage)),
    type: capabilityPatterns.some(pattern => pattern.test(lowerMessage)) ? 'capabilities' : 'demo'
  };
};

const getDemoResponse = (queryType) => {
  const responses = {
    capabilities: `**RED GLASS AI Assistant**

I'm your intelligent assistant with powerful capabilities:

**Voice & Audio**
• Real-time speech transcription from microphone
• System audio capture and transcription
• Multi-source audio processing with echo cancellation

**Screen Intelligence**
• Screen capture and analysis
• Context-aware responses based on what you're viewing
• Visual content understanding and explanation

**Smart Conversations**
• Natural language processing and understanding
• Context-aware responses with conversation memory
• File attachment support and analysis

**Technical Features**
• Multiple AI model integration (DeepSeek, OpenAI)
• Session management and conversation history
• Advanced audio processing and noise reduction

**How to Use Me**
• Ask questions about your screen with Cmd+Return (Mac) or Ctrl+Return (Windows)
• Start voice transcription for meetings or conversations
• Chat naturally - I understand context and maintain conversation flow
• Attach files for analysis and discussion

Ready to assist you with any task! What would you like to explore first?`,

    demo: `**Welcome to RED GLASS - Your AI-Powered Assistant!**

This is a live demo of RED GLASS's core capabilities:

**Try These Demo Commands:**
• "Take a screenshot and tell me what you see"
• "Start transcribing my voice"
• "Help me analyze this document" (with file attachment)
• "What's happening on my screen right now?"

**Key Demo Features:**
**Instant Screen Analysis** - Press Cmd+Return (Mac) or Ctrl+Return (Windows)
**Real-time Voice Transcription** - Perfect for meetings and notes
**File Intelligence** - Drag & drop files for instant analysis
**Context Awareness** - I remember our conversation and learn from your screen

**Demo Tip:** Try asking me about what's currently visible on your screen - I can see and analyze any application, document, or webpage you're viewing!

What would you like to demonstrate first?`
  };

  return responses[queryType] || responses.capabilities;
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

let mainWindow;
let askWindow;
let tray;
let isVisible = false;
let isAskWindowVisible = false;
let screenshotCache = new Map(); // Cache for recent screenshots
let conversationHistory = []; // Store conversation history for context
let lastScreenshotTime = 0; // Rate limiting for screenshots
let screenshotRequestCount = 0; // Track screenshot requests

// Add first run detection
let isFirstRun = false;

// Authentication state
let isAuthenticated = false;
let currentUser = null;
let authWindow = null;

// Performance monitoring
let performanceMetrics = {
  ipcCalls: 0,
  cacheHits: 0,
  cacheMisses: 0,
  batchedCalls: 0,
  averageResponseTime: 0,
  lastResetTime: Date.now()
};

// Utility functions for performance optimization
function getCachedResult(key) {
  const cached = ipcCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    performanceMetrics.cacheHits++;
    return cached.data;
  }
  performanceMetrics.cacheMisses++;
  return null;
}

function setCachedResult(key, data) {
  ipcCache.set(key, {
    data,
    timestamp: Date.now()
  });

  // Clean up old cache entries
  if (ipcCache.size > 100) {
    const oldestKey = ipcCache.keys().next().value;
    ipcCache.delete(oldestKey);
  }
}

function batchIpcCall(key, handler, ...args) {
  return new Promise((resolve, reject) => {
    if (!ipcBatchQueue.has(key)) {
      ipcBatchQueue.set(key, []);
    }

    ipcBatchQueue.get(key).push({ handler, args, resolve, reject });

    // Process batch after timeout
    setTimeout(() => {
      processBatch(key);
    }, BATCH_TIMEOUT);
  });
}

async function processBatch(key) {
  const batch = ipcBatchQueue.get(key);
  if (!batch || batch.length === 0) return;

  ipcBatchQueue.delete(key);
  performanceMetrics.batchedCalls += batch.length;

  // Process all calls in the batch
  for (const { handler, args, resolve, reject } of batch) {
    try {
      const result = await handler(...args);
      resolve(result);
    } catch (error) {
      reject(error);
    }
  }
}

function checkFirstRun() {
  const userDataPath = app.getPath('userData');
  const firstRunFlagPath = path.join(userDataPath, '.red-glass-initialized');

  try {
    // Check if the flag file exists
    if (!fs.existsSync(firstRunFlagPath)) {
      // First run - create the flag file
      fs.mkdirSync(userDataPath, { recursive: true });
      fs.writeFileSync(firstRunFlagPath, JSON.stringify({
        firstRun: new Date().toISOString(),
        version: require('../package.json').version || '1.0.0'
      }));
      isFirstRun = true;
      // First run detected - will show window immediately
    } else {
      isFirstRun = false;
      // Welcome back - starting in background
    }
  } catch (error) {
    console.error('⚠️ Error checking first run status:', error);
    // Default to first run behavior if we can't determine
    isFirstRun = true;
  }

  return isFirstRun;
}

// Check authentication status
function checkAuthStatus() {
  return authManager.isAuthenticated();
}

// Save authentication data
function saveAuthData(user) {
  try {
    const userDataPath = app.getPath('userData');
    const authFilePath = path.join(userDataPath, '.red-glass-auth');

    const authData = {
      user: user,
      authenticatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days
    };

    fs.mkdirSync(userDataPath, { recursive: true });
    fs.writeFileSync(authFilePath, JSON.stringify(authData, null, 2));

    currentUser = user;
    isAuthenticated = true;

    console.log('✅ Authentication data saved for:', user.email);
  } catch (error) {
    console.error('❌ Error saving auth data:', error);
  }
}

// Clear authentication data
function clearAuthData() {
  try {
    const userDataPath = app.getPath('userData');
    const authFilePath = path.join(userDataPath, '.red-glass-auth');

    if (fs.existsSync(authFilePath)) {
      fs.unlinkSync(authFilePath);
    }

    currentUser = null;
    isAuthenticated = false;

    console.log('✅ Authentication data cleared');
  } catch (error) {
    console.error('❌ Error clearing auth data:', error);
  }
}

// Create authentication window
async function createAuthWindow() {
  if (authWindow) {
    authWindow.focus();
    return;
  }

  authWindow = new BrowserWindow({
    width: 500,
    height: 600,
    frame: false,
    show: true,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the OAuth loading screen
  authWindow.loadFile(path.join(__dirname, '../public/auth-loading.html'));

  // Center window
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const { x: displayX, y: displayY } = primaryDisplay.workArea;

  const windowWidth = authWindow.getSize()[0];
  const windowHeight = authWindow.getSize()[1];

  const centerX = Math.floor(displayX + (width / 2) - (windowWidth / 2));
  const centerY = Math.floor(displayY + (height / 2) - (windowHeight / 2));

  authWindow.setPosition(centerX, centerY);

  try {
    // Start OAuth flow
    console.log('🔐 Starting OAuth authentication...');
    const user = await authManager.startAuthFlow(protocolHandler);

    console.log('✅ User authenticated:', user.email);

    // Show success screen briefly
    authWindow.loadFile(path.join(__dirname, '../public/auth-success.html'));

    // Update global state
    currentUser = user;
    isAuthenticated = true;

    // Wait 1.5 seconds then create main window
    setTimeout(() => {
      if (authWindow) {
        authWindow.close();
      }
      createWindow();
    }, 1500);

  } catch (error) {
    console.error('❌ OAuth authentication failed:', error);

    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.webContents.send('auth-error', {
        error: error.message || 'Authentication failed'
      });
    }

    // Show error and allow retry
    setTimeout(() => {
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.loadFile(path.join(__dirname, '../public/auth-loading.html'));
        // Retry after 2 seconds
        setTimeout(() => createAuthWindow(), 2000);
      }
    }, 3000);
  }

  authWindow.on('closed', () => {
    authWindow = null;
    if (!isAuthenticated) {
      console.log('🚪 Authentication cancelled, quitting app');
      app.quit();
    }
  });
}


// Helper function to safely send IPC messages with performance tracking
function safeSendToRenderer(channel, data) {
  const startTime = Date.now();

  try {
    if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, data);

      // Update performance metrics
      const responseTime = Date.now() - startTime;
      performanceMetrics.averageResponseTime =
        (performanceMetrics.averageResponseTime + responseTime) / 2;

      return true;
    }
    return false;
  } catch (error) {
    console.log(`⚠️ Could not send IPC message to renderer (${channel}):`, error.message);
    return false;
  }
}

// Helper function to safely send IPC messages to ask window
function safeSendToAskWindow(channel, data) {
  const startTime = Date.now();

  try {
    if (askWindow && askWindow.webContents && !askWindow.webContents.isDestroyed()) {
      askWindow.webContents.send(channel, data);

      // Update performance metrics
      const responseTime = Date.now() - startTime;
      performanceMetrics.averageResponseTime =
        (performanceMetrics.averageResponseTime + responseTime) / 2;

      return true;
    }
    return false;
  } catch (error) {
    console.log(`⚠️ Could not send IPC message to ask window (${channel}):`, error.message);
    return false;
  }
}



// Function to restore single window layout
function restoreSingleWindowLayout() {
  if (!mainWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const { x: displayX, y: displayY } = primaryDisplay.workArea;

  // Restore main window to center with larger invisible background
  const windowWidth = 750; // Updated to match new window size
  const windowHeight = 500; // Larger height to provide space for content windows
  const centerX = Math.floor(displayX + (width / 2) - (windowWidth / 2));
  const centerY = Math.floor(displayY + (height / 2) - (windowHeight / 2));

  mainWindow.setBounds({
    x: centerX,
    y: centerY,
    width: windowWidth,
    height: windowHeight
  });

  console.log('📐 Restored single window layout');
}

function createWindow() {
  // Check if this is the first run before creating window
  checkFirstRun();

  // Check authentication status
  const isAuthValid = checkAuthStatus();

  // If not authenticated, show auth window instead of main window
  if (!isAuthValid) {
    console.log('🔐 User not authenticated, showing sign-in screen');
    createAuthWindow();
    return;
  }

  console.log('✅ User authenticated, creating main window');

  // Create the browser window with a larger invisible background for content windows
  mainWindow = new BrowserWindow({
    width: 750, // Increased width to accommodate wider content windows
    height: 500, // Larger height to provide space for content windows below navigation
    minWidth: 400, // Minimum width to ensure UI fits
    maxWidth: 800, // Increased maximum width for wider content
    minHeight: 80, // Minimum height for navigation bar
    maxHeight: 800, // Increased maximum height when content is expanded
    frame: false,
    show: isFirstRun, // Show immediately on first run, start hidden on subsequent runs
    transparent: true,
    alwaysOnTop: false, // Start with false, will be set to true when showing
    resizable: true, // Allow resizing to accommodate content
    hasShadow: false,
    skipTaskbar: false, // Ensure it appears in taskbar for debugging
    backgroundColor: '#00000000', // Explicitly set transparent background with alpha
    icon: path.join(__dirname, '../public/icon.png'), // Set custom app icon
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      webSecurity: false, // Allow Web Speech API to work in Electron
      allowRunningInsecureContent: true, // Allow mixed content for speech APIs
      experimentalFeatures: true // Enable experimental web features
    }
  });

  // Load the frontend.html file (main navigation pill UI)
  mainWindow.loadFile(path.join(__dirname, '../public/frontend.html'));
  // Add error handling for loading
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Add console logging from renderer process
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log('Renderer:', message);
  });

  // Open DevTools in development mode (disabled)
  // if (isDev) {
  //   mainWindow.webContents.openDevTools();
  // }

  // If this is the first run, set up the window for visibility immediately
  if (isFirstRun) {
    // First run - configuring window for immediate visibility

    // Position window in center of the screen
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const { x: displayX, y: displayY } = primaryDisplay.workArea;

    const windowWidth = mainWindow.getSize()[0];
    const windowHeight = mainWindow.getSize()[1];

    // Calculate center position
    const centerX = Math.floor(displayX + (width / 2) - (windowWidth / 2));
    const centerY = Math.floor(displayY + (height / 2) - (windowHeight / 2));

    // Ensure window is within screen bounds
    const x = Math.max(displayX, Math.min(centerX, displayX + width - windowWidth));
    const y = Math.max(displayY, Math.min(centerY, displayY + height - windowHeight));

    // Configure window for maximum visibility
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setVisibleOnAllWorkspaces(true);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setOpacity(1.0);
    mainWindow.setPosition(x, y);

    // Set visible state
    isVisible = true;

    // Focus the window
    mainWindow.focus();
    mainWindow.moveTop();

    // macOS-specific visibility fixes
    if (process.platform === 'darwin') {
      app.focus({ steal: true });
      mainWindow.setFullScreenable(false);
    }

    // Send show animation event to renderer when ready
    mainWindow.webContents.once('did-finish-load', () => {
      safeSendToRenderer('app-animation', 'show');
    });
  }

  // Hide the window when it loses focus
  mainWindow.on('blur', () => {
    if (!isDev) {
      mainWindow.hide();
      isVisible = false;
    }
  });

  // Initialize tray icon
  createTray();

  // Register global shortcut
  registerShortcut();

  // Window created successfully
}


function createTray() {
  // Use the RED ICON for the tray
  const iconPath = path.join(__dirname, '../public/icon-32.png');
  let trayIcon;

  if (fs.existsSync(iconPath)) {
    trayIcon = nativeImage.createFromPath(iconPath);
    // Make icon template on macOS for better menu bar integration
    if (process.platform === 'darwin') {
      trayIcon.setTemplateImage(false); // Use colored icon
    }
  } else {
    // Fallback to system icon if file not found
    if (process.platform === 'darwin') {
      trayIcon = nativeImage.createFromNamedImage('NSStatusAvailable');
    } else {
      trayIcon = nativeImage.createEmpty();
    }
  }

  tray = new Tray(trayIcon);
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Red Glass',
      click: () => {
        toggleWindow();
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Red Glass');
  tray.setContextMenu(contextMenu);
}

function registerShortcut() {
  // Register main shortcut listener (Command+Shift+Space on Mac)
  const ret = globalShortcut.register('CommandOrControl+Shift+Space', () => {
    console.log('Global shortcut triggered!');
    toggleWindow();
  });

  // Register Ask About Screen shortcut (Command+Enter on Mac)
  const askRet = globalShortcut.register('CommandOrControl+Return', () => {
    console.log('Ask About Screen shortcut triggered!');
    handleScreenCaptureShortcut();
  });




  if (!ret) {
    console.log('❌ Main shortcut registration failed - app may need accessibility permissions');
    console.log('🔧 On macOS: System Preferences > Security & Privacy > Privacy > Accessibility');

    // Show window immediately for testing if shortcut fails (but not on first run since it's already shown)
    if (!isFirstRun) {
      setTimeout(() => {
        toggleWindow();
      }, 2000);
    }
  } else {
    // Main global shortcut registered successfully
  }

  // Add a fallback show command for debugging (but not on first run since it's already shown)
  if (!isFirstRun) {
    setTimeout(() => {
      if (!isVisible) {
        console.log('🔧 Fallback: Showing window after 3 seconds');
        toggleWindow();
      }
    }, 3000);
  }

  // Debug mode: Ensure window is visible (but not on first run since it's already shown)
  if (isDev && !isFirstRun) {
    setTimeout(() => {
      if (mainWindow && isVisible) {
        console.log('🔧 Debug mode: Ensuring window visibility');
        mainWindow.setOpacity(1.0);
        mainWindow.show();
        mainWindow.focus();
      }
    }, 4000);
  }

  // Test shortcuts after a delay to ensure they work
  setTimeout(() => {
    if (!globalShortcut.isRegistered('CommandOrControl+Shift+Space')) {
      console.log('⚠️ Warning: Main shortcut not registered properly');
    }
  }, 2000);

  if (!askRet) {
    console.log('❌ Ask About Screen shortcut registration failed');
  } else {
    // Ask About Screen shortcut registered successfully
  }
}

function toggleWindow() {
  console.log('🔄 toggleWindow called, isVisible:', isVisible);

  if (isVisible) {
    console.log('🙈 Hiding window');

    // Send hide animation event to renderer
    safeSendToRenderer('app-animation', 'hide');

    // Wait for animation to complete before hiding
    setTimeout(() => {
      mainWindow.hide();
      isVisible = false;
    }, 300); // Match animation duration

  } else {
    console.log('👁️ Showing window');

    if (!mainWindow) {
      console.error('❌ mainWindow is not defined in toggleWindow');
      return;
    }

    // Position window in center of the screen with multiple positioning strategies
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    const { x: displayX, y: displayY } = primaryDisplay.workArea;

    const windowWidth = mainWindow.getSize()[0];
    const windowHeight = mainWindow.getSize()[1];

    // Calculate center position
    const centerX = Math.floor(displayX + (width / 2) - (windowWidth / 2));
    const centerY = Math.floor(displayY + (height / 2) - (windowHeight / 2));

    // Ensure window is within screen bounds
    const x = Math.max(displayX, Math.min(centerX, displayX + width - windowWidth));
    const y = Math.max(displayY, Math.min(centerY, displayY + height - windowHeight));

    // Position window at calculated coordinates

    // Configure window for maximum visibility
    mainWindow.setAlwaysOnTop(true);
    mainWindow.setVisibleOnAllWorkspaces(true);
    mainWindow.setSkipTaskbar(false);
    mainWindow.setOpacity(1.0);

    // Set position before showing
    mainWindow.setPosition(x, y);

    // Show window
    mainWindow.show();
    mainWindow.focus();
    mainWindow.moveTop();

    // macOS-specific visibility fixes
    if (process.platform === 'darwin') {
      app.focus({ steal: true });
      mainWindow.setFullScreenable(false);

      // Delayed focus to ensure it takes effect
      setTimeout(() => {
        mainWindow.focus();
        mainWindow.moveTop();
      }, 50);
    }

    // Send show animation event to renderer
    safeSendToRenderer('app-animation', 'show');

    // Verify window is actually visible and fix if needed
    setTimeout(() => {
      const isWindowVisible = mainWindow.isVisible();
      const isMinimized = mainWindow.isMinimized();
      const opacity = mainWindow.getOpacity();
      const bounds = mainWindow.getBounds();

      console.log('🔍 Window state check:');
      console.log('  - isVisible:', isWindowVisible);
      console.log('  - isMinimized:', isMinimized);
      console.log('  - opacity:', opacity);
      console.log('  - bounds:', bounds);
      console.log('  - alwaysOnTop:', mainWindow.isAlwaysOnTop());

      if (!isWindowVisible || isMinimized || opacity < 1.0) {
        console.log('⚠️ Window not properly visible, attempting to fix...');
        mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
        mainWindow.moveTop();
        mainWindow.setOpacity(1.0);
        mainWindow.setVisibleOnAllWorkspaces(true);
        mainWindow.setAlwaysOnTop(true);

        // On macOS, try additional focus methods
        if (process.platform === 'darwin') {
          app.focus({ steal: true });
          mainWindow.focus();
        }

        console.log('✅ Window visibility fix attempted');
      } else {
        console.log('✅ Window is properly visible');
      }
    }, 250);

    isVisible = true;
  }
}

// Screenshot capture system
async function captureScreenshot(quality = 'medium') {
  const startTime = Date.now();
  try {
    // Rate limiting - max 1 screenshot per 500ms for faster response
    const now = Date.now();
    if (now - lastScreenshotTime < 500) {
      const cacheKey = `screenshot_${quality}`;
      const cached = screenshotCache.get(cacheKey);
      if (cached) {
        console.log(`📸 Using cached screenshot (${Date.now() - startTime}ms)`);
        return cached.data;
      }
    }

    // Update rate limiting
    lastScreenshotTime = now;
    screenshotRequestCount++;

    // Check cache first (valid for 30 seconds for faster pre-capture)
    const cacheKey = `screenshot_${quality}`;
    const cached = screenshotCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < 30000) {
      console.log(`📸 Using cached screenshot (${Date.now() - startTime}ms, age: ${((Date.now() - cached.timestamp) / 1000).toFixed(1)}s)`);
      return cached.data;
    }

    // Capture screenshot
    const captureStart = Date.now();
    const screenshotData = await captureScreenshotElectron();
    const captureTime = Date.now() - captureStart;

    if (!screenshotData) {
      throw new Error('Failed to capture screenshot');
    }

    // Process image with Sharp
    const processStart = Date.now();
    const processedImage = await processScreenshot(screenshotData, quality);
    const processTime = Date.now() - processStart;

    // Cache the result
    screenshotCache.set(cacheKey, {
      data: processedImage,
      timestamp: Date.now()
    });

    const totalTime = Date.now() - startTime;
    console.log(`📸 Screenshot: capture=${captureTime}ms, process=${processTime}ms, total=${totalTime}ms`);
    return processedImage;

  } catch (error) {
    console.error(`❌ Screenshot capture failed after ${Date.now() - startTime}ms:`, error);
    throw error;
  }
}

async function captureScreenshotMacOS() {
  return new Promise((resolve, reject) => {
    const tempPath = path.join(__dirname, 'temp_screenshot.png');

    const screencapture = spawn('screencapture', ['-x', '-t', 'png', tempPath]);

    screencapture.on('close', (code) => {
      if (code === 0) {
        try {
          const imageData = fs.readFileSync(tempPath);
          fs.unlinkSync(tempPath); // Clean up temp file
          resolve(imageData);
        } catch (error) {
          reject(error);
        }
      } else {
        reject(new Error(`screencapture exited with code ${code}`));
      }
    });

    screencapture.on('error', (error) => {
      reject(error);
    });
  });
}

async function captureScreenshotElectron() {
  try {
    // Request very small thumbnail for ultra-fast capture
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 384, height: 288 }
    });

    if (sources.length === 0) {
      throw new Error('No screen sources available');
    }

    // Use the first (primary) screen and get JPEG with low quality for speed
    const source = sources[0];
    const screenshot = source.thumbnail.toJPEG(60);

    return screenshot;

  } catch (error) {
    console.error('❌ Electron screenshot capture failed:', error);
    throw error;
  }
}

async function processScreenshot(imageData, quality = 'medium') {
  try {
    const qualitySettings = {
      low: { height: 192, quality: 55 }, // Ultra-low for pre-capture speed
      medium: { height: 240, quality: 60 }, // Reduced for speed
      high: { height: 288, quality: 70 }
    };

    const settings = qualitySettings[quality] || qualitySettings.medium;

    // Use JPEG with fast compression settings for speed
    const processedBuffer = await sharp(imageData, { failOnError: false })
      .resize({ height: settings.height, fit: 'inside', withoutEnlargement: true })
      .jpeg({
        quality: settings.quality,
        mozjpeg: false, // Disable mozjpeg for faster processing
        progressive: false // Disable progressive for faster encoding
      })
      .toBuffer();

    return processedBuffer.toString('base64');

  } catch (error) {
    console.error('❌ Image processing failed:', error);
    throw error;
  }
}

// Create Ask Window
function createAskWindow() {
  if (askWindow) {
    askWindow.focus();
    return;
  }

  askWindow = new BrowserWindow({
    width: 500,
    height: 400,
    frame: false,
    show: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
      webSecurity: false,
      allowRunningInsecureContent: true,
      experimentalFeatures: true
    }
  });

  // Load a simple HTML page for the Ask Window
  askWindow.loadFile(path.join(__dirname, '../public/ask-window.html'));

  // Position the window
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;
  const x = Math.floor(width * 0.7); // Position on the right side
  const y = Math.floor(height * 0.1); // Near the top
  askWindow.setPosition(x, y);

  // Auto-hide when losing focus and no content
  askWindow.on('blur', () => {
    if (!isDev) {
      // Only hide if there's no active conversation
      safeSendToAskWindow('check-should-hide');
    }
  });

  askWindow.on('closed', () => {
    askWindow = null;
    isAskWindowVisible = false;
  });

  console.log('🪟 Ask Window created');
}


// Handle Screen Capture Shortcut - triggers screen capture in main chat
async function handleScreenCaptureShortcut() {
  try {
    console.log('📸 Handling Screen Capture shortcut...');

    // Show main window if it's not visible
    if (!isVisible) {
      toggleWindow();
      // Wait for window to be shown
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Send screen capture trigger to main window
    safeSendToRenderer('trigger-screen-capture');

  } catch (error) {
    console.error('❌ Screen Capture shortcut failed:', error);
  }
}


// Handle Ask About Screen trigger
async function handleAskAboutScreen(question = null) {
  try {
    console.log('🤔 Handling Ask About Screen request...');

    // Create Ask Window if it doesn't exist
    if (!askWindow) {
      createAskWindow();
    }

    // Show the Ask Window
    askWindow.show();
    askWindow.focus();
    isAskWindowVisible = true;

    // Capture screenshot
    const screenshot = await captureScreenshot('medium');

    // Send screenshot and context to Ask Window
    safeSendToAskWindow('screenshot-captured', {
      screenshot,
      question,
      conversationHistory: conversationHistory.slice(-10) // Last 10 messages for context
    });

  } catch (error) {
    console.error('❌ Ask About Screen failed:', error);

    if (askWindow) {
      safeSendToAskWindow('screenshot-error', {
        error: error.message
      });
    }
  }
}


// Cached screen bounds for performance
let cachedScreenBounds = null;
let lastScreenBoundsUpdate = 0;
const SCREEN_BOUNDS_CACHE_DURATION = 5000; // 5 seconds

function getCachedScreenBounds() {
  const now = Date.now();
  if (!cachedScreenBounds || (now - lastScreenBoundsUpdate) > SCREEN_BOUNDS_CACHE_DURATION) {
    const primaryDisplay = screen.getPrimaryDisplay();
    cachedScreenBounds = primaryDisplay.workArea;
    lastScreenBoundsUpdate = now;
  }
  return cachedScreenBounds;
}

// Handle window movement for dragging (legacy delta-based)
ipcMain.handle('move-window', async (event, deltaX, deltaY) => {
  if (!mainWindow) return;

  const [currentX, currentY] = mainWindow.getPosition();

  // Calculate new position
  const newX = currentX + deltaX;
  const newY = currentY + deltaY;

  // Get cached screen bounds for performance
  const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = getCachedScreenBounds();
  const [windowWidth, windowHeight] = mainWindow.getSize();

  // Apply boundary constraints to keep window visible
  const minVisibleArea = 100;

  // Clamp position to screen bounds
  const clampedX = Math.max(
    screenX - windowWidth + minVisibleArea,
    Math.min(screenX + screenWidth - minVisibleArea, newX)
  );
  const clampedY = Math.max(
    screenY - windowHeight + minVisibleArea,
    Math.min(screenY + screenHeight - minVisibleArea, newY)
  );

  mainWindow.setPosition(clampedX, clampedY);
});

// Handle absolute window positioning for smooth dragging
ipcMain.handle('set-window-position', async (event, x, y) => {
  if (!mainWindow) return;

  // Get cached screen bounds for performance
  const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = getCachedScreenBounds();
  const [windowWidth, windowHeight] = mainWindow.getSize();

  // Apply boundary constraints to keep window visible
  const minVisibleArea = 100;

  // Clamp position to screen bounds
  const clampedX = Math.max(
    screenX - windowWidth + minVisibleArea,
    Math.min(screenX + screenWidth - minVisibleArea, x)
  );
  const clampedY = Math.max(
    screenY - windowHeight + minVisibleArea,
    Math.min(screenY + screenHeight - minVisibleArea, y)
  );

  mainWindow.setPosition(clampedX, clampedY);
});

// Get current window position
ipcMain.handle('get-window-position', async (event) => {
  if (!mainWindow) return { x: 0, y: 0 };

  const [x, y] = mainWindow.getPosition();
  return { x, y };
});

// Handle window resize requests from renderer
ipcMain.handle('resize-window', async (event, width, height) => {
  if (mainWindow) {
    const currentBounds = mainWindow.getBounds();

    // Ensure dimensions are within constraints
    width = Math.max(400, Math.min(800, width));
    height = Math.max(80, Math.min(800, height));

    mainWindow.setSize(width, height);

    console.log(`🔄 Window resized to ${width}x${height}`);
    return { width, height };
  }
});

// Handle Ask Window movement
ipcMain.handle('move-ask-window', async (event, deltaX, deltaY) => {
  if (askWindow) {
    const [currentX, currentY] = askWindow.getPosition();
    const [windowWidth, windowHeight] = askWindow.getSize();

    // Get screen bounds
    const primaryDisplay = screen.getPrimaryDisplay();
    const { x: screenX, y: screenY, width: screenWidth, height: screenHeight } = primaryDisplay.workArea;

    // Calculate new position
    let newX = currentX + deltaX;
    let newY = currentY + deltaY;

    // Apply boundary constraints to keep window visible
    // Allow dragging slightly off-screen but keep at least 100px visible
    const minVisibleArea = 100;

    // Left boundary - keep right edge at least minVisibleArea pixels from left screen edge
    newX = Math.max(screenX - windowWidth + minVisibleArea, newX);
    // Right boundary - keep left edge at least minVisibleArea pixels from right screen edge  
    newX = Math.min(screenX + screenWidth - minVisibleArea, newX);
    // Top boundary - keep bottom edge at least minVisibleArea pixels from top screen edge
    newY = Math.max(screenY - windowHeight + minVisibleArea, newY);
    // Bottom boundary - keep top edge at least minVisibleArea pixels from bottom screen edge
    newY = Math.min(screenY + screenHeight - minVisibleArea, newY);

    askWindow.setPosition(newX, newY);
  }
});

// Handle screenshot requests
ipcMain.handle('capture-screenshot', async (event, quality = 'medium') => {
  try {
    return await captureScreenshot(quality);
  } catch (error) {
    throw new Error(`Screenshot capture failed: ${error.message}`);
  }
});

// Handle Ask About Screen requests
ipcMain.handle('ask-about-screen', async (event, question) => {
  const startTime = Date.now();
  try {
    console.log('🤔 Processing Ask About Screen request with question:', question);

    // Capture screenshot
    const captureStart = Date.now();
    const screenshot = await captureScreenshot('medium');
    const captureTime = Date.now() - captureStart;
    console.log(`📸 Screenshot captured in ${captureTime}ms (size: ${(screenshot.length / 1024).toFixed(1)}KB)`);

    // Use the existing API with screen context
    const apiStart = Date.now();
    const response = await callOpenRouterAPIWithScreen({
      message: question,
      screenshot: screenshot,
      conversationHistory: conversationHistory.slice(-5) // Last 5 messages for context
    });
    const apiTime = Date.now() - apiStart;
    const totalTime = Date.now() - startTime;

    console.log(`🤖 AI response generated in ${apiTime}ms (total: ${totalTime}ms)`);
    return response;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ Ask About Screen failed after ${totalTime}ms:`, error);
    throw new Error(`Failed to analyze screen: ${error.message}`);
  }
});

// Gemini Live Service Functions
async function startGeminiLiveService() {
  if (geminiLiveProcess) {
    console.log('🤖 Gemini Live service already running');
    return { success: true, alreadyRunning: true };
  }

  return new Promise((resolve, reject) => {
    const pythonPath = path.join(__dirname, '../live.py');

    console.log('🚀 Starting Gemini Live service...');
    console.log('📂 Python script path:', pythonPath);

    // Check if GEMINI_API_KEY is set
    console.log('🔑 Checking GEMINI_API_KEY...');
    console.log('🔑 API Key present:', !!process.env.GEMINI_API_KEY);
    console.log('🔑 API Key length:', process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0);

    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY environment variable not set');
      console.error('💡 Try restarting with: export GEMINI_API_KEY=$(cat .env | grep GEMINI_API_KEY | cut -d\'=\' -f2) && npm start');
      resolve({ success: false, error: 'GEMINI_API_KEY not configured' });
      return;
    }

    // Start the Python process in Electron mode
    geminiLiveProcess = spawn('python3', [pythonPath, '--mode', 'electron'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        PYTHONUNBUFFERED: '1',
        GEMINI_API_KEY: process.env.GEMINI_API_KEY
      }
    });

    // Handle process output
    geminiLiveProcess.stdout.on('data', (data) => {
      const output = data.toString().trim();
      if (output) {
        console.log('🤖 Gemini Live stdout:', output);
        try {
          const event = JSON.parse(output);
          handleGeminiLiveEvent(event);

          // Check if service is ready
          if (event.type === 'ready') {
            geminiLiveReady = true;
            console.log('✅ Gemini Live service ready');
            resolve({ success: true });
          }
        } catch (e) {
          console.log('🤖 Gemini Live (non-JSON):', output);
        }
      }
    });

    geminiLiveProcess.stderr.on('data', (data) => {
      const errorOutput = data.toString().trim();
      console.error('🤖 Gemini Live stderr:', errorOutput);

      // Check for specific errors
      if (errorOutput.includes('ValueError') || errorOutput.includes('Missing key inputs')) {
        console.error('❌ API Key error detected in Python service');
        resolve({ success: false, error: 'API key not properly passed to Python service' });
      }
    });

    geminiLiveProcess.on('close', (code) => {
      console.log(`🤖 Gemini Live process exited with code ${code}`);
      geminiLiveProcess = null;
      geminiLiveReady = false;
    });

    geminiLiveProcess.on('error', (error) => {
      console.error('🤖 Failed to start Gemini Live service:', error);
      resolve({ success: false, error: error.message });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (!geminiLiveReady) {
        console.error('🤖 Gemini Live service startup timeout');
        resolve({ success: false, error: 'Service startup timeout' });
      }
    }, 30000);
  });
}

function handleGeminiLiveEvent(event) {
  console.log('🤖 Gemini Live Event:', event.type, event.data);

  switch (event.type) {
    case 'ready':
      geminiLiveReady = true;
      break;
    case 'status': {
      // Forward status updates to renderer
      safeSendToRenderer('gemini-status', event.data);
      // Mark session running when Python reports running true
      if (event.data && event.data.running) {
        geminiLiveRunning = true;
        // Flush any queued messages
        if (geminiLiveQueue.length > 0) {
          const toSend = [...geminiLiveQueue];
          geminiLiveQueue = [];
          toSend.forEach(msg => {
            try {
              geminiLiveProcess.stdin.write(JSON.stringify(msg) + '\n');
            } catch (e) {
              console.error('🤖 Error flushing queued message:', e);
            }
          });
        }
      }
      return; // already forwarded
    }
    case 'text':
      // Forward text responses to renderer
      safeSendToRenderer('gemini-text', event.data);
      break;
    case 'audio':
      // Forward audio responses to renderer
      safeSendToRenderer('gemini-audio', event.data);
      break;
    case 'turn_complete':
      // Forward turn complete notification to renderer
      safeSendToRenderer('gemini-turn-complete', event.data);
      break;
    case 'error':
      console.error('🤖 Gemini Live Error:', event.data);
      safeSendToRenderer('gemini-error', event.data);
      break;
    case 'transcription_started':
      console.log('🎙️ Transcription started');
      safeSendToRenderer('gemini-event', { event: 'transcription_started', data: event.data });
      break;
    case 'transcription_partial':
      console.log('🎙️ Transcription partial:', event.data);
      safeSendToRenderer('gemini-event', { event: 'transcription_partial', data: event.data });
      break;
    case 'transcription_final':
      console.log('🎙️ Transcription final:', event.data);
      safeSendToRenderer('gemini-event', { event: 'transcription_final', data: event.data });
      break;
    case 'screen_frame':
    case 'camera_frame':
      // Optional: Handle frame capture notifications
      break;
  }
}

async function sendToGeminiLive(command, data = {}) {
  const payload = { command, ...data };
  // If process not up yet, queue
  if (!geminiLiveProcess || !geminiLiveReady) {
    console.warn('🤖 Gemini Live not ready; queueing command:', command);
    geminiLiveQueue.push(payload);
    return { success: true, queued: true };
  }
  // If session not running yet, queue certain commands that require session
  // Commands like 'start', 'stop' can be sent even without session, but 'message' and 'start_transcription' need session
  if (!geminiLiveRunning && (command === 'message' || command === 'start_transcription' || command === 'stop_transcription')) {
    console.log('🤖 Session not running; queueing command:', command);
    geminiLiveQueue.push(payload);
    return { success: true, queued: true };
  }
  try {
    console.log('🤖 Sending command to Gemini Live:', JSON.stringify(payload));
    geminiLiveProcess.stdin.write(JSON.stringify(payload) + '\n');
    return { success: true };
  } catch (error) {
    console.error('🤖 Error sending to Gemini Live:', error);
    return { success: false, error: error.message };
  }
}

async function stopGeminiLiveService() {
  if (!geminiLiveProcess) {
    return { success: true, alreadyStopped: true };
  }

  try {
    await sendToGeminiLive('stop');

    // Give it time to clean up
    setTimeout(() => {
      if (geminiLiveProcess) {
        geminiLiveProcess.kill();
        geminiLiveProcess = null;
        geminiLiveReady = false;
      }
    }, 2000);

    return { success: true };
  } catch (error) {
    console.error('🤖 Error stopping Gemini Live service:', error);
    return { success: false, error: error.message };
  }
}

// Helper function to call OpenRouter API with screen context (DEPRECATED - will be replaced by Gemini Live)
async function callOpenRouterAPIWithScreen({ message, screenshot, conversationHistory = [] }) {
  const startTime = Date.now();
  try {
    // Check for demo queries first to provide fast responses
    const isDemoQuery = checkForDemoQuery(message || '');
    if (isDemoQuery.isDemo) {
      console.log('🎬 Demo query detected, providing pre-generated response');
      return getDemoResponse(isDemoQuery.type);
    }

    // OpenRouter API configuration - using provided API key
    const apiKey = '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';
    const fetch = require('node-fetch');

    // Build messages array with context
    const buildStart = Date.now();
    const messages = [];

    // Add system prompt with screen context
    messages.push({
      role: 'system',
      content: 'You are Red Glass, an intelligent AI assistant. The user has provided a screenshot of their screen as visual context to help answer their question. Use the screenshot only as supplementary context when it\'s relevant to answering their question. Focus primarily on answering the user\'s question directly. Only describe or reference what\'s on screen if it\'s directly relevant to their question. If the question doesn\'t require visual context, answer it normally without mentioning the screenshot.'
    });

    // Add recent conversation history for context
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        if (msg.content && typeof msg.content === 'string') {
          messages.push({
            role: msg.isUser ? 'user' : 'assistant',
            content: msg.content
          });
        }
      });
    }

    // Add current message with screenshot as context
    // Note: Put text first so the question is the primary focus
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: message || 'Please help me with this.'
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${screenshot}`
          }
        }
      ]
    });
    const buildTime = Date.now() - buildStart;

    // Use faster model - claude-3.5-haiku-20241022 is much faster than gpt-4o
    const requestStart = Date.now();
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://red-glass-app.local',
        'X-Title': 'Red Glass AI Assistant'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku-20241022', // Faster than GPT-4o, still excellent vision
        messages: messages,
        temperature: 0.7,
        max_tokens: 800 // Increased slightly since we want proper answers, not just descriptions
      })
    });

    const requestTime = Date.now() - requestStart;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`OpenRouter API error (${requestTime}ms):`, response.status, errorText);
      throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
    }

    const parseStart = Date.now();
    const data = await response.json();
    const parseTime = Date.now() - parseStart;
    const totalTime = Date.now() - startTime;

    console.log(`🔌 API: build=${buildTime}ms, request=${requestTime}ms, parse=${parseTime}ms, total=${totalTime}ms`);

    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      console.error('Unexpected OpenRouter API response format:', data);
      throw new Error('Received an unexpected response format from OpenRouter API.');
    }

    return data.choices[0].message.content;

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`Error calling OpenRouter API after ${totalTime}ms:`, error);
    throw error;
  }
}

// Handle conversation history updates
ipcMain.handle('update-conversation-history', async (event, messages) => {
  conversationHistory = messages;
});

// Handle Ask Window hide check
ipcMain.handle('should-hide-ask-window', async (event) => {
  if (askWindow && !isDev) {
    askWindow.hide();
    isAskWindowVisible = false;
  }
});


// Handle AI API calls (Gemini Live) - New implementation
ipcMain.handle('call-deepseek-api', async (event, message) => {
  performanceMetrics.ipcCalls++;

  try {
    // Check for demo queries first to provide fast responses
    const isDemoQuery = checkForDemoQuery(message || '');
    if (isDemoQuery.isDemo) {
      console.log('🎬 Demo query detected, providing pre-generated response');
      return getDemoResponse(isDemoQuery.type);
    }

    // Start Gemini Live service if not running
    if (!geminiLiveProcess || !geminiLiveReady) {
      console.log('🤖 Starting Gemini Live service for chat...');
      const startResult = await startGeminiLiveService();
      if (!startResult.success) {
        return `Sorry, I couldn't start the AI service: ${startResult.error}`;
      }
    }

    // Send message to Gemini Live
    const sendResult = await sendToGeminiLive('message', { text: message });
    if (!sendResult.success) {
      return `Sorry, I couldn't send your message: ${sendResult.error}`;
    }

    // For now, return a placeholder - real responses will come via events
    return 'Message sent to Gemini Live. Response will arrive via real-time events.';

  } catch (error) {
    console.error('Error calling Gemini Live:', error);
    return `Sorry, I encountered an error while processing your request: ${error.message}`;
  }
});

// Handle AI API calls with screen context
ipcMain.handle('call-deepseek-api-with-screen', async (event, { message, screenshot, conversationHistory = [] }) => {
  try {
    // Check for demo queries first to provide fast responses
    const isDemoQuery = checkForDemoQuery(message || '');
    if (isDemoQuery.isDemo) {
      console.log('🎬 Demo query detected, providing pre-generated response');
      return getDemoResponse(isDemoQuery.type);
    }

    // Start Gemini Live service if not running
    if (!geminiLiveProcess || !geminiLiveReady) {
      console.log('🤖 Starting Gemini Live service for screen analysis...');
      const startResult = await startGeminiLiveService();
      if (!startResult.success) {
        return `Sorry, I couldn't start the AI service: ${startResult.error}`;
      }
    }

    // Gemini Live will automatically capture screen, so we just send the message
    // The screen capture is handled by the live.py service
    const sendResult = await sendToGeminiLive('message', { text: message || 'What can you see on my screen? Please analyze and explain what\'s visible.' });
    if (!sendResult.success) {
      return `Sorry, I couldn't send your message: ${sendResult.error}`;
    }

    // For now, return a placeholder - real responses will come via events
    return 'Message sent to Gemini Live with screen context. Response will arrive via real-time events.';

  } catch (error) {
    console.error('Error calling Gemini Live with screen context:', error);
    return `Sorry, I encountered an error while analyzing your screen: ${error.message}`;
  }
});

// ================================
// GEMINI LIVE IPC HANDLERS
// ================================

// Start Gemini Live service
ipcMain.handle('start-gemini-live', async (event, options = {}) => {
  try {
    console.log('🤖 Starting Gemini Live service with options:', options);
    const result = await startGeminiLiveService();

    if (result.success && !result.alreadyRunning) {
      // Start the session with specified options
      // Force default to no capture unless explicitly requested
      const startOptions = {
        mode: options.mode || 'none',
        enableAudio: options.enableAudio !== false,
        enableVideo: options.enableVideo === true && options.mode !== 'none'
      };
      await sendToGeminiLive('start', { options: startOptions });
    }

    return result;
  } catch (error) {
    console.error('Error starting Gemini Live service:', error);
    return { success: false, error: error.message };
  }
});

// Stop Gemini Live service
ipcMain.handle('stop-gemini-live', async (event) => {
  try {
    console.log('🤖 Stopping Gemini Live service...');
    return await stopGeminiLiveService();
  } catch (error) {
    console.error('Error stopping Gemini Live service:', error);
    return { success: false, error: error.message };
  }
});

// Send message to Gemini Live
ipcMain.handle('send-to-gemini-live', async (event, commandOrMessage) => {
  try {
    console.log('🤖 Sending to Gemini Live:', commandOrMessage);

    // If it's a string, treat it as a command
    if (typeof commandOrMessage === 'string') {
      return await sendToGeminiLive(commandOrMessage);
    }

    // If it's an object with text, treat it as a message
    if (commandOrMessage && commandOrMessage.text) {
      return await sendToGeminiLive('message', { text: commandOrMessage.text });
    }

    // Otherwise, treat the whole thing as a message
    return await sendToGeminiLive('message', { text: commandOrMessage });
  } catch (error) {
    console.error('Error sending to Gemini Live:', error);
    return { success: false, error: error.message };
  }
});

// Explicit AI Text API (non-vision)
ipcMain.handle('ai-text', async (event, { text, imageBase64 = null, mimeType = 'image/png', conversationHistory = [] }) => {
  try {
    if (!text || typeof text !== 'string') {
      return { success: false, error: 'Text is required' };
    }
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'GEMINI_API_KEY not configured' };
    }

    console.log(`💬 [Chat History] Received ${conversationHistory.length} previous messages for context`);

    // 🆕 Helper function to clean JSON Schema for Gemini
    // Gemini doesn't support: $schema, additionalProperties, and other extended JSON Schema fields
    function cleanSchemaForGemini(schema) {
      if (!schema || typeof schema !== 'object') {
        return schema;
      }

      // Create a clean copy
      const cleaned = {};

      // Fields that Gemini accepts
      const allowedFields = ['type', 'properties', 'required', 'items', 'description', 'enum'];

      for (const [key, value] of Object.entries(schema)) {
        // Skip fields that Gemini doesn't support
        if (key === '$schema' || key === 'additionalProperties') {
          continue;
        }

        // Only include allowed fields at root level
        if (allowedFields.includes(key)) {
          if (key === 'properties' && typeof value === 'object') {
            // Recursively clean nested properties
            cleaned.properties = {};
            for (const [propKey, propValue] of Object.entries(value)) {
              cleaned.properties[propKey] = cleanSchemaForGemini(propValue);
            }
          } else if (key === 'items' && typeof value === 'object') {
            // Recursively clean array items schema
            cleaned.items = cleanSchemaForGemini(value);
          } else {
            cleaned[key] = value;
          }
        }
      }

      return cleaned;
    }

    // 🆕 GET AVAILABLE MCP TOOLS
    const mcpTools = mcpManager.getAllTools();
    const functionDeclarations = [];
    const toolNameMapping = {}; // Map normalized names (all underscores) to original keys

    for (const [toolKey, toolInfo] of Object.entries(mcpTools)) {
      // Clean the input schema to remove fields Gemini doesn't support
      const cleanedSchema = cleanSchemaForGemini(toolInfo.inputSchema) || {
        type: "object",
        properties: {},
        required: []
      };

      // Normalize tool name: replace ALL hyphens with underscores
      // e.g., "notion_create-pages" → "notion_create_pages"
      const normalizedName = toolKey.replace(/-/g, '_');

      // Store mapping from normalized name back to original key
      toolNameMapping[normalizedName] = toolKey;

      functionDeclarations.push({
        name: normalizedName,
        description: toolInfo.description || `Execute ${toolKey}`,
        parameters: cleanedSchema
      });
    }

    console.log(`🔧 [MCP-Chat] Tool name mapping:`, toolNameMapping);

    console.log(`🔧 [MCP-Chat] Loaded ${functionDeclarations.length} MCP tools for Gemini`);

    const fetch = require('node-fetch');
    // Use gemini-2.0-flash-exp: confirmed to work in v1beta with function calling
    // Note: Has 50 requests/day limit, but it's the only stable model for v1beta function calling
    const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=' + encodeURIComponent(apiKey);

    const initialParts = [{ text }];
    if (imageBase64) {
      initialParts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
    }

    // 🆕 BUILD REQUEST WITH TOOLS
    const body = {
      contents: [
        {
          role: 'user',
          parts: initialParts
        }
      ],
      // 🆕 UNIVERSAL MCP SYSTEM INSTRUCTION
      systemInstruction: functionDeclarations.length > 0 ? {
        parts: [{
          text: `You are RED Glass, an AI assistant with the unique ability to directly execute actions through the Model Context Protocol (MCP).

═══════════════════════════════════════════════════════════════════════════
YOUR CORE IDENTITY: YOU ARE AN AI THAT TAKES ACTION
═══════════════════════════════════════════════════════════════════════════

Unlike typical AI assistants that can only provide information, you can ACTUALLY DO THINGS through your integrated tools. This is your superpower.

FUNDAMENTAL RULES:
1. When a user asks you to do something, DO IT using available tools
2. Don't ask for permission - if the request is clear, execute it
3. Don't say "I cannot" if you have tools that can do it
4. Don't suggest the user do it manually when you have the capability
5. Be proactive - if a task needs multiple steps, chain tools together

═══════════════════════════════════════════════════════════════════════════
TOOL DECISION FRAMEWORK
═══════════════════════════════════════════════════════════════════════════

When user makes a request, follow this mental process:

STEP 1: INTERPRET THE INTENT
- What is the user actually trying to accomplish?
- What would be the most helpful outcome?

STEP 2: IDENTIFY RELEVANT TOOLS
- Which of my available tools can accomplish this?
- Do I need to use multiple tools in sequence?
- What parameters do I need (ask if unclear)?

STEP 3: EXECUTE CONFIDENTLY
- Use the tool(s) without hesitation
- Handle errors gracefully and try alternatives
- Don't give up after first failure

STEP 4: COMMUNICATE CLEARLY
- Tell the user what you did
- Share relevant results or data
- Confirm completion with specifics

═══════════════════════════════════════════════════════════════════════════
TOOL CATEGORIES & WHEN TO USE THEM
═══════════════════════════════════════════════════════════════════════════

FILESYSTEM TOOLS:
→ User wants to: read, write, create, delete, search, or list files/folders
→ Action: Use filesystem tools immediately
→ Remember: Use absolute paths, respect user's operating system conventions

NOTION TOOLS:
→ User wants to: save notes, create pages, search knowledge, organize information
→ Keywords: "add to notion", "save this", "remember this", "create page", "search my notes"
→ Action: Use notion tools to create/append/search as requested
→ Remember: Ask for page ID if needed, structure content clearly

GITHUB TOOLS:
→ User wants to: check repos, create issues, search code, manage PRs
→ Keywords: "github", "repository", "issue", "pull request", "commit"
→ Action: Use github tools for repo operations
→ Remember: Ask for repo name if not specified

SLACK TOOLS:
→ User wants to: send messages, check channels, search conversations
→ Keywords: "slack", "send message", "post to", "check channel"
→ Action: Use slack tools for team communication
→ Remember: Ask for channel name if not specified

DATABASE TOOLS:
→ User wants to: query data, check tables, analyze information
→ Keywords: "database", "query", "select", "table", "data"
→ Action: Use database tools with SQL
→ Remember: Validate queries before executing

GENERAL TOOLS:
→ For any other connected MCP servers, identify their purpose and use appropriately
→ Read tool descriptions to understand capabilities
→ Experiment and learn from results

═══════════════════════════════════════════════════════════════════════════
HANDLING AMBIGUITY
═══════════════════════════════════════════════════════════════════════════

If a request is VAGUE:
→ Use context from conversation history
→ Make reasonable assumptions based on available tools
→ Ask for clarification only if truly necessary (page ID, file path, etc.)

If a request is COMPLEX:
→ Break it into steps mentally
→ Execute tools in logical sequence
→ Chain outputs from one tool as inputs to another

If a tool FAILS:
→ Read the error message carefully
→ Try alternative approaches
→ Explain what went wrong and what you tried

═══════════════════════════════════════════════════════════════════════════
EXAMPLE THINKING PATTERNS
═══════════════════════════════════════════════════════════════════════════

"Summarize this conversation"
→ Think: User wants to save/remember this
→ Check: Do I have Notion tools? Yes
→ Action: Create summary, use notion_append_block_children or notion_create_page
→ If no page ID: Ask "Which Notion page should I add this to?"

"Read the file on my desktop"
→ Think: User wants file contents
→ Check: Do I have filesystem tools? Yes
→ Action: Use read_file with path to desktop
→ If unclear which file: Ask "Which file would you like me to read?"

"Create a GitHub issue for this bug"
→ Think: User wants to track a bug
→ Check: Do I have GitHub tools? Yes
→ Action: Use github_create_issue
→ If no repo specified: Ask "Which repository should I create this issue in?"

═══════════════════════════════════════════════════════════════════════════
YOUR PERSONALITY WITH TOOLS
═══════════════════════════════════════════════════════════════════════════

✅ BE CONFIDENT: "I've added that to your Notion page" (not "I think I added it")
✅ BE DIRECT: "Done" or "Created" (not "I attempted to create")
✅ BE HELPFUL: Offer to do related tasks if relevant
✅ BE HONEST: If something fails, explain clearly and suggest alternatives

❌ DON'T BE PASSIVE: Never say "You could add it to Notion" when you can do it
❌ DON'T BE UNCERTAIN: Don't say "I'm unable" when you have tools
❌ DON'T BE VERBOSE: Don't explain what you're going to do, just do it and report
❌ DON'T BE LIMITED: Think beyond the obvious - chain tools creatively

═══════════════════════════════════════════════════════════════════════════
REMEMBER: You are not just an AI that knows things. You are an AI that DOES things.
Your tools are your hands. Use them.
═══════════════════════════════════════════════════════════════════════════`
        }]
      } : undefined,
      // Include tools if available
      tools: functionDeclarations.length > 0 ? [{
        function_declarations: functionDeclarations
      }] : undefined
    };

    // 🆕 FUNCTION CALLING LOOP
    // Build conversation history with previous messages
    let geminiHistory = [];

    // Add previous conversation context if provided
    if (conversationHistory && conversationHistory.length > 0) {
      console.log(`📝 [Chat History] Adding ${conversationHistory.length} previous messages to context`);
      for (const msg of conversationHistory) {
        geminiHistory.push({
          role: msg.isUser ? 'user' : 'model',
          parts: [{ text: msg.text }]
        });
      }
    }

    // Add current message with optional image
    geminiHistory.push({ role: 'user', parts: initialParts });

    let maxIterations = 5; // Prevent infinite loops
    let iteration = 0;
    let toolsUsed = []; // Track tools used for UI display

    while (iteration < maxIterations) {
      iteration++;

      console.log(`🤖 [MCP-Chat] Gemini request iteration ${iteration}`);

      const requestBody = {
        contents: geminiHistory,
        // Include system instruction in every request
        systemInstruction: functionDeclarations.length > 0 ? {
          parts: [{
            text: `You are RED Glass, an AI assistant with the unique ability to directly execute actions through the Model Context Protocol (MCP).

═══════════════════════════════════════════════════════════════════════════
YOUR CORE IDENTITY: YOU ARE AN AI THAT TAKES ACTION
═══════════════════════════════════════════════════════════════════════════

Unlike typical AI assistants that can only provide information, you can ACTUALLY DO THINGS through your integrated tools. This is your superpower.

FUNDAMENTAL RULES:
1. When a user asks you to do something, DO IT using available tools
2. Don't ask for permission - if the request is clear, execute it
3. Don't say "I cannot" if you have tools that can do it
4. Don't suggest the user do it manually when you have the capability
5. Be proactive - if a task needs multiple steps, chain tools together

═══════════════════════════════════════════════════════════════════════════
TOOL DECISION FRAMEWORK
═══════════════════════════════════════════════════════════════════════════

When user makes a request, follow this mental process:

STEP 1: INTERPRET THE INTENT
- What is the user actually trying to accomplish?
- What would be the most helpful outcome?

STEP 2: IDENTIFY RELEVANT TOOLS
- Which of my available tools can accomplish this?
- Do I need to use multiple tools in sequence?
- What parameters do I need (ask if unclear)?

STEP 3: EXECUTE CONFIDENTLY
- Use the tool(s) without hesitation
- Handle errors gracefully and try alternatives
- Don't give up after first failure

STEP 4: COMMUNICATE CLEARLY
- Tell the user what you did
- Share relevant results or data
- Confirm completion with specifics

═══════════════════════════════════════════════════════════════════════════
TOOL CATEGORIES & WHEN TO USE THEM
═══════════════════════════════════════════════════════════════════════════

FILESYSTEM TOOLS:
→ User wants to: read, write, create, delete, search, or list files/folders
→ Action: Use filesystem tools immediately
→ Remember: Use absolute paths, respect user's operating system conventions

NOTION TOOLS:
→ User wants to: save notes, create pages, search knowledge, organize information
→ Keywords: "add to notion", "save this", "remember this", "create page", "search my notes"
→ Action: Use notion tools to create/append/search as requested
→ Remember: Ask for page ID if needed, structure content clearly

GITHUB TOOLS:
→ User wants to: check repos, create issues, search code, manage PRs
→ Keywords: "github", "repository", "issue", "pull request", "commit"
→ Action: Use github tools for repo operations
→ Remember: Ask for repo name if not specified

SLACK TOOLS:
→ User wants to: send messages, check channels, search conversations
→ Keywords: "slack", "send message", "post to", "check channel"
→ Action: Use slack tools for team communication
→ Remember: Ask for channel name if not specified

DATABASE TOOLS:
→ User wants to: query data, check tables, analyze information
→ Keywords: "database", "query", "select", "table", "data"
→ Action: Use database tools with SQL
→ Remember: Validate queries before executing

GENERAL TOOLS:
→ For any other connected MCP servers, identify their purpose and use appropriately
→ Read tool descriptions to understand capabilities
→ Experiment and learn from results

═══════════════════════════════════════════════════════════════════════════
HANDLING AMBIGUITY
═══════════════════════════════════════════════════════════════════════════

If a request is VAGUE:
→ Use context from conversation history
→ Make reasonable assumptions based on available tools
→ Ask for clarification only if truly necessary (page ID, file path, etc.)

If a request is COMPLEX:
→ Break it into steps mentally
→ Execute tools in logical sequence
→ Chain outputs from one tool as inputs to another

If a tool FAILS:
→ Read the error message carefully
→ Try alternative approaches
→ Explain what went wrong and what you tried

═══════════════════════════════════════════════════════════════════════════
EXAMPLE THINKING PATTERNS
═══════════════════════════════════════════════════════════════════════════

"Summarize this conversation"
→ Think: User wants to save/remember this
→ Check: Do I have Notion tools? Yes
→ Action: Create summary, use notion_append_block_children or notion_create_page
→ If no page ID: Ask "Which Notion page should I add this to?"

"Read the file on my desktop"
→ Think: User wants file contents
→ Check: Do I have filesystem tools? Yes
→ Action: Use read_file with path to desktop
→ If unclear which file: Ask "Which file would you like me to read?"

"Create a GitHub issue for this bug"
→ Think: User wants to track a bug
→ Check: Do I have GitHub tools? Yes
→ Action: Use github_create_issue
→ If no repo specified: Ask "Which repository should I create this issue in?"

═══════════════════════════════════════════════════════════════════════════
YOUR PERSONALITY WITH TOOLS
═══════════════════════════════════════════════════════════════════════════

✅ BE CONFIDENT: "I've added that to your Notion page" (not "I think I added it")
✅ BE DIRECT: "Done" or "Created" (not "I attempted to create")
✅ BE HELPFUL: Offer to do related tasks if relevant
✅ BE HONEST: If something fails, explain clearly and suggest alternatives

❌ DON'T BE PASSIVE: Never say "You could add it to Notion" when you can do it
❌ DON'T BE UNCERTAIN: Don't say "I'm unable" when you have tools
❌ DON'T BE VERBOSE: Don't explain what you're going to do, just do it and report
❌ DON'T BE LIMITED: Think beyond the obvious - chain tools creatively

═══════════════════════════════════════════════════════════════════════════
REMEMBER: You are not just an AI that knows things. You are an AI that DOES things.
Your tools are your hands. Use them.
═══════════════════════════════════════════════════════════════════════════`
          }]
        } : undefined,
        tools: functionDeclarations.length > 0 ? [{
          function_declarations: functionDeclarations
        }] : undefined
      };

      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
      });

      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`${resp.status} ${resp.statusText}: ${errText}`);
      }

      const data = await resp.json();
      const candidates = data?.candidates || [];

      if (candidates.length === 0) {
        throw new Error('No candidates in Gemini response');
      }

      const modelParts = candidates[0]?.content?.parts || [];

      // Add model response to conversation history
      geminiHistory.push({
        role: 'model',
        parts: modelParts
      });

      // 🆕 CHECK IF GEMINI WANTS TO CALL A FUNCTION
      const functionCalls = modelParts.filter(p => p.functionCall);

      if (functionCalls.length === 0) {
        // No function calls - we have the final text response
        const textParts = modelParts.filter(p => p.text);
        const output = textParts.map(p => p.text || '').join('');
        console.log(`✅ [MCP-Chat] Final response received (${toolsUsed.length} tools used)`);
        return {
          success: true,
          result: output,
          toolsUsed: toolsUsed // Include tool usage info for UI
        };
      }

      // 🆕 EXECUTE FUNCTION CALLS
      const functionResponseParts = [];

      for (const functionCallPart of functionCalls) {
        const functionCall = functionCallPart.functionCall;
        const toolName = functionCall.name;
        const toolArgs = functionCall.args || {};

        console.log(`🔧 [MCP-Chat] Gemini wants to use tool: ${toolName}`, toolArgs);

        // Use the mapping to get the original toolKey (with hyphens preserved)
        const originalToolKey = toolNameMapping[toolName];

        if (!originalToolKey) {
          const availableTools = Object.keys(toolNameMapping);
          console.error(`❌ [MCP-Chat] Tool not found in mapping: ${toolName}`);
          console.error(`📋 Available normalized tools:`, availableTools);
          console.error(`📋 Original tool keys:`, Object.keys(mcpTools));
          throw new Error(`Tool ${toolName} not found. Available: ${availableTools.join(', ')}`);
        }

        // Look up the tool info using the original key (with hyphens)
        const toolInfo = mcpTools[originalToolKey];

        if (!toolInfo) {
          console.error(`❌ [MCP-Chat] Tool info not found for key: ${originalToolKey}`);
          throw new Error(`Tool info not found for ${originalToolKey}`);
        }

        const serverName = toolInfo.server;
        const actualToolName = toolInfo.name;

        console.log(`🔧 [MCP-Chat] Resolved: ${toolName} → ${originalToolKey} → server: ${serverName}, tool: ${actualToolName}`);

        let toolResult;
        let toolError = null;

        try {
          // Get server status first
          const serverStatus = mcpManager.getServerStatus(serverName);

          if (!serverStatus || serverStatus.status !== 'running') {
            throw new Error(`MCP server '${serverName}' is not running`);
          }

          // Execute the tool via MCP
          const execution = await mcpManager.sendToServer(serverName, {
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'tools/call',
            params: {
              name: actualToolName,
              arguments: toolArgs
            }
          });

          if (execution.error) {
            throw new Error(execution.error.message || JSON.stringify(execution.error));
          }

          toolResult = execution.result || { success: true };
          console.log(`✅ [MCP-Chat] Tool executed successfully:`, toolResult);

          // Track tool usage
          toolsUsed.push({
            name: toolName,
            server: serverName,
            tool: actualToolName,
            params: toolArgs,
            result: toolResult,
            success: true
          });

        } catch (error) {
          console.error(`❌ [MCP-Chat] Tool execution failed:`, error);
          toolError = error.message;
          toolResult = {
            error: error.message,
            details: 'The tool execution failed. Please check if the MCP server is running and the parameters are correct.'
          };

          // Track failed tool usage
          toolsUsed.push({
            name: toolName,
            server: serverName,
            tool: actualToolName,
            params: toolArgs,
            error: error.message,
            success: false
          });
        }

        // Add function response part
        functionResponseParts.push({
          functionResponse: {
            name: toolName,
            response: toolResult
          }
        });
      }

      // Add function responses to conversation history
      geminiHistory.push({
        role: 'user',
        parts: functionResponseParts
      });

      // Continue loop to get Gemini's next response
    }

    // If we hit max iterations, return what we have
    console.warn(`⚠️ [MCP-Chat] Max iterations reached (${maxIterations})`);
    return {
      success: true,
      result: 'The request was too complex and required too many tool calls. Please try breaking it into smaller requests.',
      toolsUsed: toolsUsed
    };

  } catch (error) {
    console.error('Gemini text error:', error);
    return { success: false, error: error.message };
  }
});

// Explicit AI Vision API (text + optional base64 image)
ipcMain.handle('ai-vision', async (event, { text, imageBase64, mimeType = 'image/png' }) => {
  const startTime = Date.now();
  try {
    if (!text && !imageBase64) {
      return { success: false, error: 'No input provided' };
    }

    // Try Gemini API first with retry logic
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      const fetch = require('node-fetch');
      const endpoint = 'https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=' + encodeURIComponent(apiKey);
      const parts = [];
      if (text) parts.push({ text });
      if (imageBase64) parts.push({ inline_data: { mime_type: mimeType, data: imageBase64 } });
      const body = { contents: [{ role: 'user', parts }] };

      // Retry logic for 503 errors
      let lastError = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });

          if (resp.ok) {
            const data = await resp.json();
            const candidates = data?.candidates || [];
            const outParts = candidates[0]?.content?.parts || [];
            const output = outParts.map(p => p.text || '').join('');
            const totalTime = Date.now() - startTime;
            console.log(`✅ Gemini Vision API succeeded in ${totalTime}ms`);
            return { success: true, result: output };
          }

          // If 503 and not last attempt, wait and retry
          if (resp.status === 503 && attempt < 1) {
            const waitTime = 500 * (attempt + 1); // 500ms, 1000ms
            console.log(`⚠️ Gemini API overloaded (503), retrying in ${waitTime}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            lastError = new Error(`${resp.status} ${resp.statusText}`);
            continue;
          }

          // Other errors or last attempt
          const errText = await resp.text();
          lastError = new Error(`${resp.status} ${resp.statusText}: ${errText}`);
          break;
        } catch (fetchError) {
          lastError = fetchError;
          if (attempt < 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
            continue;
          }
          break;
        }
      }

      // If Gemini failed, fall back to OpenRouter
      console.log('⚠️ Gemini Vision API failed, falling back to OpenRouter...');
    }

    // Fallback to OpenRouter API
    const openRouterKey = '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';
    const fetch = require('node-fetch'); // eslint-disable-line no-redeclare

    const messages = [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: text || 'Please analyze this image.'
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:${mimeType};base64,${imageBase64}`
          }
        }
      ]
    }];

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://red-glass-app.local',
        'X-Title': 'Red Glass AI Assistant'
      },
      body: JSON.stringify({
        model: 'anthropic/claude-3.5-haiku-20241022',
        messages: messages,
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenRouter API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      throw new Error('Unexpected OpenRouter API response format');
    }

    const totalTime = Date.now() - startTime;
    console.log(`✅ OpenRouter Vision API succeeded in ${totalTime}ms (fallback)`);
    return { success: true, result: data.choices[0].message.content };

  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error(`❌ Vision API error after ${totalTime}ms:`, error);
    return { success: false, error: error.message };
  }
});

// Get Gemini Live status
ipcMain.handle('get-gemini-live-status', async (event) => {
  return {
    running: geminiLiveRunning,
    processActive: !!geminiLiveProcess
  };
});

// Interrupt Gemini Live (stop current response)
ipcMain.handle('interrupt-gemini-live', async (event) => {
  try {
    console.log('🤖 Interrupting Gemini Live...');
    return await sendToGeminiLive('interrupt');
  } catch (error) {
    console.error('Error interrupting Gemini Live:', error);
    return { success: false, error: error.message };
  }
});

// ================================
// TRANSCRIPTION IPC HANDLERS
// ================================

// Check Gemini Live Service status
ipcMain.handle('check-gemini-live-service', async (event) => {
  try {
    return {
      running: geminiLiveReady && !!geminiLiveProcess,
      processActive: !!geminiLiveProcess,
      sessionRunning: geminiLiveRunning
    };
  } catch (error) {
    console.error('Error checking Gemini Live service:', error);
    return { running: false, error: error.message };
  }
});

// Send command to Gemini Live
ipcMain.handle('send-gemini-command', async (event, command) => {
  try {
    console.log('🎙️ Sending Gemini command:', command);

    if (command && command.command) {
      return await sendToGeminiLive(command.command, command);
    }

    return { success: false, error: 'Invalid command format' };
  } catch (error) {
    console.error('Error sending Gemini command:', error);
    return { success: false, error: error.message };
  }
});

// Save transcript to file
ipcMain.handle('save-transcript', async (event, transcriptText) => {
  try {
    const { dialog } = require('electron');
    const fs = require('fs').promises;

    const result = await dialog.showSaveDialog({
      title: 'Save Transcript',
      defaultPath: `transcript-${Date.now()}.txt`,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (!result.canceled && result.filePath) {
      await fs.writeFile(result.filePath, transcriptText, 'utf8');
      console.log('💾 Transcript saved to:', result.filePath);
      return { success: true, filePath: result.filePath };
    }

    return { success: false, canceled: true };
  } catch (error) {
    console.error('Error saving transcript:', error);
    return { success: false, error: error.message };
  }
});

// Attach transcript to chat
ipcMain.handle('attach-transcript-to-chat', async (event, transcriptText) => {
  try {
    console.log('📎 Attaching transcript to chat');

    // Forward to renderer to insert into chat
    safeSendToRenderer('insert-transcript-to-chat', { text: transcriptText });

    return { success: true };
  } catch (error) {
    console.error('Error attaching transcript to chat:', error);
    return { success: false, error: error.message };
  }
});

// ================================
// MCP SERVER IPC HANDLERS
// ================================

let mcpRequestId = 0;

// Add MCP server
ipcMain.handle('mcp-add-server', async (event, { serverName, command, args, env }) => {
  try {
    console.log(`🔌 IPC: Adding MCP server '${serverName}'...`);
    const result = await mcpManager.addServer(serverName, {
      command,
      args: args || [],
      env: env || {}
    });

    if (result.success) {
      try {
        // Initialize the server (send initialize request)
        mcpRequestId++;
        const initMessage = {
          jsonrpc: '2.0',
          id: mcpRequestId,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: {
              name: 'red-glass',
              version: '1.0.0'
            }
          }
        };

        console.log(`🔌 Sending initialize request to '${serverName}'...`);
        const initResponse = await mcpManager.sendToServer(serverName, initMessage);

        if (initResponse.result) {
          console.log(`✅ Server '${serverName}' initialized`);

          // Send initialized notification
          const serverInfo = mcpManager.servers.get(serverName);
          if (serverInfo && serverInfo.process) {
            serverInfo.process.stdin.write(JSON.stringify({
              jsonrpc: '2.0',
              method: 'notifications/initialized'
            }) + '\n');
          }

          // List tools
          mcpRequestId++;
          const toolsMessage = {
            jsonrpc: '2.0',
            id: mcpRequestId,
            method: 'tools/list'
          };

          console.log(`🔌 Requesting tools from '${serverName}'...`);
          const toolsResponse = await mcpManager.sendToServer(serverName, toolsMessage);
          if (toolsResponse.result && toolsResponse.result.tools) {
            const serverInfo = mcpManager.servers.get(serverName);
            if (serverInfo) {
              serverInfo.tools = toolsResponse.result.tools;
              console.log(`✅ Server '${serverName}' has ${serverInfo.tools.length} tools`);
            }
          }
        } else if (initResponse.error) {
          console.error(`❌ Server '${serverName}' initialization failed:`, initResponse.error);
          result.error = `Initialization failed: ${initResponse.error.message || 'Unknown error'}`;
          result.success = false;
        }
      } catch (initError) {
        console.error(`❌ Error initializing server '${serverName}':`, initError);
        result.error = `Initialization error: ${initError.message}`;
        result.success = false;

        // Mark server as error state
        const serverInfo = mcpManager.servers.get(serverName);
        if (serverInfo) {
          serverInfo.status = 'error';
          serverInfo.lastError = initError.message;
        }
      }
    }

    return result;
  } catch (error) {
    console.error('Error adding MCP server:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Remove MCP server
ipcMain.handle('mcp-remove-server', async (event, { serverName }) => {
  try {
    console.log(`🔌 IPC: Removing MCP server '${serverName}'...`);
    return await mcpManager.removeServer(serverName);
  } catch (error) {
    console.error('Error removing MCP server:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get MCP server status
ipcMain.handle('mcp-get-status', async (event, { serverName }) => {
  try {
    return {
      success: true,
      status: mcpManager.getServerStatus(serverName)
    };
  } catch (error) {
    console.error('Error getting MCP status:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Get all MCP tools
ipcMain.handle('mcp-get-tools', async (event) => {
  try {
    return {
      success: true,
      tools: mcpManager.getAllTools()
    };
  } catch (error) {
    console.error('Error getting MCP tools:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// Execute MCP tool
ipcMain.handle('mcp-execute-tool', async (event, { server, tool, params }) => {
  try {
    console.log(`🔌 IPC: Executing tool '${tool}' on server '${server}'...`);

    mcpRequestId++;
    const message = {
      jsonrpc: '2.0',
      id: mcpRequestId,
      method: 'tools/call',
      params: {
        name: tool,
        arguments: params || {}
      }
    };

    const response = await mcpManager.sendToServer(server, message);

    if (response.result) {
      return {
        success: true,
        result: response.result,
        server,
        tool
      };
    } else if (response.error) {
      return {
        success: false,
        error: response.error.message || 'Tool execution failed',
        server,
        tool
      };
    } else {
      return {
        success: false,
        error: 'Invalid response from server',
        server,
        tool
      };
    }
  } catch (error) {
    console.error('Error executing MCP tool:', error);
    return {
      success: false,
      error: error.message,
      server,
      tool
    };
  }
});

// Get tools from specific server
ipcMain.handle('mcp-get-server-tools', async (event, { serverName }) => {
  try {
    const serverInfo = mcpManager.servers.get(serverName);
    if (!serverInfo) {
      return {
        success: false,
        error: `Server '${serverName}' not found`
      };
    }

    return {
      success: true,
      server: serverName,
      tools: serverInfo.tools
    };
  } catch (error) {
    console.error('Error getting server tools:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// List all MCP servers
ipcMain.handle('mcp-list-servers', async (event) => {
  try {
    const servers = [];
    for (const [name, info] of mcpManager.servers.entries()) {
      servers.push({
        name,
        status: info.status,
        toolCount: info.tools.length,
        uptime: Date.now() - info.startTime,
        restartCount: info.restartCount,
        lastError: info.lastError
      });
    }

    return {
      success: true,
      servers
    };
  } catch (error) {
    console.error('Error listing MCP servers:', error);
    return {
      success: false,
      error: error.message
    };
  }
});

// ================================
// WORKFLOW SYSTEM IPC HANDLERS
// ================================

// Create workflow
ipcMain.handle('workflow-create', async (event, workflow) => {
  try {
    console.log('📝 Creating workflow:', workflow.name);
    const created = workflowExecutor.createWorkflow(workflow);
    return {
      success: true,
      workflow: created
    };
  } catch (error) {
    console.error('❌ Error creating workflow:', error);
    return { success: false, error: error.message };
  }
});

// Update workflow
ipcMain.handle('workflow-update', async (event, { id, updates }) => {
  try {
    console.log('📝 Updating workflow:', id);
    const updated = workflowExecutor.updateWorkflow(id, updates);
    return {
      success: true,
      workflow: updated
    };
  } catch (error) {
    console.error('❌ Error updating workflow:', error);
    return { success: false, error: error.message };
  }
});

// Delete workflow
ipcMain.handle('workflow-delete', async (event, { id }) => {
  try {
    console.log('🗑️ Deleting workflow:', id);
    const result = workflowExecutor.deleteWorkflow(id);
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('❌ Error deleting workflow:', error);
    return { success: false, error: error.message };
  }
});

// Get all workflows
ipcMain.handle('workflow-list', async (event) => {
  try {
    const workflows = workflowExecutor.getAllWorkflows();
    return {
      success: true,
      workflows
    };
  } catch (error) {
    console.error('❌ Error listing workflows:', error);
    return { success: false, error: error.message };
  }
});

// Get single workflow
ipcMain.handle('workflow-get', async (event, { id }) => {
  try {
    const workflow = workflowExecutor.getWorkflow(id);
    if (!workflow) {
      return { success: false, error: 'Workflow not found' };
    }
    return {
      success: true,
      workflow
    };
  } catch (error) {
    console.error('❌ Error getting workflow:', error);
    return { success: false, error: error.message };
  }
});

// Execute workflow
ipcMain.handle('workflow-execute', async (event, { id, context }) => {
  try {
    console.log('🚀 Executing workflow:', id);
    const execution = await workflowExecutor.executeWorkflow(id, context || {});
    return {
      success: execution.success,
      execution
    };
  } catch (error) {
    console.error('❌ Error executing workflow:', error);
    return { success: false, error: error.message };
  }
});

// Get execution history
ipcMain.handle('workflow-history', async (event, { limit }) => {
  try {
    const history = workflowExecutor.getHistory(limit);
    return {
      success: true,
      history
    };
  } catch (error) {
    console.error('❌ Error getting workflow history:', error);
    return { success: false, error: error.message };
  }
});

// Clear execution history
ipcMain.handle('workflow-clear-history', async (event) => {
  try {
    workflowExecutor.clearHistory();
    return { success: true };
  } catch (error) {
    console.error('❌ Error clearing workflow history:', error);
    return { success: false, error: error.message };
  }
});

// Check triggers (for chat integration)
ipcMain.handle('workflow-check-triggers', async (event, context) => {
  try {
    const matchedWorkflows = await workflowExecutor.checkTriggers(context);
    return {
      success: true,
      workflows: matchedWorkflows
    };
  } catch (error) {
    console.error('❌ Error checking workflow triggers:', error);
    return { success: false, error: error.message };
  }
});


// Load API keys from settings
function loadApiKeysFromSettings() {
  try {
    const settings = settingsManager.get('apiKeys');
    if (settings.gemini) {
      process.env.GEMINI_API_KEY = settings.gemini;
      console.log('✅ Loaded Gemini API key from settings');
    }
    if (settings.openai) {
      process.env.OPENAI_API_KEY = settings.openai;
      console.log('✅ Loaded OpenAI API key from settings');
    }
    if (settings.deepseek) {
      process.env.DEEPSEEK_API_KEY = settings.deepseek;
      console.log('✅ Loaded DeepSeek API key from settings');
    }
  } catch (error) {
    console.log('⚠️ No API keys found in settings, using environment variables');
  }
}

// Initialize protocol handler for OAuth
protocolHandler.initialize();

app.whenReady().then(async () => {
  console.log('👋 Welcome back - starting in background');

  // Load API keys from settings
  loadApiKeysFromSettings();


  createWindow();
  createTray();

  // Register global shortcuts
  registerShortcut();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Set fallback timer to show window
  setTimeout(() => {
    if (!isVisible) {
      console.log('🔧 Fallback: Showing window after 3 seconds');
      toggleWindow();
    }
  }, 3000);

  // Initialize workflow scheduler after a delay to ensure app is fully loaded
  setTimeout(async () => {
    await initializeWorkflowScheduler();
  }, 5000);
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// Live Transcript IPC Handlers - will be implemented with new architecture

// Workflows Storage and Management
const workflowsStorePath = path.join(app.getPath('userData'), 'workflows.json');

// Load workflows from storage
async function loadWorkflows() {
  try {
    if (fs.existsSync(workflowsStorePath)) {
      const data = fs.readFileSync(workflowsStorePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('❌ Error loading workflows:', error);
    return [];
  }
}

// Save workflows to storage
async function saveWorkflows(workflows) {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(workflowsStorePath, JSON.stringify(workflows, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Error saving workflows:', error);
    throw error;
  }
}

// Helper function to call DeepSeek API for workflows
async function callDeepSeekAPIForWorkflow(message) {
  try {
    const apiKey = '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';
    const fetch = require('node-fetch');

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://red-glass-app.local',
        'X-Title': 'Red Glass AI Assistant'
      },
      body: JSON.stringify({
        model: 'deepseek/deepseek-chat',
        messages: [
          {
            role: 'user',
            content: message
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || !data.choices.length || !data.choices[0].message) {
      throw new Error('Unexpected API response format');
    }

    return data.choices[0].message.content;
  } catch (error) {
    throw error;
  }
}

// Execute a workflow step
async function executeWorkflowStep(step, input, context = {}) {
  switch (step.type) {
    case 'prompt':
      // Execute AI prompt
      try {
        const response = await callDeepSeekAPIForWorkflow(step.content.replace('{{input}}', input));
        return { success: true, output: response, context };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'transform':
      // Transform text using simple string operations
      try {
        let output = input;
        const transformations = step.content.split('\n').filter(t => t.trim());

        for (const transform of transformations) {
          if (transform.startsWith('replace:')) {
            const [, find, replace] = transform.split(':');
            output = output.replace(new RegExp(find, 'g'), replace || '');
          } else if (transform.startsWith('uppercase')) {
            output = output.toUpperCase();
          } else if (transform.startsWith('lowercase')) {
            output = output.toLowerCase();
          } else if (transform.startsWith('trim')) {
            output = output.trim();
          }
        }

        return { success: true, output, context };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'condition':
      // Simple condition check
      try {
        const condition = step.content.replace('{{input}}', input);
        // For now, just return the input if condition is not empty
        const passes = condition.trim().length > 0;
        return { success: true, output: input, context: { ...context, conditionPassed: passes } };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'delay':
      // Add delay
      try {
        const delay = parseInt(step.content) || 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return { success: true, output: input, context };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    default:
      return { success: false, error: `Unknown step type: ${step.type}`, context };
  }
}

// Workflows IPC Handlers
ipcMain.handle('load-workflows', async (event) => {
  return await loadWorkflows();
});

ipcMain.handle('save-workflow', async (event, workflow) => {
  try {
    const workflows = await loadWorkflows();
    const existingIndex = workflows.findIndex(w => w.id === workflow.id);

    if (existingIndex >= 0) {
      workflows[existingIndex] = workflow;
    } else {
      workflows.push(workflow);
    }

    await saveWorkflows(workflows);
    return { success: true };
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('delete-workflow', async (event, workflowId) => {
  try {
    const workflows = await loadWorkflows();
    const filteredWorkflows = workflows.filter(w => w.id !== workflowId);
    await saveWorkflows(filteredWorkflows);
    return { success: true };
  } catch (error) {
    throw error;
  }
});

ipcMain.handle('execute-workflow', async (event, workflowId, input) => {
  try {
    const workflows = await loadWorkflows();
    const workflow = workflows.find(w => w.id === workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    let currentInput = input;
    let context = {};
    const results = [];

    for (const step of workflow.steps) {
      const result = await executeWorkflowStep(step, currentInput, context);
      results.push(result);

      if (!result.success) {
        throw new Error(`Step failed: ${result.error}`);
      }

      currentInput = result.output;
      context = result.context;
    }

    return {
      success: true,
      output: currentInput,
      results,
      workflow: workflow.name
    };

  } catch (error) {
    throw error;
  }
});





// Debug IPC handler for manual window control
ipcMain.handle('debug-show-window', async (event) => {
  console.log('🐛 Debug: Manual window show requested');
  toggleWindow();
  return { success: true };
});

ipcMain.handle('debug-window-status', async (event) => {
  const status = {
    isVisible: isVisible,
    windowExists: !!mainWindow,
    windowIsVisible: mainWindow ? mainWindow.isVisible() : false,
    windowIsMinimized: mainWindow ? mainWindow.isMinimized() : false,
    windowOpacity: mainWindow ? mainWindow.getOpacity() : 0,
    windowBounds: mainWindow ? mainWindow.getBounds() : null,
    isAlwaysOnTop: mainWindow ? mainWindow.isAlwaysOnTop() : false
  };
  console.log('🐛 Debug window status:', status);
  return status;
});

app.on('will-quit', async () => {
  // Cleanup MCP servers
  console.log('🧹 Cleaning up MCP servers...');
  await mcpManager.shutdown();

  // Cleanup RealtimeSTT server
  console.log('🧹 Cleaning up RealtimeSTT server...');
  await stopRealtimeSTTServer();


  // Unregister all shortcuts when quitting
  globalShortcut.unregisterAll();
});

// ================================
// ENHANCED WORKFLOW SCHEDULER SYSTEM
// ================================

// Store for active scheduled workflows
const activeScheduledWorkflows = new Map();
const scheduledWorkflowsStorePath = path.join(app.getPath('userData'), 'scheduled-workflows.json');

// Enhanced workflow structure with scheduling
/*
Enhanced Workflow Structure:
{
  id: string,
  name: string,
  description: string,
  steps: [
    {
      id: string,
      type: 'prompt' | 'transform' | 'condition' | 'delay' | 'fetch' | 'notification' | 'webhook',
      content: string,
      config: object
    }
  ],
  schedule: {
    enabled: boolean,
    type: 'once' | 'daily' | 'weekly' | 'monthly' | 'interval',
    time: string, // HH:MM format for daily/weekly/monthly
    date: string, // ISO date for 'once' type
    dayOfWeek: number, // 0-6 for weekly (0 = Sunday)
    dayOfMonth: number, // 1-31 for monthly
    interval: number, // minutes for interval type
    endDate: string, // Optional end date
    maxExecutions: number, // Optional max number of executions
    timezone: string // User's timezone
  },
  lastExecuted: string, // ISO timestamp
  executionCount: number,
  isActive: boolean,
  createdAt: string,
  updatedAt: string
}
*/

// Load scheduled workflows from storage
async function loadScheduledWorkflows() {
  try {
    if (fs.existsSync(scheduledWorkflowsStorePath)) {
      const data = fs.readFileSync(scheduledWorkflowsStorePath, 'utf8');
      return JSON.parse(data);
    }
    return [];
  } catch (error) {
    console.error('❌ Error loading scheduled workflows:', error);
    return [];
  }
}

// Save scheduled workflows to storage
async function saveScheduledWorkflows(scheduledWorkflows) {
  try {
    const userDataPath = app.getPath('userData');
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true });
    }
    fs.writeFileSync(scheduledWorkflowsStorePath, JSON.stringify(scheduledWorkflows, null, 2));
    return true;
  } catch (error) {
    console.error('❌ Error saving scheduled workflows:', error);
    throw error;
  }
}

// Enhanced workflow step execution with new step types
async function executeEnhancedWorkflowStep(step, input, context = {}) {
  switch (step.type) {
    case 'prompt':
      // Execute AI prompt
      try {
        const prompt = step.content.replace('{{input}}', input);
        const response = await callDeepSeekAPIForWorkflow(prompt);
        return { success: true, output: response, context };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'fetch':
      // Fetch data from external sources
      try {
        const config = step.config || {};
        let fetchedData = '';

        if (config.type === 'bitcoin-price') {
          // Fetch Bitcoin price
          const fetch = require('node-fetch');
          const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
          const data = await response.json();
          fetchedData = `Bitcoin price: $${data.bitcoin.usd.toLocaleString()} USD`;

        } else if (config.type === 'crypto-prices') {
          // Fetch multiple cryptocurrency prices
          const cryptos = config.cryptos || ['bitcoin', 'ethereum'];
          const fetch = require('node-fetch');
          const response = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${cryptos.join(',')}&vs_currencies=usd`);
          const data = await response.json();

          const prices = Object.entries(data).map(([crypto, price]) =>
            `${crypto.charAt(0).toUpperCase() + crypto.slice(1)}: $${price.usd.toLocaleString()}`
          ).join('\n');
          fetchedData = `Cryptocurrency Prices:\n${prices}`;

        } else if (config.type === 'weather') {
          // Fetch weather data (example implementation)
          const location = config.location || 'New York';
          fetchedData = `Weather for ${location}: Sunny, 72°F (This is a demo - integrate with weather API)`;

        } else if (config.type === 'news') {
          // Fetch news headlines (example implementation)
          fetchedData = `Latest News Headlines:\n1. Tech industry updates\n2. Market movements\n3. Global events (This is a demo - integrate with news API)`;

        } else if (config.type === 'custom-url') {
          // Fetch data from custom URL
          const url = config.url;
          if (url) {
            const fetch = require('node-fetch');
            const response = await fetch(url);
            const responseText = await response.text();
            fetchedData = responseText.substring(0, 1000); // Limit response size
          } else {
            throw new Error('No URL specified for custom fetch');
          }
        }

        const output = step.content ? step.content.replace('{{input}}', input).replace('{{data}}', fetchedData) : fetchedData;
        return { success: true, output, context: { ...context, fetchedData } };

      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'notification':
      // Send system notification
      try {
        const { Notification } = require('electron');
        const title = step.config?.title || 'Red Glass Workflow';
        const body = step.content.replace('{{input}}', input);

        if (Notification.isSupported()) {
          new Notification({
            title: title,
            body: body,
            icon: path.join(__dirname, '../public/icon.png') // Add icon if available
          }).show();
        }

        return { success: true, output: input, context };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'webhook':
      // Send data to webhook URL
      try {
        const webhookUrl = step.config?.url;
        if (!webhookUrl) {
          throw new Error('No webhook URL specified');
        }

        const payload = {
          input: input,
          context: context,
          timestamp: new Date().toISOString(),
          workflowStep: step.id
        };

        const fetch = require('node-fetch');
        const response = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload)
        });

        const result = await response.text();
        return { success: true, output: result || input, context };

      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'transform':
      // Transform text using simple string operations
      try {
        let output = input;
        const transformations = step.content.split('\n').filter(t => t.trim());

        for (const transform of transformations) {
          if (transform.startsWith('replace:')) {
            const [, find, replace] = transform.split(':');
            output = output.replace(new RegExp(find, 'g'), replace || '');
          } else if (transform.startsWith('uppercase')) {
            output = output.toUpperCase();
          } else if (transform.startsWith('lowercase')) {
            output = output.toLowerCase();
          } else if (transform.startsWith('trim')) {
            output = output.trim();
          } else if (transform.startsWith('format-date')) {
            const now = new Date();
            output = output.replace('{{date}}', now.toLocaleDateString());
            output = output.replace('{{time}}', now.toLocaleTimeString());
            output = output.replace('{{datetime}}', now.toLocaleString());
          }
        }

        return { success: true, output, context };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'condition':
      // Enhanced condition check
      try {
        const condition = step.content.replace('{{input}}', input);
        const config = step.config || {};

        let passes = false;
        if (config.type === 'contains') {
          passes = input.toLowerCase().includes(config.value.toLowerCase());
        } else if (config.type === 'equals') {
          passes = input.trim() === config.value;
        } else if (config.type === 'length') {
          const operator = config.operator || 'gt';
          const value = parseInt(config.value) || 0;
          const inputLength = input.length;

          switch (operator) {
            case 'gt': passes = inputLength > value; break;
            case 'lt': passes = inputLength < value; break;
            case 'eq': passes = inputLength === value; break;
            default: passes = inputLength > value;
          }
        } else {
          // Default: check if condition is not empty
          passes = condition.trim().length > 0;
        }

        return { success: true, output: input, context: { ...context, conditionPassed: passes } };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    case 'delay':
      // Add delay
      try {
        const delay = parseInt(step.content) || 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
        return { success: true, output: input, context };
      } catch (error) {
        return { success: false, error: error.message, context };
      }

    default:
      // Fallback to original workflow step execution
      return await executeWorkflowStep(step, input, context);
  }
}

// Execute a complete workflow with enhanced capabilities
async function executeEnhancedWorkflow(workflow, initialInput = '', context = {}) {
  try {
    console.log(`🚀 Executing workflow: ${workflow.name}`);

    let currentInput = initialInput;
    let workflowContext = { ...context, workflowId: workflow.id, startTime: Date.now() };
    const results = [];

    for (const step of workflow.steps) {
      console.log(`📝 Executing step: ${step.type} - ${step.id}`);

      const result = await executeEnhancedWorkflowStep(step, currentInput, workflowContext);
      results.push({
        stepId: step.id,
        stepType: step.type,
        success: result.success,
        output: result.output,
        error: result.error,
        timestamp: Date.now()
      });

      if (!result.success) {
        console.error(`❌ Step failed: ${result.error}`);

        // Continue or stop based on step configuration
        if (step.config?.continueOnError !== true) {
          throw new Error(`Workflow step failed: ${result.error}`);
        }
      }

      currentInput = result.output;
      workflowContext = result.context;
    }

    // Update execution statistics
    workflow.lastExecuted = new Date().toISOString();
    workflow.executionCount = (workflow.executionCount || 0) + 1;

    console.log(`✅ Workflow completed: ${workflow.name}`);

    return {
      success: true,
      output: currentInput,
      results,
      workflow: workflow.name,
      executionTime: Date.now() - workflowContext.startTime
    };

  } catch (error) {
    console.error(`❌ Workflow execution failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      workflow: workflow.name,
      results: results || []
    };
  }
}

// Calculate next execution time for a scheduled workflow
function calculateNextExecution(schedule) {
  const now = new Date();
  const timezone = schedule.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    switch (schedule.type) {
      case 'once':
        const onceDate = new Date(schedule.date);
        return onceDate > now ? onceDate : null;

      case 'daily':
        const [hours, minutes] = schedule.time.split(':').map(Number);
        const dailyNext = new Date();
        dailyNext.setHours(hours, minutes, 0, 0);

        if (dailyNext <= now) {
          dailyNext.setDate(dailyNext.getDate() + 1);
        }
        return dailyNext;

      case 'weekly':
        const [weeklyHours, weeklyMinutes] = schedule.time.split(':').map(Number);
        const weeklyNext = new Date();
        weeklyNext.setHours(weeklyHours, weeklyMinutes, 0, 0);

        const daysDiff = (schedule.dayOfWeek - now.getDay() + 7) % 7;
        if (daysDiff === 0 && weeklyNext <= now) {
          weeklyNext.setDate(weeklyNext.getDate() + 7);
        } else {
          weeklyNext.setDate(weeklyNext.getDate() + daysDiff);
        }
        return weeklyNext;

      case 'monthly':
        const [monthlyHours, monthlyMinutes] = schedule.time.split(':').map(Number);
        const monthlyNext = new Date();
        monthlyNext.setDate(schedule.dayOfMonth);
        monthlyNext.setHours(monthlyHours, monthlyMinutes, 0, 0);

        if (monthlyNext <= now) {
          monthlyNext.setMonth(monthlyNext.getMonth() + 1);
        }
        return monthlyNext;

      case 'interval':
        const intervalNext = new Date(now.getTime() + (schedule.interval * 60000));
        return intervalNext;

      default:
        return null;
    }
  } catch (error) {
    console.error('❌ Error calculating next execution:', error);
    return null;
  }
}

// Schedule a workflow for execution
function scheduleWorkflow(workflow) {
  if (!workflow.schedule || !workflow.schedule.enabled) {
    return false;
  }

  const nextExecution = calculateNextExecution(workflow.schedule);
  if (!nextExecution) {
    console.log(`⚠️ Could not calculate next execution for workflow: ${workflow.name}`);
    return false;
  }

  const delay = nextExecution.getTime() - Date.now();

  if (delay <= 0) {
    console.log(`⚠️ Execution time has passed for workflow: ${workflow.name}`);
    return false;
  }

  console.log(`⏰ Scheduling workflow "${workflow.name}" for ${nextExecution.toLocaleString()}`);

  const timeoutId = setTimeout(async () => {
    try {
      // Execute the workflow
      const result = await executeEnhancedWorkflow(workflow);

      console.log(`📊 Workflow execution result:`, result);

      // Send notification if workflow has notification step or if configured
      if (result.success) {
        console.log(`✅ Scheduled workflow "${workflow.name}" completed successfully`);
      } else {
        console.error(`❌ Scheduled workflow "${workflow.name}" failed:`, result.error);
      }

      // Remove from active schedules
      activeScheduledWorkflows.delete(workflow.id);

      // Reschedule if it's a recurring workflow and hasn't reached limits
      if (workflow.schedule.type !== 'once') {
        const shouldContinue = checkWorkflowLimits(workflow);
        if (shouldContinue) {
          scheduleWorkflow(workflow);
        } else {
          console.log(`🏁 Workflow "${workflow.name}" has reached its execution limits`);
          workflow.isActive = false;
          await updateScheduledWorkflow(workflow);
        }
      } else {
        // One-time workflow completed
        workflow.isActive = false;
        await updateScheduledWorkflow(workflow);
      }

    } catch (error) {
      console.error(`❌ Error executing scheduled workflow "${workflow.name}":`, error);
      activeScheduledWorkflows.delete(workflow.id);
    }
  }, delay);

  // Store the timeout ID so we can cancel it later if needed
  activeScheduledWorkflows.set(workflow.id, {
    workflow,
    timeoutId,
    nextExecution,
    scheduledAt: new Date()
  });

  return true;
}

// Check if workflow has reached its execution limits
function checkWorkflowLimits(workflow) {
  const schedule = workflow.schedule;
  const now = new Date();

  // Check end date
  if (schedule.endDate && new Date(schedule.endDate) <= now) {
    return false;
  }

  // Check max executions
  if (schedule.maxExecutions && workflow.executionCount >= schedule.maxExecutions) {
    return false;
  }

  return true;
}

// Update a scheduled workflow in storage
async function updateScheduledWorkflow(workflow) {
  try {
    const scheduledWorkflows = await loadScheduledWorkflows();
    const index = scheduledWorkflows.findIndex(w => w.id === workflow.id);

    if (index >= 0) {
      workflow.updatedAt = new Date().toISOString();
      scheduledWorkflows[index] = workflow;
      await saveScheduledWorkflows(scheduledWorkflows);
    }

    return true;
  } catch (error) {
    console.error('❌ Error updating scheduled workflow:', error);
    return false;
  }
}

// Initialize workflow scheduler
async function initializeWorkflowScheduler() {
  try {
    console.log('🔧 Initializing workflow scheduler...');

    const scheduledWorkflows = await loadScheduledWorkflows();
    let activeCount = 0;

    for (const workflow of scheduledWorkflows) {
      if (workflow.isActive && workflow.schedule && workflow.schedule.enabled) {
        const scheduled = scheduleWorkflow(workflow);
        if (scheduled) {
          activeCount++;
        }
      }
    }

    console.log(`✅ Workflow scheduler initialized with ${activeCount} active workflows`);

  } catch (error) {
    console.error('❌ Error initializing workflow scheduler:', error);
  }
}

// Cancel a scheduled workflow
function cancelScheduledWorkflow(workflowId) {
  const scheduled = activeScheduledWorkflows.get(workflowId);
  if (scheduled) {
    clearTimeout(scheduled.timeoutId);
    activeScheduledWorkflows.delete(workflowId);
    console.log(`🚫 Cancelled scheduled workflow: ${workflowId}`);
    return true;
  }
  return false;
}

// Get status of all scheduled workflows
function getScheduledWorkflowsStatus() {
  const status = [];

  for (const [workflowId, scheduled] of activeScheduledWorkflows) {
    status.push({
      workflowId: workflowId,
      workflowName: scheduled.workflow.name,
      nextExecution: scheduled.nextExecution,
      scheduledAt: scheduled.scheduledAt,
      isActive: true
    });
  }

  return status;
}

// ================================
// ENHANCED WORKFLOW IPC HANDLERS
// ================================

// Create or update a scheduled workflow
ipcMain.handle('create-scheduled-workflow', async (event, workflowData) => {
  try {
    const workflow = {
      id: workflowData.id || require('crypto').randomUUID(),
      name: workflowData.name,
      description: workflowData.description || '',
      steps: workflowData.steps || [],
      schedule: workflowData.schedule || { enabled: false },
      lastExecuted: null,
      executionCount: 0,
      isActive: workflowData.schedule?.enabled || false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const scheduledWorkflows = await loadScheduledWorkflows();
    const existingIndex = scheduledWorkflows.findIndex(w => w.id === workflow.id);

    if (existingIndex >= 0) {
      // Cancel existing schedule if updating
      cancelScheduledWorkflow(workflow.id);
      scheduledWorkflows[existingIndex] = workflow;
    } else {
      scheduledWorkflows.push(workflow);
    }

    await saveScheduledWorkflows(scheduledWorkflows);

    // Schedule the workflow if it's active
    if (workflow.isActive) {
      scheduleWorkflow(workflow);
    }

    console.log(`✅ Created/updated scheduled workflow: ${workflow.name}`);

    return { success: true, workflow };
  } catch (error) {
    console.error('❌ Error creating scheduled workflow:', error);
    throw error;
  }
});

// Get all scheduled workflows
ipcMain.handle('get-scheduled-workflows', async (event) => {
  try {
    const scheduledWorkflows = await loadScheduledWorkflows();
    const activeStatus = getScheduledWorkflowsStatus();

    // Merge with active status
    const enrichedWorkflows = scheduledWorkflows.map(workflow => {
      const status = activeStatus.find(s => s.workflowId === workflow.id);
      return {
        ...workflow,
        nextExecution: status?.nextExecution || null,
        isCurrentlyScheduled: !!status
      };
    });

    return { success: true, workflows: enrichedWorkflows };
  } catch (error) {
    console.error('❌ Error getting scheduled workflows:', error);
    throw error;
  }
});

// Toggle workflow active state
ipcMain.handle('toggle-scheduled-workflow', async (event, workflowId) => {
  try {
    const scheduledWorkflows = await loadScheduledWorkflows();
    const workflow = scheduledWorkflows.find(w => w.id === workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    workflow.isActive = !workflow.isActive;
    workflow.updatedAt = new Date().toISOString();

    if (workflow.isActive) {
      scheduleWorkflow(workflow);
    } else {
      cancelScheduledWorkflow(workflowId);
    }

    await saveScheduledWorkflows(scheduledWorkflows);

    console.log(`🔄 Toggled workflow "${workflow.name}" to ${workflow.isActive ? 'active' : 'inactive'}`);

    return { success: true, workflow };
  } catch (error) {
    console.error('❌ Error toggling scheduled workflow:', error);
    throw error;
  }
});

// Delete a scheduled workflow
ipcMain.handle('delete-scheduled-workflow', async (event, workflowId) => {
  try {
    cancelScheduledWorkflow(workflowId);

    const scheduledWorkflows = await loadScheduledWorkflows();
    const filteredWorkflows = scheduledWorkflows.filter(w => w.id !== workflowId);
    await saveScheduledWorkflows(filteredWorkflows);

    console.log(`🗑️ Deleted scheduled workflow: ${workflowId}`);

    return { success: true };
  } catch (error) {
    console.error('❌ Error deleting scheduled workflow:', error);
    throw error;
  }
});

// Execute a workflow manually
ipcMain.handle('execute-scheduled-workflow', async (event, workflowId, input = '') => {
  try {
    const scheduledWorkflows = await loadScheduledWorkflows();
    const workflow = scheduledWorkflows.find(w => w.id === workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    const result = await executeEnhancedWorkflow(workflow, input);

    // Update workflow statistics
    await updateScheduledWorkflow(workflow);

    return result;
  } catch (error) {
    console.error('❌ Error executing scheduled workflow:', error);
    throw error;
  }
});

// Get workflow execution history
ipcMain.handle('get-workflow-execution-history', async (event, workflowId) => {
  try {
    // This would typically read from a separate execution history file
    // For now, return basic info from the workflow
    const scheduledWorkflows = await loadScheduledWorkflows();
    const workflow = scheduledWorkflows.find(w => w.id === workflowId);

    if (!workflow) {
      throw new Error('Workflow not found');
    }

    return {
      success: true,
      history: {
        workflowId: workflow.id,
        workflowName: workflow.name,
        totalExecutions: workflow.executionCount || 0,
        lastExecuted: workflow.lastExecuted,
        createdAt: workflow.createdAt
      }
    };
  } catch (error) {
    console.error('❌ Error getting workflow execution history:', error);
    throw error;
  }
});

// Create workflow from natural language prompt
ipcMain.handle('create-workflow-from-prompt', async (event, prompt) => {
  try {
    console.log('Creating workflow from prompt:', prompt);

    // Use AI to parse the natural language prompt and create a workflow
    const systemPrompt = `You are a workflow creation assistant. Convert the user's natural language request into a structured workflow with scheduling.

Return a JSON object with this structure:
{
  "name": "Workflow Name",
  "description": "Brief description",
  "steps": [
    {
      "type": "fetch|prompt|transform|notification",
      "content": "step content with {{input}} and {{data}} placeholders",
      "config": { "type": "bitcoin-price|crypto-prices|weather|news|custom-url", "additional": "config" }
    }
  ],
  "schedule": {
    "enabled": true,
    "type": "daily|weekly|monthly|interval",
    "time": "17:00",
    "interval": 60,
    "timezone": "America/New_York"
  }
}

Examples:
- "Bitcoin prices at 5pm daily" -> fetch bitcoin prices, format output, send notification
- "Weather report every morning" -> fetch weather, create summary, send notification
- "Check news every 2 hours" -> fetch news, summarize, send notification

User request: ${prompt}`;

    const response = await callDeepSeekAPIForWorkflow(systemPrompt);

    // Try to parse the AI response as JSON
    let workflowData;
    try {
      // Extract JSON from the response (AI might include extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        workflowData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No valid JSON found in AI response');
      }
    } catch (parseError) {
      console.error('❌ Error parsing AI response:', parseError);

      // Fallback: create a simple workflow based on common patterns
      workflowData = createFallbackWorkflow(prompt);
    }

    // Ensure the workflow has required fields
    workflowData.id = require('crypto').randomUUID();
    workflowData.createdAt = new Date().toISOString();

    console.log('✅ Generated workflow:', workflowData);

    return { success: true, workflow: workflowData };

  } catch (error) {
    console.error('❌ Error creating workflow from prompt:', error);
    throw error;
  }
});

// Fallback workflow creation for common patterns
function createFallbackWorkflow(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  if (lowerPrompt.includes('bitcoin') || lowerPrompt.includes('crypto')) {
    return {
      name: 'Cryptocurrency Prices',
      description: 'Get cryptocurrency prices',
      steps: [
        {
          type: 'fetch',
          content: 'Current cryptocurrency prices: {{data}}',
          config: { type: 'bitcoin-price' }
        },
        {
          type: 'notification',
          content: '{{input}}',
          config: { title: 'Crypto Prices Update' }
        }
      ],
      schedule: {
        enabled: true,
        type: 'daily',
        time: '17:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };
  }

  if (lowerPrompt.includes('weather')) {
    return {
      name: 'Weather Report',
      description: 'Get weather updates',
      steps: [
        {
          type: 'fetch',
          content: 'Weather update: {{data}}',
          config: { type: 'weather', location: 'New York' }
        },
        {
          type: 'notification',
          content: '{{input}}',
          config: { title: 'Weather Update' }
        }
      ],
      schedule: {
        enabled: true,
        type: 'daily',
        time: '08:00',
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
      }
    };
  }

  // Default workflow
  return {
    name: 'Custom Workflow',
    description: 'Generated from: ' + prompt,
    steps: [
      {
        type: 'prompt',
        content: prompt + ' {{input}}',
        config: {}
      },
      {
        type: 'notification',
        content: '{{input}}',
        config: { title: 'Workflow Result' }
      }
    ],
    schedule: {
      enabled: true,
      type: 'daily',
      time: '12:00',
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
    }
  };
}

// ============================================
// Settings IPC Handlers
// ============================================

// Get all settings
ipcMain.handle('settings-get-all', async (event) => {
  try {
    return { success: true, settings: settingsManager.getAll() };
  } catch (error) {
    console.error('Error getting all settings:', error);
    return { success: false, error: error.message };
  }
});

// Get a specific category
ipcMain.handle('settings-get-category', async (event, category) => {
  try {
    return { success: true, settings: settingsManager.get(category) };
  } catch (error) {
    console.error(`Error getting settings for ${category}:`, error);
    return { success: false, error: error.message };
  }
});

// Get a specific setting
ipcMain.handle('settings-get-setting', async (event, { category, key }) => {
  try {
    return { success: true, value: settingsManager.getSetting(category, key) };
  } catch (error) {
    console.error(`Error getting setting ${category}.${key}:`, error);
    return { success: false, error: error.message };
  }
});

// Set a specific category
ipcMain.handle('settings-set-category', async (event, { category, value }) => {
  try {
    settingsManager.set(category, value);
    return { success: true };
  } catch (error) {
    console.error(`Error setting category ${category}:`, error);
    return { success: false, error: error.message };
  }
});

// Set a specific setting
ipcMain.handle('settings-set-setting', async (event, { category, key, value }) => {
  try {
    // Validate the setting
    const validation = settingsManager.validate(category, key, value);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    settingsManager.setSetting(category, key, value);

    // Notify renderer about opacity change so it can update CSS
    if (category === 'general' && key === 'windowOpacity') {
      if (mainWindow && !mainWindow.isDestroyed()) {
        safeSendToRenderer('opacity-changed', value);
        console.log(`✨ Window opacity setting updated: ${value}`);
      }
    }

    return { success: true };
  } catch (error) {
    console.error(`Error setting ${category}.${key}:`, error);
    return { success: false, error: error.message };
  }
});

// Update multiple settings in a category
ipcMain.handle('settings-update-category', async (event, { category, updates }) => {
  try {
    settingsManager.update(category, updates);
    return { success: true };
  } catch (error) {
    console.error(`Error updating category ${category}:`, error);
    return { success: false, error: error.message };
  }
});

// Reset a category to defaults
ipcMain.handle('settings-reset-category', async (event, category) => {
  try {
    settingsManager.reset(category);
    return { success: true };
  } catch (error) {
    console.error(`Error resetting category ${category}:`, error);
    return { success: false, error: error.message };
  }
});

// Reset all settings
ipcMain.handle('settings-reset-all', async (event) => {
  try {
    settingsManager.resetAll();
    return { success: true };
  } catch (error) {
    console.error('Error resetting all settings:', error);
    return { success: false, error: error.message };
  }
});

// Clear data
ipcMain.handle('settings-clear-data', async (event, options) => {
  try {
    const result = await settingsManager.clearData(options);
    return result;
  } catch (error) {
    console.error('Error clearing data:', error);
    return { success: false, error: error.message };
  }
});

// Export settings
ipcMain.handle('settings-export', async (event) => {
  try {
    const data = await settingsManager.exportSettings();
    return { success: true, data };
  } catch (error) {
    console.error('Error exporting settings:', error);
    return { success: false, error: error.message };
  }
});

// Import settings
ipcMain.handle('settings-import', async (event, data) => {
  try {
    const result = await settingsManager.importSettings(data);
    return result;
  } catch (error) {
    console.error('Error importing settings:', error);
    return { success: false, error: error.message };
  }
});

// Get data statistics
ipcMain.handle('settings-get-data-stats', async (event) => {
  try {
    const stats = await settingsManager.getDataStatistics();
    return { success: true, stats };
  } catch (error) {
    console.error('Error getting data statistics:', error);
    return { success: false, error: error.message };
  }
});

// MongoDB IPC Handlers
ipcMain.handle('mongodb-get-user', async (event, userId) => {
  try {
    const result = await mongoDBService.getUserById(userId);
    return result;
  } catch (error) {
    console.error('Error getting user from MongoDB:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mongodb-get-user-by-email', async (event, email) => {
  try {
    console.log('📧 [mongodb-get-user-by-email] Fetching user:', email);
    const result = await mongoDBService.getUserByEmail(email);

    if (result.success) {
      console.log('✅ [mongodb-get-user-by-email] User found:', result.user.email, 'Tier:', result.user.subscription?.tier || result.user.plan);
    } else {
      console.log('❌ [mongodb-get-user-by-email] User not found or error:', result.error);
    }

    return result;
  } catch (error) {
    console.error('❌ [mongodb-get-user-by-email] Error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mongodb-update-user', async (event, userId, updateData) => {
  try {
    const result = await mongoDBService.updateUser(userId, updateData);
    return result;
  } catch (error) {
    console.error('Error updating user in MongoDB:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mongodb-create-user', async (event, userData) => {
  try {
    const result = await mongoDBService.createUser(userData);
    return result;
  } catch (error) {
    console.error('Error creating user in MongoDB:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mongodb-delete-user', async (event, userId) => {
  try {
    const result = await mongoDBService.deleteUser(userId);
    return result;
  } catch (error) {
    console.error('Error deleting user from MongoDB:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mongodb-test-connection', async (event) => {
  try {
    const result = await mongoDBService.testConnection();
    return result;
  } catch (error) {
    console.error('Error testing MongoDB connection:', error);
    return { success: false, error: error.message };
  }
});

// Save API keys to environment (for backwards compatibility)
ipcMain.handle('settings-save-api-keys', async (event, { gemini, openai, deepseek }) => {
  try {
    const updates = {};
    if (gemini !== undefined) updates.gemini = gemini;
    if (openai !== undefined) updates.openai = openai;
    if (deepseek !== undefined) updates.deepseek = deepseek;

    settingsManager.update('apiKeys', updates);

    // Also update environment variables for immediate use
    if (gemini) process.env.GEMINI_API_KEY = gemini;
    if (openai) process.env.OPENAI_API_KEY = openai;
    if (deepseek) process.env.DEEPSEEK_API_KEY = deepseek;

    return { success: true };
  } catch (error) {
    console.error('Error saving API keys:', error);
    return { success: false, error: error.message };
  }
});

// MongoDB Authentication Handlers
ipcMain.handle('mongodb-authenticate', async (event, { email, password }) => {
  try {
    // Input validation
    try {
      validateInput('email', email);
      validateInput('string', password);
      email = sanitizeString(email);
    } catch (validationError) {
      return { success: false, error: validationError.message };
    }

    console.log('🔐 Authenticating user:', email);
    const result = await mongoDBService.authenticateUser(email, password);

    if (result.success) {
      // Set current user in subscription manager
      subscriptionManager.setCurrentUser(result.user);

      // Store user info in settings (convert ObjectId to string)
      settingsManager.setCurrentUser(result.user);

      // Update subscription info (convert ObjectId to string)
      settingsManager.updateSubscription({
        userId: result.user._id ? result.user._id.toString() : '',
        tier: result.user.subscription.tier,
        status: result.user.subscription.status,
        isActive: result.user.subscription.status === 'active',
        features: result.user.subscription.features,
        limits: result.user.subscription.limits
      });

      console.log('✅ User authenticated successfully');
    }

    return result;
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mongodb-register', async (event, userData) => {
  try {
    // Input validation
    try {
      validateInput('email', userData.email);
      validateInput('string', userData.password);
      validateInput('string', userData.fullName);
      userData.email = sanitizeString(userData.email);
      userData.fullName = sanitizeString(userData.fullName);
    } catch (validationError) {
      return { success: false, error: validationError.message };
    }

    console.log('📝 Registering new user:', userData.email);
    const result = await mongoDBService.registerUser(userData);

    if (result.success) {
      // Set current user in subscription manager
      subscriptionManager.setCurrentUser(result.user);

      // Store user info in settings
      settingsManager.setCurrentUser(result.user);

      // Update subscription info
      settingsManager.updateSubscription({
        userId: result.user._id,
        tier: result.user.subscription.tier,
        status: result.user.subscription.status,
        isActive: result.user.subscription.status === 'active',
        features: result.user.subscription.features,
        limits: result.user.subscription.limits
      });

      console.log('✅ User registered successfully');
    }

    return result;
  } catch (error) {
    console.error('❌ Registration error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('mongodb-logout', async (event) => {
  try {
    console.log('🔓 Logging out user');
    subscriptionManager.clearCurrentUser();
    settingsManager.clearCurrentUser();
    return { success: true };
  } catch (error) {
    console.error('❌ Logout error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('subscription-get', async (event) => {
  try {
    console.log('📊 [subscription-get] Checking authentication status...');

    const currentUser = subscriptionManager.getCurrentUser();
    const settingsUser = settingsManager.getCurrentUser();

    console.log('📊 [subscription-get] subscriptionManager.currentUser:', currentUser ? currentUser.email : 'NULL');
    console.log('📊 [subscription-get] settingsManager.currentUser:', settingsUser);

    if (!currentUser) {
      console.log('❌ [subscription-get] No user in subscriptionManager - user not logged in');

      // Clear any stale data in settings
      if (settingsUser && settingsUser.isLoggedIn) {
        console.log('🧹 [subscription-get] Clearing stale session data from settings');
        settingsManager.clearCurrentUser();
      }

      return {
        success: false,
        error: 'No user logged in',
        subscription: {
          tier: 'free',
          status: 'inactive',
          features: [],
          limits: {}
        }
      };
    }

    console.log('✅ [subscription-get] User authenticated:', currentUser.email);
    return {
      success: true,
      subscription: currentUser.subscription,
      user: {
        email: currentUser.email,
        fullName: currentUser.fullName || currentUser.name
      }
    };
  } catch (error) {
    console.error('❌ Error getting subscription:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('subscription-get-usage', async (event) => {
  try {
    const usageStats = subscriptionManager.getUsageStats();

    if (!usageStats) {
      return { success: false, error: 'No user logged in' };
    }

    return { success: true, usage: usageStats };
  } catch (error) {
    console.error('❌ Error getting usage stats:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-feature-access', async (event, featureName) => {
  try {
    const result = subscriptionManager.canUseFeature(featureName);
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error checking feature access:', error);
    return { success: false, allowed: false, reason: error.message };
  }
});

ipcMain.handle('check-message-limit', async (event) => {
  try {
    const result = subscriptionManager.canSendMessage();
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error checking message limit:', error);
    return { success: false, allowed: false, reason: error.message };
  }
});

ipcMain.handle('check-workflow-limit', async (event, stepCount) => {
  try {
    const result = subscriptionManager.canCreateWorkflow(stepCount);
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error checking workflow limit:', error);
    return { success: false, allowed: false, reason: error.message };
  }
});

ipcMain.handle('check-mcp-limit', async (event, currentCount) => {
  try {
    const result = subscriptionManager.canAddMCPConnection(currentCount);
    return { success: true, ...result };
  } catch (error) {
    console.error('❌ Error checking MCP limit:', error);
    return { success: false, allowed: false, reason: error.message };
  }
});

ipcMain.handle('increment-message-usage', async (event) => {
  try {
    const result = await subscriptionManager.incrementMessageUsage();
    return result;
  } catch (error) {
    console.error('❌ Error incrementing message usage:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-transcription-usage', async (event, minutesUsed) => {
  try {
    const result = await subscriptionManager.updateTranscriptionUsage(minutesUsed);
    return result;
  } catch (error) {
    console.error('❌ Error updating transcription usage:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('update-workflow-count', async (event, count) => {
  try {
    const result = await subscriptionManager.updateWorkflowCount(count);
    return result;
  } catch (error) {
    console.error('❌ Error updating workflow count:', error);
    return { success: false, error: error.message };
  }
});

// ================================
// TRANSCRIPTION IPC HANDLERS
// ================================

const transcriptionAIService = require('./transcription-ai-service');

// Save transcription to MongoDB
ipcMain.handle('transcription-save', async (event, transcriptionData) => {
  try {
    const currentUser = subscriptionManager.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not logged in' };
    }

    // Check subscription limits
    const canUse = await subscriptionManager.canUseTranscription();
    if (!canUse) {
      return { success: false, error: 'Transcription limit reached for your plan' };
    }

    // Save to MongoDB
    const saved = await mongoDBService.saveTranscription(
      currentUser._id.toString(),
      transcriptionData
    );

    // Update usage
    const durationMinutes = Math.ceil(transcriptionData.duration / 60);
    await subscriptionManager.updateTranscriptionUsage(durationMinutes);

    return { success: true, transcription: saved };
  } catch (error) {
    console.error('Error saving transcription:', error);
    return { success: false, error: error.message };
  }
});

// Get user's transcription library
ipcMain.handle('transcription-get-all', async (event) => {
  try {
    const currentUser = subscriptionManager.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not logged in' };
    }

    const transcriptions = await mongoDBService.getTranscriptions(
      currentUser._id.toString()
    );

    return { success: true, transcriptions };
  } catch (error) {
    console.error('Error getting transcriptions:', error);
    return { success: false, error: error.message };
  }
});

// Generate AI workflow suggestion
ipcMain.handle('transcription-generate-workflow', async (event, { transcriptionId, userGoal }) => {
  try {
    const transcription = await mongoDBService.getTranscriptionById(transcriptionId);
    if (!transcription) {
      return { success: false, error: 'Transcription not found' };
    }

    const workflowSuggestion = await transcriptionAIService.generateWorkflowSuggestion(
      transcription.text,
      userGoal
    );

    // Save suggestion to transcription
    await mongoDBService.updateTranscriptionWorkflow(transcriptionId, workflowSuggestion);

    return { success: true, workflow: workflowSuggestion };
  } catch (error) {
    console.error('Error generating workflow:', error);
    return { success: false, error: error.message };
  }
});

// Delete transcription
ipcMain.handle('transcription-delete', async (event, transcriptionId) => {
  try {
    const currentUser = subscriptionManager.getCurrentUser();
    if (!currentUser) {
      return { success: false, error: 'User not logged in' };
    }

    await mongoDBService.deleteTranscription(transcriptionId, currentUser._id.toString());
    return { success: true };
  } catch (error) {
    console.error('Error deleting transcription:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('refresh-user-data', async (event) => {
  try {
    const result = await subscriptionManager.refreshUserData();

    if (result.success) {
      settingsManager.setCurrentUser(result.user);
      settingsManager.updateSubscription({
        userId: result.user._id,
        tier: result.user.subscription.tier,
        status: result.user.subscription.status,
        isActive: result.user.subscription.status === 'active',
        features: result.user.subscription.features,
        limits: result.user.subscription.limits
      });
    }

    return result;
  } catch (error) {
    console.error('❌ Error refreshing user data:', error);
    return { success: false, error: error.message };
  }
});

// ================================
// AUTHENTICATION IPC HANDLERS
// ================================

// Authenticate user
ipcMain.handle('authenticate-user', async (event, loginData) => {
  try {
    console.log('🔐 Authenticating user:', loginData.email);

    // For demo purposes, check demo credentials first
    if (loginData.email === 'demo@redglass.ai' && loginData.password === 'demo123') {
      const demoUser = {
        _id: 'demo-user-12345',
        fullName: 'Demo User',
        email: 'demo@redglass.ai',
        createdAt: new Date(),
        subscription: {
          tier: 'pro',
          status: 'active',
          expiresAt: null
        }
      };

      console.log('✅ Demo user authenticated successfully');
      return { success: true, user: demoUser };
    }

    // Try MongoDB authentication
    try {
      const result = await mongoDBService.getUserByEmail(loginData.email);

      if (result.success) {
        // In a real app, you would verify the password hash here
        // For now, we'll simulate password verification
        console.log('✅ User found in database:', result.user.email);

        // Update last login
        await mongoDBService.updateUser(result.user._id, {
          lastLogin: new Date()
        });

        return { success: true, user: result.user };
      } else {
        console.log('❌ User not found in database');
        return { success: false, error: 'Invalid email or password' };
      }
    } catch (dbError) {
      console.error('❌ Database authentication error:', dbError);
      // Fallback to demo mode if database is unavailable
      return { success: false, error: 'Authentication service temporarily unavailable' };
    }
  } catch (error) {
    console.error('❌ Authentication error:', error);
    return { success: false, error: 'Authentication failed. Please try again.' };
  }
});

// Register user
ipcMain.handle('register-user', async (event, registerData) => {
  try {
    console.log('📝 Registering new user:', registerData.email);

    // Check if user already exists
    try {
      const existingUser = await mongoDBService.getUserByEmail(registerData.email);
      if (existingUser.success) {
        return { success: false, error: 'An account with this email already exists' };
      }
    } catch (error) {
      // User doesn't exist, continue with registration
    }

    // Create new user
    const newUserData = {
      fullName: registerData.fullName,
      email: registerData.email,
      // In a real app, you would hash the password here
      passwordHash: 'hashed_' + registerData.password, // Placeholder
      subscription: {
        tier: 'free',
        status: 'active',
        expiresAt: null
      }
    };

    try {
      const result = await mongoDBService.createUser(newUserData);

      if (result.success) {
        console.log('✅ User registered successfully:', result.user.email);
        return { success: true, user: result.user };
      } else {
        console.error('❌ Failed to create user:', result.error);
        return { success: false, error: 'Failed to create account. Please try again.' };
      }
    } catch (dbError) {
      console.error('❌ Database registration error:', dbError);
      return { success: false, error: 'Registration service temporarily unavailable' };
    }
  } catch (error) {
    console.error('❌ Registration error:', error);
    return { success: false, error: 'Registration failed. Please try again.' };
  }
});

// Handle successful authentication
ipcMain.handle('auth-success', async (event, user) => {
  try {
    console.log('✅ Authentication successful for:', user.email);

    // Save authentication data
    saveAuthData(user);

    // Close auth window
    if (authWindow) {
      authWindow.close();
      authWindow = null;
    }

    // Create main window
    createWindow();

    return { success: true };
  } catch (error) {
    console.error('❌ Auth success handler error:', error);
    return { success: false, error: error.message };
  }
});

// Logout user
ipcMain.handle('logout-user', async (event) => {
  try {
    console.log('🚪 Logging out user:', currentUser?.email || 'unknown');

    // Clear authentication data
    clearAuthData();

    // Close main window
    if (mainWindow) {
      mainWindow.close();
      mainWindow = null;
    }

    // Show auth window
    createAuthWindow();

    return { success: true };
  } catch (error) {
    console.error('❌ Logout error:', error);
    return { success: false, error: error.message };
  }
});

// Get current user
ipcMain.handle('get-current-user', async (event) => {
  try {
    return {
      success: true,
      user: currentUser,
      isAuthenticated: isAuthenticated
    };
  } catch (error) {
    console.error('❌ Get current user error:', error);
    return { success: false, error: error.message };
  }
});

// Get environment variable (for API keys)
ipcMain.handle('get-env-var', async (event, varName) => {
  try {
    const value = process.env[varName];
    return value || null;
  } catch (error) {
    console.error(`Error getting env var ${varName}:`, error);
    return null;
  }
});

// ================================
// CHAT HISTORY IPC HANDLERS
// ================================

// Get chat history
ipcMain.handle('get-chat-history', async (event) => {
  try {
    console.log('📜 Getting chat history');

    // Try to get chat history from localStorage via the main window
    if (mainWindow && mainWindow.webContents) {
      const history = await mainWindow.webContents.executeJavaScript(`
        try {
          const chatHistory = localStorage.getItem('redGlassChatHistory');
          return chatHistory ? JSON.parse(chatHistory) : [];
        } catch (e) {
          console.error('Error getting chat history:', e);
          return [];
        }
      `);

      return { success: true, history };
    }

    return { success: true, history: [] };
  } catch (error) {
    console.error('❌ Get chat history error:', error);
    return { success: false, error: error.message };
  }
});

// Clear current chat
ipcMain.handle('clear-current-chat', async (event) => {
  try {
    console.log('🗑️ Clearing current chat');

    // Try to clear current chat via the main window
    if (mainWindow && mainWindow.webContents) {
      await mainWindow.webContents.executeJavaScript(`
        try {
          // Clear current chat messages
          localStorage.setItem('redGlassCurrentChat', '[]');
          
          // Clear conversation view if it exists
          const conversationView = document.querySelector('.conversation-view');
          if (conversationView) {
            conversationView.innerHTML = '';
          }
          
          // Clear chat input if it exists
          const chatInput = document.getElementById('chat-input');
          if (chatInput) {
            chatInput.value = '';
          }
          
          console.log('✅ Chat cleared successfully');
          return true;
        } catch (e) {
          console.error('Error clearing chat:', e);
          return false;
        }
      `);
    }

    return { success: true, message: 'Chat cleared successfully' };
  } catch (error) {
    console.error('❌ Clear chat error:', error);
    return { success: false, error: error.message };
  }
});

// ================================
// REALTIME TRANSCRIPTION (DEEPGRAM)
// ================================

const realtimeTranscription = require('./realtime-transcription-service');

// Start transcription
ipcMain.handle('transcription-start', async (event) => {
  try {
    console.log('🎙️ Starting Deepgram transcription...');

    await realtimeTranscription.startRecording(
      // onTranscript callback
      (data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('transcription-result', data);
        }
      },
      // onError callback
      (error) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('transcription-error', {
            message: error.message
          });
        }
      }
    );

    return { success: true };
  } catch (error) {
    console.error('❌ Failed to start transcription:', error);
    return { success: false, error: error.message };
  }
});

// Send audio data
ipcMain.handle('transcription-send-audio', async (event, audioData) => {
  try {
    realtimeTranscription.sendAudio(audioData);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Stop transcription
ipcMain.handle('transcription-stop', async (event) => {
  try {
    const result = await realtimeTranscription.stopRecording();
    return {
      success: true,
      ...result
    };
  } catch (error) {
    console.error('❌ Failed to stop transcription:', error);
    return { success: false, error: error.message };
  }
});

// Get transcription status
ipcMain.handle('transcription-status', async (event) => {
  try {
    const status = realtimeTranscription.getStatus();
    return { success: true, ...status };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Generate workflow from transcript (updated for new flow)
ipcMain.handle('transcription-create-workflow', async (event, { transcript, goal }) => {
  try {
    const transcriptionAIService = require('./transcription-ai-service');

    const workflowSuggestion = await transcriptionAIService.generateWorkflowSuggestion(
      transcript,
      goal
    );

    return { success: true, workflow: workflowSuggestion };
  } catch (error) {
    console.error('Error generating workflow:', error);
    return { success: false, error: error.message };
  }
});


// ================================
// OAUTH AUTHENTICATION HANDLERS
// ================================

// OAuth Authentication Handlers
ipcMain.handle('auth-get-current-user', async () => {
  return authManager.getCurrentUser();
});

ipcMain.handle('auth-refresh-user-data', async () => {
  return await authManager.refreshUserData();
});

ipcMain.handle('auth-logout', async () => {
  authManager.logout();
  if (mainWindow) {
    mainWindow.close();
  }
  createAuthWindow();
  return { success: true };
});
