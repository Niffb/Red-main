// Workflow Executor with MCP Tool Support
// Manages workflow storage, triggers, and execution

const fs = require('fs');
const path = require('path');
const { app, clipboard, Notification, BrowserWindow } = require('electron');

class WorkflowExecutor {
  constructor(mcpManager) {
    this.mcpManager = mcpManager;
    this.workflows = new Map(); // id -> workflow
    // Use app's userData directory for writable storage (not inside app.asar)
    const userDataPath = app.getPath('userData');
    this.workflowsPath = path.join(userDataPath, 'workflows.json');
    this.executionHistory = [];
    this.maxHistorySize = 100;
    
    // Scheduler state
    this.scheduledTimers = new Map();
    this.lastScheduleCheck = new Date();
    
    // Ensure data directory exists (userData should exist, but just in case)
    const dataDir = path.dirname(this.workflowsPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load workflows from disk
    this.loadWorkflows();
    
    // Start the scheduler
    this.startScheduler();
    
    console.log('✅ Workflow Executor initialized with scheduler');
  }
  
  /**
   * Start the workflow scheduler
   * Checks every minute for workflows that should run
   */
  startScheduler() {
    console.log('⏰ Starting workflow scheduler...');
    
    // Check schedules every minute
    this.schedulerInterval = setInterval(() => {
      this.checkScheduledWorkflows();
    }, 60000);
    
    // Also check immediately on startup
    setTimeout(() => this.checkScheduledWorkflows(), 5000);
  }
  
  /**
   * Check and run any scheduled workflows that are due
   */
  checkScheduledWorkflows() {
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const currentDay = now.getDay();
    const currentDate = now.getDate();
    
    console.log(`⏰ Checking schedules at ${currentTime}...`);
    
    for (const [id, workflow] of this.workflows) {
      if (!workflow.enabled) continue;
      if (workflow.trigger?.type !== 'schedule') continue;
      
      const schedule = workflow.trigger.schedule;
      if (!schedule) continue;
      
      const scheduledTime = schedule.time;
      if (scheduledTime !== currentTime) continue;
      
      let shouldRun = false;
      
      if (schedule.frequency === 'daily') {
        shouldRun = true;
      } else if (schedule.frequency === 'weekly') {
        const dayNum = currentDay === 0 ? 7 : currentDay;
        if (schedule.daysOfWeek && schedule.daysOfWeek.includes(dayNum)) {
          shouldRun = true;
        }
      } else if (schedule.frequency === 'monthly') {
        if (schedule.dayOfMonth && parseInt(schedule.dayOfMonth) === currentDate) {
          shouldRun = true;
        }
      }
      
      if (shouldRun) {
        const lastRunKey = `${id}_${currentTime}`;
        if (this._lastScheduleRuns && this._lastScheduleRuns.has(lastRunKey)) {
          continue;
        }
        
        if (!this._lastScheduleRuns) this._lastScheduleRuns = new Map();
        this._lastScheduleRuns.set(lastRunKey, true);
        
        setTimeout(() => {
          if (this._lastScheduleRuns) this._lastScheduleRuns.delete(lastRunKey);
        }, 120000);
        
        console.log(`⏰ Running scheduled workflow: ${workflow.name}`);
        
        this.executeWorkflow(id, {
          trigger: 'schedule',
          scheduledTime: currentTime,
          timestamp: now.toISOString()
        }).then(result => {
          console.log(`✅ Scheduled workflow "${workflow.name}" completed:`, result.success ? 'success' : 'failed');
          this.showScheduleNotification(workflow.name, result.success);
        }).catch(error => {
          console.error(`❌ Scheduled workflow "${workflow.name}" failed:`, error);
          this.showScheduleNotification(workflow.name, false, error.message);
        });
      }
    }
  }
  
  /**
   * Show notification when a scheduled workflow runs
   */
  showScheduleNotification(workflowName, success, error = null) {
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: success ? `✅ ${workflowName}` : `❌ ${workflowName} Failed`,
          body: success ? 'Scheduled workflow completed successfully' : `Error: ${error || 'Unknown error'}`,
          silent: false
        });
        notification.show();
      }
      
      const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      if (mainWindow) {
        mainWindow.webContents.send('show-notification', {
          title: success ? `⏰ ${workflowName}` : `❌ ${workflowName} Failed`,
          message: success ? 'Scheduled workflow completed' : `Error: ${error || 'Unknown error'}`,
          type: success ? 'success' : 'error',
          duration: 5000
        });
      }
    } catch (err) {
      console.error('Failed to show schedule notification:', err);
    }
  }
  
  /**
   * Stop the scheduler (for cleanup)
   */
  stopScheduler() {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      console.log('⏰ Scheduler stopped');
    }
  }
  
  /**
   * Load workflows from disk
   */
  loadWorkflows() {
    try {
      if (fs.existsSync(this.workflowsPath)) {
        const data = fs.readFileSync(this.workflowsPath, 'utf8');
        const workflowsArray = JSON.parse(data);
        
        workflowsArray.forEach(workflow => {
          this.workflows.set(workflow.id, workflow);
        });
        
        console.log(`📋 Loaded ${this.workflows.size} workflows`);
      }
    } catch (error) {
      console.error('❌ Failed to load workflows:', error);
    }
  }
  
  /**
   * Save workflows to disk
   */
  saveWorkflows() {
    try {
      const workflowsArray = Array.from(this.workflows.values());
      fs.writeFileSync(this.workflowsPath, JSON.stringify(workflowsArray, null, 2));
      console.log(`💾 Saved ${workflowsArray.length} workflows`);
    } catch (error) {
      console.error('❌ Failed to save workflows:', error);
      throw error;
    }
  }
  
  /**
   * Create a new workflow
   */
  createWorkflow(workflow) {
    const id = workflow.id || `workflow_${Date.now()}`;
    const newWorkflow = {
      id,
      name: workflow.name || 'Untitled Workflow',
      description: workflow.description || '',
      enabled: workflow.enabled !== undefined ? workflow.enabled : true,
      trigger: workflow.trigger || { type: 'manual' },
      actions: workflow.actions || [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    
    this.workflows.set(id, newWorkflow);
    this.saveWorkflows();
    
    console.log(`✅ Created workflow: ${newWorkflow.name} (${id})`);
    return newWorkflow;
  }
  
  /**
   * Update an existing workflow
   */
  updateWorkflow(id, updates) {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }
    
    const updatedWorkflow = {
      ...workflow,
      ...updates,
      id, // Preserve ID
      createdAt: workflow.createdAt, // Preserve creation time
      updatedAt: Date.now()
    };
    
    this.workflows.set(id, updatedWorkflow);
    this.saveWorkflows();
    
    console.log(`✅ Updated workflow: ${updatedWorkflow.name} (${id})`);
    return updatedWorkflow;
  }
  
  /**
   * Delete a workflow
   */
  deleteWorkflow(id) {
    const workflow = this.workflows.get(id);
    if (!workflow) {
      throw new Error(`Workflow not found: ${id}`);
    }
    
    this.workflows.delete(id);
    this.saveWorkflows();
    
    console.log(`🗑️ Deleted workflow: ${workflow.name} (${id})`);
    return { success: true, id };
  }
  
  /**
   * Get all workflows
   */
  getAllWorkflows() {
    return Array.from(this.workflows.values());
  }
  
  /**
   * Get a single workflow
   */
  getWorkflow(id) {
    return this.workflows.get(id);
  }
  
  /**
   * Check if a message/event matches any workflow triggers
   */
  async checkTriggers(context) {
    const matchedWorkflows = [];
    
    for (const workflow of this.workflows.values()) {
      if (!workflow.enabled) continue;
      
      if (this.matchesTrigger(workflow.trigger, context)) {
        matchedWorkflows.push(workflow);
      }
    }
    
    return matchedWorkflows;
  }
  
  /**
   * Check if a trigger matches the context
   */
  matchesTrigger(trigger, context) {
    switch (trigger.type) {
      case 'keyword':
        return this.matchKeywordTrigger(trigger, context);
      
      case 'intent':
        return this.matchIntentTrigger(trigger, context);
      
      case 'schedule':
        return this.matchScheduleTrigger(trigger, context);
      
      case 'manual':
        return context.manual === true;
      
      default:
        return false;
    }
  }
  
  /**
   * Match keyword trigger
   */
  matchKeywordTrigger(trigger, context) {
    if (!context.message) return false;
    
    const message = context.message.toLowerCase();
    const keywords = trigger.keywords || [];
    
    return keywords.some(keyword => {
      const pattern = keyword.toLowerCase();
      return message.includes(pattern);
    });
  }
  
  /**
   * Match intent trigger
   */
  matchIntentTrigger(trigger, context) {
    if (!context.intent) return false;
    
    const intents = trigger.intents || [];
    return intents.includes(context.intent);
  }
  
  /**
   * Match schedule trigger
   */
  matchScheduleTrigger(trigger, context) {
    // TODO: Implement time-based triggers
    return false;
  }
  
  /**
   * Execute a workflow
   */
  async executeWorkflow(workflowId, context = {}) {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }
    
    console.log(`🚀 Executing workflow: ${workflow.name} (${workflowId})`);
    
    const execution = {
      workflowId,
      workflowName: workflow.name,
      startTime: Date.now(),
      context,
      results: [],
      errors: [],
      success: true
    };
    
    try {
      // Execute each action in sequence
      for (let i = 0; i < workflow.actions.length; i++) {
        const action = workflow.actions[i];
        
        console.log(`  ⚡ Action ${i + 1}/${workflow.actions.length}: ${action.type}`);
        
        try {
          const result = await this.executeAction(action, context);
          execution.results.push({
            actionIndex: i,
            action,
            result,
            success: true
          });
          
          // ================================
          // VARIABLE CHAINING: Pass outputs to next actions
          // ================================
          context.lastResult = result;
          context.result = result;
          
          // Type-specific variables
          if (action.type === 'ai_prompt' && result) {
            context.aiResponse = result.response || result;
            console.log(`    📝 Set {{aiResponse}} = "${String(context.aiResponse).substring(0, 50)}..."`);
          } else if (action.type === 'http_request' && result) {
            context.httpResponse = result;
            console.log(`    📝 Set {{httpResponse}} available`);
          } else if (action.type === 'mcp_tool' && result) {
            context.mcpResult = result;
            console.log(`    📝 Set {{mcpResult}} available`);
          } else if (action.type === 'clipboard' && result) {
            if (result.operation === 'read' && result.content) {
              context.clipboard = result.content;
              console.log(`    📝 Set {{clipboard}} = "${String(context.clipboard).substring(0, 50)}..."`);
            }
          }
          
        } catch (error) {
          console.error(`  ❌ Action ${i + 1} failed:`, error);
          execution.errors.push({
            actionIndex: i,
            action,
            error: error.message
          });
          execution.success = false;
          
          // Stop execution on error (can be made configurable)
          break;
        }
      }
      
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      
      // Add to history
      this.addToHistory(execution);
      
      console.log(`✅ Workflow completed: ${workflow.name} (${execution.duration}ms)`);
      
      return execution;
      
    } catch (error) {
      execution.endTime = Date.now();
      execution.duration = execution.endTime - execution.startTime;
      execution.success = false;
      execution.errors.push({
        actionIndex: -1,
        error: error.message
      });
      
      console.error(`❌ Workflow failed: ${workflow.name}`, error);
      
      this.addToHistory(execution);
      throw error;
    }
  }
  
  /**
   * Execute a single action
   */
  async executeAction(action, context) {
    switch (action.type) {
      case 'mcp_tool':
        return await this.executeMcpToolAction(action, context);
      
      case 'ai_prompt':
        return await this.executeAiPromptAction(action, context);
      
      case 'notification':
        return await this.executeNotificationAction(action, context);
      
      case 'clipboard':
        return await this.executeClipboardAction(action, context);
      
      case 'http_request':
        return await this.executeHttpRequestAction(action, context);
      
      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }
  }
  
  /**
   * Execute MCP tool action
   */
  async executeMcpToolAction(action, context) {
    const { server, tool, parameters } = action;
    
    if (!server || !tool) {
      throw new Error('MCP tool action requires server and tool');
    }
    
    // Substitute variables in parameters
    const resolvedParams = this.substituteVariables(parameters, context);
    
    console.log(`    🔧 Calling MCP tool: ${server}/${tool}`);
    
    // Execute tool via MCP manager
    const result = await this.mcpManager.sendToServer(server, {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: tool,
        arguments: resolvedParams
      }
    });
    
    if (result.error) {
      throw new Error(result.error.message || JSON.stringify(result.error));
    }
    
    return result.result;
  }
  
  /**
   * Execute AI prompt action
   */
  async executeAiPromptAction(action, context) {
    const { prompt, model } = action;
    
    if (!prompt) {
      throw new Error('AI prompt action requires prompt');
    }
    
    // Substitute variables in prompt
    const resolvedPrompt = this.substituteVariables(prompt, context);
    
    console.log(`    🤖 AI prompt: ${resolvedPrompt.substring(0, 50)}...`);
    
    // Integrate with Gemini API
    try {
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const geminiModel = genAI.getGenerativeModel({ model: model || 'gemini-2.0-flash-exp' });
      
      const result = await geminiModel.generateContent(resolvedPrompt);
      const response = result.response;
      const text = response.text();
      
      console.log(`    ✅ AI response received (${text.length} chars)`);
      
    return {
      prompt: resolvedPrompt,
        response: text,
        model: model || 'gemini-2.0-flash-exp'
    };
    } catch (error) {
      console.error(`    ❌ AI prompt failed:`, error);
      throw new Error(`AI prompt failed: ${error.message}`);
    }
  }
  
  /**
   * Execute notification action
   * Shows both system notification and in-app sticker
   */
  async executeNotificationAction(action, context) {
    const { title, message, sound } = action;
    
    const resolvedTitle = this.substituteVariables(title || 'Notification', context);
    const resolvedMessage = this.substituteVariables(message || '', context);
    
    console.log(`    🔔 Notification: ${resolvedTitle}`);
    
    // Show system notification using Electron's Notification API
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({
          title: resolvedTitle,
          body: resolvedMessage,
          silent: !sound
        });
        notification.show();
        console.log(`    ✅ System notification shown`);
      }
    } catch (error) {
      console.error(`    ❌ Failed to show system notification:`, error);
    }
    
    // Send to renderer for in-app sticker notification
    try {
      const mainWindow = BrowserWindow.getAllWindows().find(w => !w.isDestroyed());
      if (mainWindow) {
        mainWindow.webContents.send('show-notification', {
          title: resolvedTitle,
          message: resolvedMessage,
          type: 'workflow',
          duration: action.duration || 5000
        });
        console.log(`    ✅ In-app notification sent to renderer`);
      }
    } catch (error) {
      console.error(`    ❌ Failed to send in-app notification:`, error);
    }
    
    return {
      success: true,
      title: resolvedTitle,
      message: resolvedMessage
    };
  }
  
  /**
   * Execute clipboard action
   * Supports: copy, read, append operations
   */
  async executeClipboardAction(action, context) {
    const { operation, content } = action;
    
    switch (operation) {
      case 'copy': {
        const resolvedContent = this.substituteVariables(content, context);
        const contentPreview = resolvedContent.length > 50 
          ? resolvedContent.substring(0, 50) + '...' 
          : resolvedContent;
        console.log(`    📋 Copy to clipboard: ${contentPreview}`);
        
        // Actually write to system clipboard
        clipboard.writeText(resolvedContent);
        
        console.log(`    ✅ Copied ${resolvedContent.length} characters to clipboard`);
        return { 
          success: true,
          operation: 'copy',
          copied: resolvedContent,
          length: resolvedContent.length
        };
      }
      
      case 'read': {
        const clipboardContent = clipboard.readText();
        console.log(`    📋 Read from clipboard: ${clipboardContent.length} characters`);
        
        // Add to context so next actions can use {{clipboard}}
        context.clipboard = clipboardContent;
        
        return {
          success: true,
          operation: 'read',
          content: clipboardContent,
          length: clipboardContent.length
        };
      }
      
      case 'append': {
        const currentContent = clipboard.readText();
        const resolvedContent = this.substituteVariables(content, context);
        const newContent = currentContent + resolvedContent;
        
        console.log(`    📋 Append to clipboard: adding ${resolvedContent.length} characters`);
        
        clipboard.writeText(newContent);
        
        console.log(`    ✅ Clipboard now has ${newContent.length} characters`);
        return {
          success: true,
          operation: 'append',
          appended: resolvedContent,
          totalLength: newContent.length
        };
      }
      
      default:
        console.log(`    ⚠️ Unknown clipboard operation: ${operation}, defaulting to copy`);
        if (content) {
          const resolvedContent = this.substituteVariables(content, context);
          clipboard.writeText(resolvedContent);
          return { success: true, operation: 'copy', copied: resolvedContent };
        }
        return { success: false, error: 'No content provided' };
    }
  }
  
  /**
   * Execute HTTP request action
   */
  async executeHttpRequestAction(action, context) {
    const { method, url, headers, body } = action;
    
    const resolvedUrl = this.substituteVariables(url, context);
    
    console.log(`    🌐 HTTP ${method}: ${resolvedUrl}`);
    
    const fetch = require('node-fetch');
    const response = await fetch(resolvedUrl, {
      method: method || 'GET',
      headers: headers || {},
      body: body ? JSON.stringify(this.substituteVariables(body, context)) : undefined
    });
    
    const data = await response.json();
    return data;
  }
  
  /**
   * Substitute variables in a value
   * Supports: {{input}}, {{result}}, {{aiResponse}}, {{clipboard}}, {{httpResponse}}, {{mcpResult}}
   */
  substituteVariables(value, context) {
    if (typeof value === 'string') {
      return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        const contextValue = context[key];
        
        if (contextValue === undefined || contextValue === null) {
          return match; // Keep the placeholder if no value
        }
        
        // If the value is an object, stringify it
        if (typeof contextValue === 'object') {
          return JSON.stringify(contextValue);
        }
        
        return String(contextValue);
      });
    }
    
    if (Array.isArray(value)) {
      return value.map(item => this.substituteVariables(item, context));
    }
    
    if (typeof value === 'object' && value !== null) {
      const result = {};
      for (const [key, val] of Object.entries(value)) {
        result[key] = this.substituteVariables(val, context);
      }
      return result;
    }
    
    return value;
  }
  
  /**
   * Add execution to history
   */
  addToHistory(execution) {
    this.executionHistory.unshift(execution);
    
    // Keep only the last N executions
    if (this.executionHistory.length > this.maxHistorySize) {
      this.executionHistory = this.executionHistory.slice(0, this.maxHistorySize);
    }
  }
  
  /**
   * Get execution history
   */
  getHistory(limit = 20) {
    return this.executionHistory.slice(0, limit);
  }
  
  /**
   * Clear execution history
   */
  clearHistory() {
    this.executionHistory = [];
    console.log('🗑️ Execution history cleared');
  }
}

module.exports = WorkflowExecutor;

