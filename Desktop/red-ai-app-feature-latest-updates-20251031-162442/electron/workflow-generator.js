// AI-Powered Workflow Generator
// Generates workflows from natural language using Gemini AI

const { GoogleGenerativeAI } = require('@google/generative-ai');

class WorkflowGenerator {
  constructor() {
    // Available actions that can be used in workflows
    this.availableActions = [
      { 
        type: 'ai_prompt', 
        description: 'Send a prompt to Gemini AI and get a response',
        params: ['prompt'],
        examples: ['Summarize this text', 'Translate to Spanish', 'Explain this concept']
      },
      { 
        type: 'notification', 
        description: 'Show a notification to the user (appears in chat as sticker)',
        params: ['title', 'message'],
        examples: ['Task completed!', 'Reminder alert']
      },
      { 
        type: 'clipboard', 
        description: 'Copy text to clipboard, read from clipboard, or append to clipboard',
        params: ['operation', 'content'],
        operations: ['copy', 'read', 'append'],
        examples: ['Copy AI response to clipboard', 'Read clipboard content']
      },
      { 
        type: 'http_request', 
        description: 'Make an HTTP request to an external API',
        params: ['method', 'url', 'headers', 'body'],
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        examples: ['Fetch weather data', 'Send to webhook']
      }
    ];
    
    // Available triggers for workflows
    this.availableTriggers = [
      { 
        type: 'manual', 
        description: 'Run manually by clicking the Start button',
        params: []
      },
      { 
        type: 'keyword', 
        description: 'Trigger when specific keywords are detected in chat',
        params: ['keywords'],
        examples: ['summarize', 'translate', 'explain']
      },
      { 
        type: 'schedule', 
        description: 'Run at scheduled times',
        params: ['time', 'frequency', 'daysOfWeek'],
        frequencies: ['daily', 'weekly', 'monthly'],
        examples: ['Every day at 9:00 AM', 'Every Monday at 8:00 AM']
      }
    ];
    
    console.log('✅ Workflow Generator initialized');
  }
  
