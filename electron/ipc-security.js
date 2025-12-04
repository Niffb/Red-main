// IPC Security Layer
// Provides channel whitelisting and input validation for IPC communication

const ALLOWED_IPC_CHANNELS = new Set([
  // Window management
  'move-window',
  'set-window-position',
  'get-window-position',
  'move-ask-window',
  'resize-window',

  // Screenshot and vision
  'capture-screenshot',
  'ask-about-screen',

  // Conversation and history
  'update-conversation-history',

  // DeepSeek API
  'call-deepseek-api',
  'call-deepseek-api-with-screen',

  // Workflows
  'save-workflow',
  'load-workflows',
  'delete-workflow',
  'execute-workflow',

  // Gemini Live
  'start-gemini-live',
  'stop-gemini-live',
  'send-to-gemini-live',
  'get-gemini-live-status',
  'interrupt-gemini-live',

  // Transcription
  'check-gemini-live-service',
  'send-gemini-command',
  'save-transcript',
  'attach-transcript-to-chat',

  // RealtimeSTT Server
  'transcription-start',
  'transcription-stop',
  'transcription-send-audio',
  'transcription-status',
  'transcription-create-workflow',

  // AI routing
  'ai-text',
  'ai-vision',

  // Scheduled Workflows
  'create-scheduled-workflow',
  'get-scheduled-workflows',
  'toggle-scheduled-workflow',
  'delete-scheduled-workflow',
  'execute-scheduled-workflow',
  'get-workflow-execution-history',
  'create-workflow-from-prompt',

  // MCP Server
  'mcp-add-server',
  'mcp-remove-server',
  'mcp-get-status',
  'mcp-get-tools',
  'mcp-execute-tool',
  'mcp-get-server-tools',
  'mcp-list-servers',

  // Workflow management
  'workflow-create',
  'workflow-update',
  'workflow-delete',
  'workflow-list',
  'workflow-get',
  'workflow-execute',
  'workflow-history',
  'workflow-clear-history',
  'workflow-check-triggers',

  // MongoDB Authentication
  'mongodb-authenticate',
  'mongodb-register',
  'mongodb-logout',

  // Subscription
  'subscription-get',
  'subscription-get-usage',
  'refresh-user-data',

  // Feature Access
  'check-feature-access',
  'check-message-limit',
  'check-workflow-limit',
  'check-mcp-limit',

  // Usage Tracking
  'increment-message-usage',
  'update-transcription-usage',
  'update-workflow-count',

  // Transcription management
  'transcription-save',
  'transcription-get-all',
  'transcription-generate-workflow',
  'transcription-delete',
  'transcription-seed-demo',

  // Environment variables
  'get-env-var',

  // OAuth Authentication
  'auth-get-current-user',
  'auth-refresh-user-data',
  'auth-logout',
  'auth-error',
  'start-oauth-flow',
  'close-auth-window',

  // Settings
  'settings-get-setting'
]);

/**
 * Validate that an IPC channel is whitelisted
 * @param {string} channel - The IPC channel name
 * @returns {boolean} - Returns true if valid
 * @throws {Error} - Throws if channel is not whitelisted
 */
function validateChannel(channel) {
  if (!ALLOWED_IPC_CHANNELS.has(channel)) {
    const error = new Error(`Unauthorized IPC channel: ${channel}`);
    error.code = 'IPC_UNAUTHORIZED';
    throw error;
  }
  return true;
}

/**
 * Sanitize string input to prevent injection attacks
 * @param {string} str - The string to sanitize
 * @returns {string} - Sanitized string
 */
function sanitizeString(str) {
  if (typeof str !== 'string') return str;
  return str
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

/**
 * Validate input based on type
 * @param {string} type - The type of validation (email, string, object, etc.)
 * @param {*} data - The data to validate
 * @returns {boolean} - Returns true if valid
 * @throws {Error} - Throws if validation fails
 */
function validateInput(type, data) {
  switch (type) {
    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data)) {
        throw new Error('Invalid email format');
      }
      break;
    case 'string':
      if (typeof data !== 'string' || data.length > 10000) {
        throw new Error('Invalid string input');
      }
      break;
    case 'object':
      if (typeof data !== 'object' || data === null) {
        throw new Error('Invalid object input');
      }
      break;
    case 'number':
      if (typeof data !== 'number' || isNaN(data)) {
        throw new Error('Invalid number input');
      }
      break;
    case 'boolean':
      if (typeof data !== 'boolean') {
        throw new Error('Invalid boolean input');
      }
      break;
    default:
      // No validation for unknown types
      break;
  }
  return true;
}

module.exports = {
  ALLOWED_IPC_CHANNELS,
  validateChannel,
  sanitizeString,
  validateInput
};

