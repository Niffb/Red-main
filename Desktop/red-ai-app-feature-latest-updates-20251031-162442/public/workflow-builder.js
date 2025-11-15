// Workflow Builder JavaScript - Redesigned
// Based on Reference Image with Full Functionality

(function() {
    'use strict';
    
    console.log('🔧 Loading Workflow Builder...');
    
    // State
    let workflows = [];
    let executions = [];
    let currentWorkflow = null;
    let mcpTools = {};
    let currentActionIndex = null;
    let tempAction = null;
    
    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
    
    async function init() {
        console.log('✅ Workflow Builder initializing...');
        
        // Load workflows
        await loadWorkflows();
        
        // Load executions
        await loadExecutions();
        
        // Load MCP tools
        await loadMcpTools();
        
        // Setup event listeners
        setupEventListeners();
        
        console.log('✅ Workflow Builder ready');
    }
    
    function setupEventListeners() {
        // New workflow button
        const newBtn = document.getElementById('workflow-new-btn');
        if (newBtn) {
            newBtn.addEventListener('click', createNewWorkflow);
        }
        
        // Save workflow button
        const saveBtn = document.getElementById('workflow-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveCurrentWorkflow);
        }
        
        // Delete workflow button
        const deleteBtn = document.getElementById('workflow-delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', deleteCurrentWorkflow);
        }
        
        // Add action button
        const addActionBtn = document.getElementById('workflow-add-action-btn');
        if (addActionBtn) {
            addActionBtn.addEventListener('click', () => openActionTypeModal());
        }
        
        // Trigger type change
        const triggerSelect = document.getElementById('trigger-type');
        if (triggerSelect) {
            triggerSelect.addEventListener('change', onTriggerTypeChange);
        }
        
        // Run test button
        const runTestBtn = document.getElementById('run-test-btn');
        if (runTestBtn) {
            runTestBtn.addEventListener('click', runTest);
        }
        
        // MCP tool search
        const mcpSearchInput = document.getElementById('mcp-tool-search');
        if (mcpSearchInput) {
            mcpSearchInput.addEventListener('input', filterMcpTools);
        }
        
        // Action config save button
        const actionConfigSaveBtn = document.getElementById('action-config-save-btn');
        if (actionConfigSaveBtn) {
            actionConfigSaveBtn.addEventListener('click', saveActionConfig);
        }
        
        // Tab switching
        document.querySelectorAll('.workflow-tab').forEach(tab => {
            tab.addEventListener('click', () => switchTab(tab.dataset.tab));
        });
    }
    
    // Tab switching
    function switchTab(tabName) {
        // Update tab active state
        document.querySelectorAll('.workflow-tab').forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        // Show/hide content
        document.getElementById('all-workflows-content').style.display = 
            tabName === 'all' ? 'block' : 'none';
        document.getElementById('executions-content').style.display = 
            tabName === 'executions' ? 'block' : 'none';
        
        // Load data for the active tab
        if (tabName === 'executions') {
            loadExecutions();
        }
    }
    
    // Load workflows from backend
    async function loadWorkflows() {
        try {
            const result = await window.electronAPI.workflowList();
            if (result.success) {
                workflows = result.workflows;
                renderWorkflowGrid();
            }
        } catch (error) {
            console.error('Failed to load workflows:', error);
        }
    }
    
    // Load executions from backend
    async function loadExecutions() {
        try {
            const result = await window.electronAPI.workflowHistory(50);
            if (result.success) {
                executions = result.history;
                renderExecutionsList();
            }
        } catch (error) {
            console.error('Failed to load executions:', error);
        }
    }
    
    // Load MCP tools
    async function loadMcpTools() {
        try {
            const result = await window.electronAPI.mcpGetTools();
            if (result.success) {
                mcpTools = result.tools;
                console.log(`📋 Loaded ${Object.keys(mcpTools).length} MCP tools`);
            }
        } catch (error) {
            console.error('Failed to load MCP tools:', error);
        }
    }
    
    // Render workflow grid
    function renderWorkflowGrid() {
        const gridEl = document.getElementById('workflow-grid');
        if (!gridEl) return;
        
        if (workflows.length === 0) {
            gridEl.innerHTML = `
                <div class="workflow-empty">
                    <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                        <path d="M2 12h2a2 2 0 0 1 2 2v4a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2v-4a2 2 0 0 1 2-2h2"></path>
                    </svg>
                    <h3>No workflows yet</h3>
                    <p>Create your first workflow to automate tasks</p>
                </div>
            `;
            return;
        }
        
        gridEl.innerHTML = workflows.map(workflow => `
            <div class="workflow-card">
                <div class="workflow-card-header">
                    <div class="workflow-card-actions">
                        <label class="workflow-card-toggle" onclick="event.stopPropagation();">
                            <input type="checkbox" ${workflow.enabled ? 'checked' : ''} 
                                   onchange="toggleWorkflow('${workflow.id}', this.checked)">
                            <span class="workflow-card-toggle-slider"></span>
                        </label>
                    </div>
                </div>
                <h3 class="workflow-card-title">${workflow.name}</h3>
                <div class="workflow-card-meta">
                    <span class="workflow-card-badge">Template</span>
                    <span class="workflow-card-trigger">trigger: ${getTriggerLabel(workflow.trigger)}</span>
                </div>
                <p class="workflow-card-description">${workflow.description || 'No description provided'}</p>
                <div class="workflow-card-footer">
                    <div class="workflow-card-stats">
                        <span>action: ${workflow.actions.length}</span>
                        <span>last execution: Never run</span>
                    </div>
                    <div class="workflow-card-buttons">
                        <button class="workflow-card-btn primary" onclick="runWorkflow('${workflow.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polygon points="5 3 19 12 5 21 5 3"></polygon>
                            </svg>
                            Start
                        </button>
                        <button class="workflow-card-btn" onclick="editWorkflow('${workflow.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                            Edit
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
    }
    
    // Render executions list
    function renderExecutionsList() {
        const listEl = document.getElementById('executions-list');
        if (!listEl) return;
        
        if (executions.length === 0) {
            listEl.innerHTML = `
                <div class="workflow-empty">
                    <h3>No executions yet</h3>
                    <p>Workflow execution history will appear here</p>
                </div>
            `;
            return;
        }
        
        listEl.innerHTML = executions.map(exec => `
            <div class="execution-card">
                <div class="execution-card-header">
                    <div class="execution-card-title">${exec.workflowName || exec.workflowId}</div>
                    <div class="execution-card-status ${exec.success ? 'success' : 'failed'}">
                        ${exec.success ? '✓ Success' : '✗ Failed'}
                    </div>
                </div>
                <div class="execution-card-meta">
                    ${new Date(exec.startTime).toLocaleString()} • Duration: ${exec.duration}ms
                </div>
            </div>
        `).join('');
    }
    
    function getTriggerLabel(trigger) {
        if (!trigger) return 'manual';
        
        const labels = {
            'manual': 'manual',
            'keyword': 'keyword',
            'intent': 'intent',
            'schedule': 'schedule'
        };
        return labels[trigger.type] || trigger.type;
    }
    
    // Toggle workflow enabled/disabled
    window.toggleWorkflow = async function(id, enabled) {
        try {
            const result = await window.electronAPI.workflowUpdate(id, { enabled });
            if (result.success) {
                await loadWorkflows();
            }
        } catch (error) {
            console.error('Failed to toggle workflow:', error);
        }
    };
    
    // Run workflow
    window.runWorkflow = async function(id) {
        try {
            const result = await window.electronAPI.workflowExecute(id, {});
            if (result.success) {
                alert('Workflow executed successfully!');
                await loadExecutions();
            } else {
                alert('Workflow execution failed: ' + result.error);
            }
        } catch (error) {
            console.error('Failed to run workflow:', error);
            alert('Failed to run workflow');
        }
    };
    
    // Edit workflow
    window.editWorkflow = async function(id) {
        try {
            const result = await window.electronAPI.workflowGet(id);
            if (result.success) {
                currentWorkflow = result.workflow;
                openWorkflowEditor();
            }
        } catch (error) {
            console.error('Failed to load workflow:', error);
        }
    };
    
    // Create new workflow
    function createNewWorkflow() {
        currentWorkflow = {
            id: null,
            name: 'Untitled Workflow',
            description: '',
            enabled: true,
            trigger: {
                type: 'manual'
            },
            actions: []
        };
        
        openWorkflowEditor();
    }
    
    // Open workflow editor modal
    function openWorkflowEditor() {
        const modal = document.getElementById('workflow-editor-modal');
        if (!modal) return;
        
        // Update title
        document.getElementById('workflow-modal-title').textContent = 
            currentWorkflow.id ? 'Edit Workflow' : 'Create Workflow';
        
        // Populate fields
        document.getElementById('workflow-name').value = currentWorkflow.name || '';
        document.getElementById('workflow-description').value = currentWorkflow.description || '';
        document.getElementById('trigger-type').value = currentWorkflow.trigger?.type || 'manual';
        
        // Render trigger config
        renderTriggerConfig();
        
        // Render actions
        renderActions();
        
        modal.style.display = 'flex';
    }
    
    // Close workflow editor
    window.closeWorkflowEditor = function() {
        const modal = document.getElementById('workflow-editor-modal');
        if (modal) {
            modal.style.display = 'none';
            currentWorkflow = null;
        }
    };
    
    // Render trigger configuration
    function renderTriggerConfig() {
        const container = document.getElementById('trigger-config-container');
        if (!container) return;
        
        const triggerType = document.getElementById('trigger-type').value;
        
        if (triggerType === 'keyword') {
            const keywords = currentWorkflow.trigger?.keywords || [];
            container.innerHTML = `
                <div class="workflow-field" style="margin-top: 16px;">
                    <label>Keywords (comma-separated)</label>
                    <input type="text" id="trigger-keywords" class="workflow-input" 
                           value="${keywords.join(', ')}" 
                           placeholder="e.g., summarize, tldr, analyze">
                </div>
            `;
        } else if (triggerType === 'intent') {
            const intents = currentWorkflow.trigger?.intents || [];
            container.innerHTML = `
                <div class="workflow-field" style="margin-top: 16px;">
                    <label>Intents (comma-separated)</label>
                    <input type="text" id="trigger-intents" class="workflow-input" 
                           value="${intents.join(', ')}" 
                           placeholder="e.g., file_read, data_analysis">
                </div>
            `;
        } else if (triggerType === 'schedule') {
            const schedule = currentWorkflow.trigger?.schedule || '';
            container.innerHTML = `
                <div class="workflow-field" style="margin-top: 16px;">
                    <label>Schedule (cron expression)</label>
                    <input type="text" id="trigger-schedule" class="workflow-input" 
                           value="${schedule}" 
                           placeholder="e.g., 0 0 * * * (daily at midnight)">
                </div>
            `;
        } else {
            container.innerHTML = '';
        }
    }
    
    // Handle trigger type change
    function onTriggerTypeChange() {
        renderTriggerConfig();
    }
    
    // Render actions
    function renderActions() {
        const actionsEl = document.getElementById('workflow-actions-list');
        if (!actionsEl) return;
        
        if (!currentWorkflow.actions || currentWorkflow.actions.length === 0) {
            actionsEl.innerHTML = '';
            return;
        }
        
        actionsEl.innerHTML = currentWorkflow.actions.map((action, index) => `
            <div class="workflow-action-card">
                <div class="workflow-action-header">
                    <div class="workflow-action-type">
                        <span class="workflow-action-number">${index + 1}</span>
                        <span>${getActionTypeName(action.type)}</span>
                    </div>
                    <div class="workflow-action-controls">
                        <button class="workflow-action-btn" onclick="editAction(${index})" title="Edit">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                            </svg>
                        </button>
                        <button class="workflow-action-btn danger" onclick="deleteAction(${index})" title="Delete">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"></polyline>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div style="font-size: 13px; color: rgba(255, 255, 255, 0.6); margin-left: 40px;">
                    ${renderActionSummary(action)}
                </div>
            </div>
        `).join('');
    }
    
    function getActionTypeName(type) {
        const names = {
            'mcp_tool': '🔧 MCP Tool',
            'ai_prompt': '🤖 AI Prompt',
            'notification': '🔔 Notification',
            'clipboard': '📋 Clipboard',
            'http_request': '🌐 HTTP Request'
        };
        return names[type] || type;
    }
    
    function renderActionSummary(action) {
        if (action.type === 'mcp_tool') {
            return `Call <strong>${action.server}/${action.tool}</strong>`;
        } else if (action.type === 'ai_prompt') {
            const prompt = action.prompt || '';
            return `Prompt: ${prompt.substring(0, 60)}${prompt.length > 60 ? '...' : ''}`;
        } else if (action.type === 'notification') {
            return `Show: ${action.title || 'Notification'}`;
        } else if (action.type === 'clipboard') {
            return `Copy to clipboard`;
        } else if (action.type === 'http_request') {
            return `${action.method || 'GET'} ${action.url || ''}`;
        }
        return '';
    }
    
    // Open action type modal
    window.openActionTypeModal = function() {
        const modal = document.getElementById('action-type-modal');
        if (modal) {
            modal.style.display = 'flex';
            currentActionIndex = null;
            tempAction = null;
        }
    };
    
    // Close action type modal
    window.closeActionTypeModal = function() {
        const modal = document.getElementById('action-type-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };
    
    // Select action type
    window.selectActionType = function(type) {
        closeActionTypeModal();
        
        if (type === 'mcp_tool') {
            openMcpToolPicker();
        } else {
            tempAction = { type };
            openActionConfigModal(type);
        }
    };
    
    // Open MCP tool picker
    window.openMcpToolPicker = async function() {
        const modal = document.getElementById('mcp-tool-picker-modal');
        if (!modal) return;
        
        // Reload tools to get latest
        await loadMcpTools();
        
        // Render MCP tools
        renderMcpTools();
        
        modal.style.display = 'flex';
    }
    
    // Close MCP tool picker
    window.closeMcpToolPicker = function() {
        const modal = document.getElementById('mcp-tool-picker-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };
    
    // Render MCP tools
    function renderMcpTools(filter = '') {
        const listEl = document.getElementById('mcp-tool-list');
        if (!listEl) return;
        
        const toolsArray = Object.entries(mcpTools).map(([key, tool]) => ({
            key,
            ...tool
        }));
        
        const filtered = filter ? toolsArray.filter(tool => 
            tool.name.toLowerCase().includes(filter.toLowerCase()) ||
            tool.description.toLowerCase().includes(filter.toLowerCase()) ||
            tool.server.toLowerCase().includes(filter.toLowerCase())
        ) : toolsArray;
        
        if (filtered.length === 0) {
            listEl.innerHTML = '<div style="padding: 20px; text-align: center; color: rgba(255, 255, 255, 0.4);">No tools found</div>';
            return;
        }
        
        listEl.innerHTML = filtered.map(tool => `
            <div class="mcp-tool-item" onclick="selectMcpTool('${tool.server}', '${tool.name}')">
                <div class="mcp-tool-name">${tool.name}</div>
                <div class="mcp-tool-server">Server: ${tool.server}</div>
                <div class="mcp-tool-description">${tool.description || 'No description'}</div>
            </div>
        `).join('');
    }
    
    // Select MCP tool
    window.selectMcpTool = function(server, tool) {
        closeMcpToolPicker();
        
        tempAction = {
            type: 'mcp_tool',
            server,
            tool,
            parameters: {}
        };
        
        openActionConfigModal('mcp_tool', server, tool);
    };
    
    // Filter MCP tools
    function filterMcpTools(event) {
        const filter = event.target.value;
        renderMcpTools(filter);
    }
    
    // Open action configuration modal
    function openActionConfigModal(type, server, tool) {
        const modal = document.getElementById('action-config-modal');
        if (!modal) return;
        
        const body = document.getElementById('action-config-body');
        const title = document.getElementById('action-config-title');
        
        if (type === 'mcp_tool') {
            title.textContent = `Configure MCP Tool: ${tool}`;
            const toolKey = `${server}_${tool}`;
            const toolInfo = mcpTools[toolKey];
            
            if (toolInfo && toolInfo.inputSchema && toolInfo.inputSchema.properties) {
                const props = toolInfo.inputSchema.properties;
                const required = toolInfo.inputSchema.required || [];
                
                body.innerHTML = Object.entries(props).map(([name, schema]) => `
                    <div class="workflow-field">
                        <label>${name}${required.includes(name) ? ' *' : ''}</label>
                        <input type="text" class="workflow-input action-param" 
                               data-param="${name}" 
                               placeholder="${schema.description || ''}"
                               value="${tempAction.parameters[name] || ''}">
                    </div>
                `).join('');
            } else {
                body.innerHTML = '<p style="color: var(--text-secondary);">No parameters required</p>';
            }
        } else if (type === 'ai_prompt') {
            title.textContent = 'Configure AI Prompt';
            body.innerHTML = `
                <div class="workflow-field">
                    <label>Prompt</label>
                    <textarea class="workflow-textarea" id="action-ai-prompt" rows="6" 
                              placeholder="Enter your prompt for Gemini...">${tempAction.prompt || ''}</textarea>
                </div>
            `;
        } else if (type === 'notification') {
            title.textContent = 'Configure Notification';
            body.innerHTML = `
                <div class="workflow-field">
                    <label>Title</label>
                    <input type="text" class="workflow-input" id="action-notif-title" 
                           placeholder="Notification title" value="${tempAction.title || ''}">
                </div>
                <div class="workflow-field">
                    <label>Message</label>
                    <textarea class="workflow-textarea" id="action-notif-message" rows="4" 
                              placeholder="Notification message">${tempAction.message || ''}</textarea>
                </div>
            `;
        } else if (type === 'clipboard') {
            title.textContent = 'Configure Clipboard';
            body.innerHTML = `
                <div class="workflow-field">
                    <label>Text to Copy</label>
                    <textarea class="workflow-textarea" id="action-clipboard-text" rows="4" 
                              placeholder="Text to copy to clipboard">${tempAction.text || ''}</textarea>
                </div>
            `;
        } else if (type === 'http_request') {
            title.textContent = 'Configure HTTP Request';
            body.innerHTML = `
                <div class="workflow-field">
                    <label>Method</label>
                    <select class="workflow-select" id="action-http-method">
                        <option value="GET" ${tempAction.method === 'GET' ? 'selected' : ''}>GET</option>
                        <option value="POST" ${tempAction.method === 'POST' ? 'selected' : ''}>POST</option>
                        <option value="PUT" ${tempAction.method === 'PUT' ? 'selected' : ''}>PUT</option>
                        <option value="DELETE" ${tempAction.method === 'DELETE' ? 'selected' : ''}>DELETE</option>
                    </select>
                </div>
                <div class="workflow-field">
                    <label>URL</label>
                    <input type="text" class="workflow-input" id="action-http-url" 
                           placeholder="https://api.example.com/endpoint" value="${tempAction.url || ''}">
                </div>
                <div class="workflow-field">
                    <label>Body (JSON, optional)</label>
                    <textarea class="workflow-textarea" id="action-http-body" rows="4" 
                              placeholder='{"key": "value"}'>${tempAction.body ? JSON.stringify(tempAction.body, null, 2) : ''}</textarea>
                </div>
            `;
        }
        
        modal.style.display = 'flex';
    }
    
    // Close action config modal
    window.closeActionConfigModal = function() {
        const modal = document.getElementById('action-config-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };
    
    // Save action configuration
    function saveActionConfig() {
        if (!tempAction) return;
        
        const type = tempAction.type;
        
        if (type === 'mcp_tool') {
            // Collect parameters
            document.querySelectorAll('.action-param').forEach(input => {
                const paramName = input.dataset.param;
                tempAction.parameters[paramName] = input.value;
            });
        } else if (type === 'ai_prompt') {
            tempAction.prompt = document.getElementById('action-ai-prompt').value;
        } else if (type === 'notification') {
            tempAction.title = document.getElementById('action-notif-title').value;
            tempAction.message = document.getElementById('action-notif-message').value;
        } else if (type === 'clipboard') {
            tempAction.text = document.getElementById('action-clipboard-text').value;
        } else if (type === 'http_request') {
            tempAction.method = document.getElementById('action-http-method').value;
            tempAction.url = document.getElementById('action-http-url').value;
            const bodyText = document.getElementById('action-http-body').value;
            if (bodyText) {
                try {
                    tempAction.body = JSON.parse(bodyText);
                } catch (e) {
                    alert('Invalid JSON in body');
                    return;
                }
            }
        }
        
        // Add or update action
        if (currentActionIndex !== null) {
            currentWorkflow.actions[currentActionIndex] = tempAction;
        } else {
            currentWorkflow.actions.push(tempAction);
        }
        
        renderActions();
        closeActionConfigModal();
        tempAction = null;
        currentActionIndex = null;
    }
    
    // Edit action
    window.editAction = function(index) {
        currentActionIndex = index;
        tempAction = JSON.parse(JSON.stringify(currentWorkflow.actions[index]));
        
        const type = tempAction.type;
        if (type === 'mcp_tool') {
            openActionConfigModal(type, tempAction.server, tempAction.tool);
        } else {
            openActionConfigModal(type);
        }
    };
    
    // Delete action
    window.deleteAction = function(index) {
        if (!currentWorkflow) return;
        
        if (confirm('Delete this action?')) {
            currentWorkflow.actions.splice(index, 1);
            renderActions();
        }
    };
    
    // Save current workflow
    async function saveCurrentWorkflow() {
        if (!currentWorkflow) return;
        
        // Collect form data
        currentWorkflow.name = document.getElementById('workflow-name').value;
        currentWorkflow.description = document.getElementById('workflow-description').value;
        
        // Collect trigger data
        const triggerType = document.getElementById('trigger-type').value;
        currentWorkflow.trigger = { type: triggerType };
        
        if (triggerType === 'keyword') {
            const keywordsInput = document.getElementById('trigger-keywords');
            if (keywordsInput) {
                currentWorkflow.trigger.keywords = keywordsInput.value
                    .split(',')
                    .map(k => k.trim())
                    .filter(k => k);
            }
        } else if (triggerType === 'intent') {
            const intentsInput = document.getElementById('trigger-intents');
            if (intentsInput) {
                currentWorkflow.trigger.intents = intentsInput.value
                    .split(',')
                    .map(i => i.trim())
                    .filter(i => i);
            }
        } else if (triggerType === 'schedule') {
            const scheduleInput = document.getElementById('trigger-schedule');
            if (scheduleInput) {
                currentWorkflow.trigger.schedule = scheduleInput.value.trim();
            }
        }
        
        try {
            let result;
            if (currentWorkflow.id) {
                // Update existing
                result = await window.electronAPI.workflowUpdate(currentWorkflow.id, currentWorkflow);
            } else {
                // Create new
                result = await window.electronAPI.workflowCreate(currentWorkflow);
            }
            
            if (result.success) {
                currentWorkflow = result.workflow;
                await loadWorkflows();
                closeWorkflowEditor();
                alert('Workflow saved successfully!');
            } else {
                alert('Failed to save workflow: ' + result.error);
            }
        } catch (error) {
            console.error('Failed to save workflow:', error);
            alert('Failed to save workflow');
        }
    }
    
    // Delete current workflow
    async function deleteCurrentWorkflow() {
        if (!currentWorkflow || !currentWorkflow.id) return;
        
        if (!confirm(`Delete workflow "${currentWorkflow.name}"?`)) return;
        
        try {
            const result = await window.electronAPI.workflowDelete(currentWorkflow.id);
            if (result.success) {
                await loadWorkflows();
                closeWorkflowEditor();
                alert('Workflow deleted');
            } else {
                alert('Failed to delete workflow: ' + result.error);
            }
        } catch (error) {
            console.error('Failed to delete workflow:', error);
            alert('Failed to delete workflow');
        }
    }
    
    // Open test modal
    window.openTestModal = function() {
        const modal = document.getElementById('test-workflow-modal');
        if (modal) {
            document.getElementById('test-context').value = '{\n  "message": "test"\n}';
            document.getElementById('test-results').style.display = 'none';
            modal.style.display = 'flex';
        }
    };
    
    // Close test modal
    window.closeTestModal = function() {
        const modal = document.getElementById('test-workflow-modal');
        if (modal) {
            modal.style.display = 'none';
        }
    };
    
    // Run test
    async function runTest() {
        if (!currentWorkflow) return;
        
        // Make sure workflow is saved first
        if (!currentWorkflow.id) {
            alert('Please save the workflow first');
            return;
        }
        
        const contextInput = document.getElementById('test-context').value;
        let context;
        
        try {
            context = JSON.parse(contextInput);
        } catch (error) {
            alert('Invalid JSON in context');
            return;
        }
        
        const resultsEl = document.getElementById('test-results');
        resultsEl.innerHTML = '<div style="color: rgba(255, 255, 255, 0.6);">Running test...</div>';
        resultsEl.style.display = 'block';
        
        try {
            const result = await window.electronAPI.workflowExecute(currentWorkflow.id, context);
            
            if (result.success && result.execution) {
                const exec = result.execution;
                resultsEl.innerHTML = `
                    <div class="test-success">✅ Test Completed Successfully</div>
                    <div style="margin-top: 12px;">
                        <div>Duration: ${exec.duration}ms</div>
                        <div>Actions: ${exec.results.length}</div>
                    </div>
                    <pre style="margin-top: 12px; white-space: pre-wrap;">${JSON.stringify(exec.results, null, 2)}</pre>
                `;
            } else {
                resultsEl.innerHTML = `
                    <div class="test-error">❌ Test Failed</div>
                    <pre style="margin-top: 12px; white-space: pre-wrap;">${result.error || JSON.stringify(result.execution?.errors, null, 2)}</pre>
                `;
            }
        } catch (error) {
            resultsEl.innerHTML = `
                <div class="test-error">❌ Test Failed</div>
                <pre style="margin-top: 12px;">${error.message}</pre>
            `;
        }
    }
    
    console.log('✅ Workflow Builder loaded');
})();