  /**
   * Generate a workflow from natural language description
   * @param {string} userRequest - Natural language description of the workflow
   * @returns {Promise<{valid: boolean, workflow: object, errors: string[]}>}
   */
  async generateFromNaturalLanguage(userRequest) {
    console.log(`🔧 Generating workflow from: "${userRequest}"`);
    
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      const prompt = this.buildGenerationPrompt(userRequest);
      
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || 
                        responseText.match(/```\n?([\s\S]*?)\n?```/) ||
                        [null, responseText];
      
      const jsonString = jsonMatch[1] || responseText;
      
      // Parse and validate the workflow
      const workflow = JSON.parse(jsonString.trim());
      
      console.log('📋 Generated workflow:', JSON.stringify(workflow, null, 2));
      
      // Validate the generated workflow
      const validation = this.validateWorkflow(workflow);
      
      if (validation.valid) {
        // Add ID and ensure enabled
        workflow.id = `workflow_${Date.now()}`;
        workflow.enabled = true;
        
        return {
          valid: true,
          workflow,
          errors: []
        };
      } else {
        return {
          valid: false,
          workflow: null,
          errors: validation.errors
        };
      }
      
    } catch (error) {
      console.error('❌ Failed to generate workflow:', error);
      return {
        valid: false,
        workflow: null,
        errors: [error.message]
      };
    }
  }
  
  /**
   * Generate a workflow from transcription content and user's goal
   * @param {string} transcription - The transcription content
   * @param {string} userGoal - What the user wants to achieve
   * @returns {Promise<{valid: boolean, workflow: object, errors: string[]}>}
   */
  async generateFromTranscriptionAndGoal(transcription, userGoal) {
    console.log(`🔧 Generating workflow from transcription and goal...`);
    console.log(`📝 Transcription length: ${transcription.length} chars`);
    console.log(`🎯 Goal: "${userGoal}"`);
    
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      
      // Truncate transcription if too long (keep first 4000 chars for context)
      const truncatedTranscription = transcription.length > 4000 
        ? transcription.substring(0, 4000) + '...[truncated]'
        : transcription;
      
      const prompt = `You are a workflow automation expert for Red Glass app.

TRANSCRIPTION CONTENT:
"""
${truncatedTranscription}
"""

USER'S GOAL:
"${userGoal}"

AVAILABLE ACTIONS:
- ai_prompt: Send text to Gemini AI for processing (params: prompt)
- notification: Show system/in-app notification (params: title, message, sound, duration)
- clipboard: Copy/read/append to clipboard (params: operation, content)
- http_request: Make HTTP API calls (params: method, url, headers, body)

AVAILABLE TRIGGERS:
- manual: User clicks to run
- keyword: Activates when keyword typed in chat (params: keywords array)
- schedule: Runs at specific times (params: schedule.time, schedule.frequency, schedule.daysOfWeek)

VARIABLE SYSTEM:
- {{input}} = User's trigger input (for keyword triggers)
- {{aiResponse}} = Previous AI action result
- {{clipboard}} = Clipboard content
- {{result}} = Last action result

Based on the transcription content and user's goal, generate a PRACTICAL workflow that:
1. Extracts relevant data/insights from the transcription
2. Uses available actions to achieve the user's goal
3. Chooses the most appropriate trigger
4. Chains actions logically to create value

IMPORTANT:
- For extracting action items, key points, summaries - use ai_prompt with relevant instructions
- For reminders - use schedule trigger with notification action
- For quick access to processed info - use clipboard to copy results
- Be creative but practical

Output ONLY valid JSON in this EXACT format:
{
  "name": "Workflow Name",
  "description": "What this workflow does",
  "enabled": true,
  "transcriptionContext": "Brief summary of what transcription content was used (1-2 sentences)",
  "trigger": {
    "type": "manual|keyword|schedule",
    "keywords": ["keyword1", "keyword2"],
    "schedule": { "time": "HH:MM", "frequency": "daily|weekly|monthly" }
  },
  "actions": [
    { "type": "ai_prompt", "prompt": "Your prompt here with {{input}} if needed" },
    { "type": "notification", "title": "Title", "message": "{{aiResponse}}", "sound": true, "duration": 5000 },
    { "type": "clipboard", "operation": "copy", "content": "{{aiResponse}}" }
  ]
}

Only include trigger properties relevant to the chosen trigger type.
Generate the workflow JSON now:`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      console.log('📋 Raw AI response:', responseText.substring(0, 500) + '...');
      
      // Extract JSON from response (handle markdown code blocks)
      const jsonMatch = responseText.match(/```json\n?([\s\S]*?)\n?```/) || 
                        responseText.match(/```\n?([\s\S]*?)\n?```/) ||
                        [null, responseText];
      
      const jsonString = jsonMatch[1] || responseText;
      
      // Parse and validate the workflow
      const workflow = JSON.parse(jsonString.trim());
      
      console.log('📋 Generated workflow from transcription:', JSON.stringify(workflow, null, 2));
      
      // Validate the generated workflow
      const validation = this.validateWorkflow(workflow);
      
      if (validation.valid) {
        // Add ID and ensure enabled
        workflow.id = `workflow_${Date.now()}`;
        workflow.enabled = true;
        
        return {
          valid: true,
          workflow,
          errors: []
        };
      } else {
        return {
          valid: false,
          workflow: null,
          errors: validation.errors
        };
      }
      
    } catch (error) {
      console.error('❌ Failed to generate workflow from transcription:', error);
      return {
        valid: false,
        workflow: null,
        errors: [error.message]
      };
    }
  }
  
  /**
   * Build the prompt for Gemini to generate a workflow
   */
  buildGenerationPrompt(userRequest) {
    return `You are a workflow generator for Red Glass, an AI automation desktop app.

AVAILABLE ACTIONS:
${JSON.stringify(this.availableActions, null, 2)}

AVAILABLE TRIGGERS:
${JSON.stringify(this.availableTriggers, null, 2)}

VARIABLE SYSTEM (use these to pass data between actions):
- {{input}} = The user's message that triggered the workflow (for keyword triggers)
- {{aiResponse}} = The text response from the previous AI action
- {{result}} = The output from the previous action (any type)
- {{clipboard}} = Content read from clipboard (if clipboard read action was used)

IMPORTANT RULES:
1. Choose the most appropriate trigger:
   - Use "keyword" trigger if user mentions specific phrases like "when I say X" or "when I type X"
   - Use "schedule" trigger if user mentions time-based execution like "every day", "every morning", "at 9am"
   - Use "manual" trigger if user wants to run it on-demand or doesn't specify

2. For keyword triggers, extract the actual keywords the user wants to use

3. For schedule triggers:
   - Parse the time in 24-hour format (e.g., "09:00" for 9 AM)
   - frequency can be: "daily", "weekly", "monthly"
   - For weekly, include daysOfWeek as array [1-7] where 1=Monday, 7=Sunday

4. Chain actions logically:
   - AI prompts should come first to process input
   - Notifications can confirm completion
   - Clipboard copy can save results

5. Use variables properly:
   - First action can use {{input}} for the trigger message
   - Subsequent actions can use {{aiResponse}} or {{result}}

USER REQUEST:
"${userRequest}"

Generate a valid workflow JSON. Output ONLY the JSON, no explanations.

JSON FORMAT:
{
  "name": "Short descriptive name",
  "description": "What this workflow does",
  "enabled": true,
  "trigger": {
    "type": "keyword|schedule|manual",
    // For keyword: "keywords": ["word1", "word2"]
    // For schedule: "schedule": { "time": "09:00", "frequency": "daily" }
  },
  "actions": [
    {
      "type": "ai_prompt",
      "prompt": "The prompt with {{input}} variable"
    },
    {
      "type": "notification",
      "title": "Title",
      "message": "{{aiResponse}}"
    },
    {
      "type": "clipboard",
      "operation": "copy",
      "content": "{{aiResponse}}"
    }
  ]
}`;
  }
  
  /**
   * Validate a generated workflow
   * @param {object} workflow - The workflow to validate
   * @returns {{valid: boolean, errors: string[]}}
   */
  validateWorkflow(workflow) {
    const errors = [];
    
    // Check required fields
    if (!workflow.name || typeof workflow.name !== 'string') {
      errors.push('Workflow must have a name');
    }
    
    if (!workflow.trigger || !workflow.trigger.type) {
      errors.push('Workflow must have a trigger with a type');
    }
    
    if (!workflow.actions || !Array.isArray(workflow.actions) || workflow.actions.length === 0) {
      errors.push('Workflow must have at least one action');
    }
    
    // Validate trigger
    if (workflow.trigger) {
      const validTriggerTypes = this.availableTriggers.map(t => t.type);
      if (!validTriggerTypes.includes(workflow.trigger.type)) {
        errors.push(`Invalid trigger type: ${workflow.trigger.type}`);
      }
      
      // Validate keyword trigger
      if (workflow.trigger.type === 'keyword') {
        if (!workflow.trigger.keywords || !Array.isArray(workflow.trigger.keywords) || workflow.trigger.keywords.length === 0) {
          errors.push('Keyword trigger must have at least one keyword');
        }
      }
      
      // Validate schedule trigger
      if (workflow.trigger.type === 'schedule') {
        // Handle both flat format (time, frequency at trigger level) and nested format (schedule object)
        const hasNestedSchedule = workflow.trigger.schedule && (workflow.trigger.schedule.time || workflow.trigger.schedule.frequency);
        const hasFlatSchedule = workflow.trigger.time || workflow.trigger.frequency;
        
        if (!hasNestedSchedule && !hasFlatSchedule) {
          errors.push('Schedule trigger must have schedule configuration (time and frequency)');
        } else {
          // Normalize to nested format if flat
          if (hasFlatSchedule && !hasNestedSchedule) {
            workflow.trigger.schedule = {
              time: workflow.trigger.time,
              frequency: workflow.trigger.frequency,
              daysOfWeek: workflow.trigger.daysOfWeek,
              dayOfMonth: workflow.trigger.dayOfMonth
            };
            // Clean up flat properties
            delete workflow.trigger.time;
            delete workflow.trigger.frequency;
            delete workflow.trigger.daysOfWeek;
            delete workflow.trigger.dayOfMonth;
          }
          
          // Now validate the nested format
          if (!workflow.trigger.schedule.time) {
            errors.push('Schedule trigger must have a time');
          }
          if (!workflow.trigger.schedule.frequency) {
            errors.push('Schedule trigger must have a frequency');
          }
        }
      }
    }
    
    // Validate actions
    if (workflow.actions) {
      const validActionTypes = this.availableActions.map(a => a.type);
      
      workflow.actions.forEach((action, index) => {
        if (!action.type) {
          errors.push(`Action ${index + 1} must have a type`);
        } else if (!validActionTypes.includes(action.type)) {
          errors.push(`Invalid action type at index ${index}: ${action.type}`);
        }
        
        // Validate specific action types
        if (action.type === 'ai_prompt' && !action.prompt) {
          errors.push(`AI prompt action at index ${index} must have a prompt`);
        }
        
        if (action.type === 'clipboard' && !action.operation) {
          errors.push(`Clipboard action at index ${index} must have an operation`);
        }
      });
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
  
  /**
   * Get a human-readable summary of a workflow
   * @param {object} workflow - The workflow to summarize
   * @returns {string}
   */
  getWorkflowSummary(workflow) {
    let summary = `**${workflow.name}**\n`;
    summary += `${workflow.description || 'No description'}\n\n`;
    
    // Trigger summary
    if (workflow.trigger.type === 'keyword') {
      summary += `**Trigger:** Say "${workflow.trigger.keywords.join('" or "')}"`;
    } else if (workflow.trigger.type === 'schedule') {
      const sched = workflow.trigger.schedule;
      summary += `**Trigger:** ${sched.frequency} at ${sched.time}`;
    } else {
      summary += `**Trigger:** Manual (click to run)`;
    }
    
    summary += '\n\n**Actions:**\n';
    
    workflow.actions.forEach((action, index) => {
      if (action.type === 'ai_prompt') {
        const promptPreview = action.prompt.length > 50 
          ? action.prompt.substring(0, 50) + '...' 
          : action.prompt;
        summary += `${index + 1}. AI: ${promptPreview}\n`;
      } else if (action.type === 'notification') {
        summary += `${index + 1}. Notify: "${action.title}"\n`;
      } else if (action.type === 'clipboard') {
        summary += `${index + 1}. Clipboard: ${action.operation}\n`;
      } else if (action.type === 'http_request') {
        summary += `${index + 1}. HTTP: ${action.method} ${action.url}\n`;
      }
    });
    
    return summary;
  }
  
  /**
   * Get usage hint for a workflow
   * @param {object} workflow - The workflow
   * @returns {string}
   */
  getUsageHint(workflow) {
    if (workflow.trigger.type === 'keyword') {
      return `Say "${workflow.trigger.keywords[0]}" followed by your text to use this workflow`;
    } else if (workflow.trigger.type === 'schedule') {
      const sched = workflow.trigger.schedule;
      return `This workflow will run automatically ${sched.frequency} at ${sched.time}`;
    } else {
      return `Go to Workflows and click Start to run this workflow`;
    }
  }
}

module.exports = WorkflowGenerator;

