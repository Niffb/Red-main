const { ipcRenderer } = require('electron');
const { validateChannel } = require('./ipc-security');

// Preload script loaded

window.ipcRenderer = ipcRenderer;

// Expose Electron API for window movement
window.electronAPI = {
  // Generic invoke method for all IPC calls
  invoke: async (channel, ...args) => {
    try {
      validateChannel(channel);
      return await ipcRenderer.invoke(channel, ...args);
    } catch (error) {
      console.error('IPC Security Error:', error.message);
      throw error;
    }
  },
  
  moveWindow: (deltaX, deltaY) => ipcRenderer.invoke('move-window', deltaX, deltaY),
  setWindowPosition: (x, y) => ipcRenderer.invoke('set-window-position', x, y),
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  moveAskWindow: (deltaX, deltaY) => ipcRenderer.invoke('move-ask-window', deltaX, deltaY),
  resizeWindow: (width, height) => ipcRenderer.invoke('resize-window', width, height),
  captureScreenshot: (quality = 'medium') => ipcRenderer.invoke('capture-screenshot', quality),
  askAboutScreen: (question) => ipcRenderer.invoke('ask-about-screen', question),
  updateConversationHistory: (messages) => ipcRenderer.invoke('update-conversation-history', messages),
  callDeepSeekAPI: (message) => ipcRenderer.invoke('call-deepseek-api', message),
  callDeepSeekAPIWithScreen: (data) => ipcRenderer.invoke('call-deepseek-api-with-screen', data),
  
  
  // Workflows APIs
  saveWorkflow: (workflow) => ipcRenderer.invoke('save-workflow', workflow),
  loadWorkflows: () => ipcRenderer.invoke('load-workflows'),
  deleteWorkflow: (workflowId) => ipcRenderer.invoke('delete-workflow', workflowId),
  
  // Gemini Live APIs
  startGeminiLive: (options = {}) => ipcRenderer.invoke('start-gemini-live', options),
  stopGeminiLive: () => ipcRenderer.invoke('stop-gemini-live'),
  sendToGeminiLive: (message) => ipcRenderer.invoke('send-to-gemini-live', message),
  getGeminiLiveStatus: () => ipcRenderer.invoke('get-gemini-live-status'),
  interruptGeminiLive: () => ipcRenderer.invoke('interrupt-gemini-live'),
  
  // Transcription APIs
  checkGeminiLiveService: () => ipcRenderer.invoke('check-gemini-live-service'),
  sendGeminiCommand: (command) => ipcRenderer.invoke('send-gemini-command', command),
  saveTranscript: (text) => ipcRenderer.invoke('save-transcript', text),
  attachTranscriptToChat: (text) => ipcRenderer.invoke('attach-transcript-to-chat', text),
  onGeminiEvent: (callback) => {
    const listener = (event, data) => callback(data.event, data.data);
    ipcRenderer.on('gemini-event', listener);
    return () => ipcRenderer.removeListener('gemini-event', listener);
  },
  
  // Real-time Transcription APIs (Deepgram)
  transcriptionStart: () => ipcRenderer.invoke('transcription-start'),
  transcriptionStop: () => ipcRenderer.invoke('transcription-stop'),
  transcriptionSendAudio: (audioData) => ipcRenderer.invoke('transcription-send-audio', audioData),
  transcriptionStatus: () => ipcRenderer.invoke('transcription-status'),
  onTranscriptionResult: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('transcription-result', listener);
    return () => ipcRenderer.removeListener('transcription-result', listener);
  },
  onTranscriptionError: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('transcription-error', listener);
    return () => ipcRenderer.removeListener('transcription-error', listener);
  },

  // Explicit AI routing
  callAiText: (text, imageBase64, mimeType, conversationHistory) => ipcRenderer.invoke('ai-text', { text, imageBase64, mimeType, conversationHistory }),
  callAiVision: ({ text, imageBase64, mimeType }) => ipcRenderer.invoke('ai-vision', { text, imageBase64, mimeType }),
  executeWorkflow: (workflowId, input) => ipcRenderer.invoke('execute-workflow', workflowId, input),
  
  // Enhanced Scheduled Workflows APIs
  createScheduledWorkflow: (workflowData) => ipcRenderer.invoke('create-scheduled-workflow', workflowData),
  getScheduledWorkflows: () => ipcRenderer.invoke('get-scheduled-workflows'),
  toggleScheduledWorkflow: (workflowId) => ipcRenderer.invoke('toggle-scheduled-workflow', workflowId),
  deleteScheduledWorkflow: (workflowId) => ipcRenderer.invoke('delete-scheduled-workflow', workflowId),
  executeScheduledWorkflow: (workflowId, input) => ipcRenderer.invoke('execute-scheduled-workflow', workflowId, input),
  getWorkflowExecutionHistory: (workflowId) => ipcRenderer.invoke('get-workflow-execution-history', workflowId),
  createWorkflowFromPrompt: (prompt) => ipcRenderer.invoke('create-workflow-from-prompt', prompt),

  // MCP Server APIs
  mcpAddServer: (config) => ipcRenderer.invoke('mcp-add-server', config),
  mcpRemoveServer: (serverName) => ipcRenderer.invoke('mcp-remove-server', { serverName }),
  mcpGetStatus: (serverName) => ipcRenderer.invoke('mcp-get-status', { serverName }),
  mcpGetTools: () => ipcRenderer.invoke('mcp-get-tools'),
  mcpExecuteTool: (server, tool, params) => ipcRenderer.invoke('mcp-execute-tool', { server, tool, params }),
  mcpGetServerTools: (serverName) => ipcRenderer.invoke('mcp-get-server-tools', { serverName }),
  mcpListServers: () => ipcRenderer.invoke('mcp-list-servers'),
  
  // MCP Event Listener
  onMcpEvent: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('mcp-event', listener);
    return () => ipcRenderer.removeListener('mcp-event', listener);
  },
  
  // Workflow APIs
  workflowCreate: (workflow) => ipcRenderer.invoke('workflow-create', workflow),
  workflowUpdate: (id, updates) => ipcRenderer.invoke('workflow-update', { id, updates }),
  workflowDelete: (id) => ipcRenderer.invoke('workflow-delete', { id }),
  workflowList: () => ipcRenderer.invoke('workflow-list'),
  workflowGet: (id) => ipcRenderer.invoke('workflow-get', { id }),
  workflowExecute: (id, context) => ipcRenderer.invoke('workflow-execute', { id, context }),
  workflowHistory: (limit) => ipcRenderer.invoke('workflow-history', { limit }),
  workflowClearHistory: () => ipcRenderer.invoke('workflow-clear-history'),
  workflowCheckTriggers: (context) => ipcRenderer.invoke('workflow-check-triggers', context),

  // MongoDB Authentication APIs
  mongodbAuthenticate: (email, password) => ipcRenderer.invoke('mongodb-authenticate', { email, password }),
  mongodbRegister: (userData) => ipcRenderer.invoke('mongodb-register', userData),
  mongodbLogout: () => ipcRenderer.invoke('mongodb-logout'),

  // Subscription APIs
  subscriptionGet: () => ipcRenderer.invoke('subscription-get'),
  subscriptionGetUsage: () => ipcRenderer.invoke('subscription-get-usage'),
  refreshUserData: () => ipcRenderer.invoke('refresh-user-data'),

  // Feature Access Check APIs
  checkFeatureAccess: (featureName) => ipcRenderer.invoke('check-feature-access', featureName),
  checkMessageLimit: () => ipcRenderer.invoke('check-message-limit'),
  checkWorkflowLimit: (stepCount) => ipcRenderer.invoke('check-workflow-limit', stepCount),
  checkMcpLimit: (currentCount) => ipcRenderer.invoke('check-mcp-limit', currentCount),

  // Usage Tracking APIs
  incrementMessageUsage: () => ipcRenderer.invoke('increment-message-usage'),
  updateTranscriptionUsage: (minutesUsed) => ipcRenderer.invoke('update-transcription-usage', minutesUsed),
  updateWorkflowCount: (count) => ipcRenderer.invoke('update-workflow-count', count),

  // Transcription APIs
  transcriptionCreateWorkflow: (transcript, goal) => 
    ipcRenderer.invoke('transcription-create-workflow', { transcript, goal }),
  transcriptionSave: (data) => ipcRenderer.invoke('transcription-save', data),
  transcriptionGetAll: () => ipcRenderer.invoke('transcription-get-all'),
  transcriptionDelete: (id) => ipcRenderer.invoke('transcription-delete', id),

};

// electronAPI initialized 