// Workflow Executor with MCP Tool Support
// Manages workflow storage, triggers, and execution

const fs = require('fs');
const path = require('path');

class WorkflowExecutor {
  constructor(mcpManager) {
    this.mcpManager = mcpManager;
    this.workflows = new Map(); // id -> workflow
    this.workflowsPath = path.join(__dirname, '../data/workflows.json');
    this.executionHistory = [];
    this.maxHistorySize = 100;
    
    // Ensure data directory exists
    const dataDir = path.dirname(this.workflowsPath);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    
    // Load workflows from disk
    this.loadWorkflows();
    
    console.log('✅ Workflow Executor initialized');
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
          
          // Update context with result (for variable substitution)
          context.lastResult = result;
          
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
   */
  async executeNotificationAction(action, context) {
    const { title, message } = action;
    
    const resolvedTitle = this.substituteVariables(title, context);
    const resolvedMessage = this.substituteVariables(message, context);
    
    console.log(`    🔔 Notification: ${resolvedTitle}`);
    
    // TODO: Send to renderer for display
    return {
      title: resolvedTitle,
      message: resolvedMessage
    };
  }
  
  /**
   * Execute clipboard action
   */
  async executeClipboardAction(action, context) {
    const { operation, content } = action;
    
    if (operation === 'copy') {
      const resolvedContent = this.substituteVariables(content, context);
      console.log(`    📋 Copy to clipboard: ${resolvedContent.substring(0, 50)}...`);
      
      // TODO: Copy to clipboard
      return { copied: resolvedContent };
    }
    
    return {};
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
   */
  substituteVariables(value, context) {
    if (typeof value === 'string') {
      return value.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return context[key] || match;
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

