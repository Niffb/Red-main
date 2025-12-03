// Workflow Builder JavaScript - Redesigned
// Based on Reference Image with Full Functionality

// IMPORTANT: Functions MUST be in global scope for inline onclick handlers to work
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
        
        // Verify global functions are registered
        console.log('✅ Workflow Builder ready');
        console.log('📋 Global functions registered:', {
            runWorkflow: typeof window.runWorkflow,
            editWorkflow: typeof window.editWorkflow,
            deleteWorkflowCard: typeof window.deleteWorkflowCard,
            toggleWorkflow: typeof window.toggleWorkflow
        });
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
        const allContent = document.getElementById('all-workflows-content');
        const execContent = document.getElementById('executions-content');
        if (tabName === 'all') {
            allContent.classList.remove('hidden');
            execContent.classList.add('hidden');
        } else {
            allContent.classList.add('hidden');
            execContent.classList.remove('hidden');
        }
        
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
        if (!gridEl) {
            console.error('❌ workflow-grid element not found!');
            return;
        }
        
        console.log(`📋 Rendering ${workflows.length} workflows...`);
        
        if (workflows.length === 0) {
            gridEl.innerHTML = `
                <div class="workflow-empty">
                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                    <h3>No workflows yet</h3>
                    <p>Create your first workflow to automate tasks</p>
                </div>
            `;
            return;
        }
        
        gridEl.innerHTML = workflows.map(workflow => `
            <div class="workflow-card" data-workflow-id="${workflow.id}">
                <div class="workflow-card-main">
                    <div class="workflow-card-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                        </svg>
                    </div>
                    <div class="workflow-card-info">
                        <h3 class="workflow-card-title">${workflow.name}</h3>
                        <div class="workflow-card-meta">
                            <span>${workflow.actions.length} action${workflow.actions.length !== 1 ? 's' : ''}</span>
                            <span class="dot">·</span>
                            <span>${getTriggerLabel(workflow.trigger)}</span>
                        </div>
                    </div>
                    <label class="workflow-card-toggle" onclick="event.stopPropagation();">
                        <input type="checkbox" ${workflow.enabled ? 'checked' : ''} 
                               onchange="toggleWorkflow('${workflow.id}', this.checked)">
                        <span class="workflow-card-toggle-slider"></span>
                    </label>
                    <div class="workflow-card-actions">
                        <button class="workflow-card-btn btn-run-workflow" data-workflow-id="${workflow.id}" title="Run">
                            <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                <polygon points="5 3 19 12 5 21 5 3"/>
                            </svg>
                        </button>
                        <button class="workflow-card-btn btn-edit-workflow" data-workflow-id="${workflow.id}" title="Edit">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                            </svg>
                        </button>
                        <button class="workflow-card-btn danger btn-delete-workflow" data-workflow-id="${workflow.id}" data-workflow-name="${workflow.name.replace(/"/g, '&quot;')}" title="Delete">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');
        
        // Attach event listeners using event delegation
        attachWorkflowCardListeners();
    }
    
    // Attach event listeners to workflow cards using event delegation (only once)
    let workflowGridListenersAttached = false;
    function attachWorkflowCardListeners() {
        if (workflowGridListenersAttached) {
            console.log('⚠️ Event listeners already attached, skipping...');
            return;
        }
        
        const gridEl = document.getElementById('workflow-grid');
        if (!gridEl) {
            console.error('❌ workflow-grid element not found, cannot attach listeners!');
            return;
        }
        
        // Use event delegation - listen on the grid, handle clicks on buttons
        gridEl.addEventListener('click', async (e) => {
            const target = e.target.closest('button');
            if (!target) return;
            
            const workflowId = target.getAttribute('data-workflow-id');
            if (!workflowId) return;
            
            console.log('🖱️ Button clicked:', target.className, 'Workflow ID:', workflowId);
            
            if (target.classList.contains('btn-run-workflow')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('▶️ START button clicked for workflow:', workflowId);
                
                // Call the actual workflow execution
                try {
                    console.log('📡 Calling workflowExecute API from event listener...');
                    const result = await window.electronAPI.workflowExecute(workflowId, {});
                    console.log('📦 Got result from event listener:', result);
                    
                    if (result.success) {
                        console.log('✅ Workflow executed successfully:', result);
                        
                        // Switch to chat window first
                        switchToChatWindow();
                        
                        // Wait a moment for the window to switch
                        await new Promise(resolve => setTimeout(resolve, 300));
                        
                        // Display result in chat (with loading animation)
                        await displayWorkflowResultInChat(result.execution);
                        
                        // Also update executions tab
                        await loadExecutions();
                    } else {
                        console.error('❌ Workflow execution failed:', result.error);
                        alert('❌ Workflow execution failed:\n' + result.error);
                    }
                } catch (error) {
                    console.error('❌ Failed to run workflow from event listener:', error);
                    console.error('Error stack:', error.stack);
                    alert('❌ Failed to run workflow:\n' + error.message);
                }
            } else if (target.classList.contains('btn-edit-workflow')) {
                e.preventDefault();
                e.stopPropagation();
                console.log('✏️ EDIT button clicked for workflow:', workflowId);
                
                // Load workflow using the existing editWorkflow function
                try {
                    const result = await window.electronAPI.workflowGet(workflowId);
                    if (result.success) {
                        currentWorkflow = result.workflow;
                        openWorkflowEditor();
                    } else {
                        console.error('Failed to load workflow:', result.error);
                        alert('❌ Failed to load workflow: ' + result.error);
                    }
                } catch (error) {
                    console.error('Failed to load workflow:', error);
                    alert('❌ Failed to load workflow: ' + error.message);
                }
            } else if (target.classList.contains('btn-delete-workflow')) {
                e.preventDefault();
                e.stopPropagation();
                const workflowName = target.getAttribute('data-workflow-name');
                console.log('🗑️ DELETE button clicked for workflow:', workflowId, 'Name:', workflowName);
                
                // Delete workflow
                const confirmed = await window.customConfirm({
                    title: 'Delete Workflow',
                    message: `Delete workflow "${workflowName}"? This action cannot be undone.`,
                    confirmText: 'Delete',
                    type: 'danger'
                });
                
                if (!confirmed) {
                    return;
                }
                
                try {
                    const result = await window.electronAPI.workflowDelete(workflowId);
                    if (result.success) {
                        console.log('✅ Workflow deleted successfully');
                        alert('✅ Workflow deleted successfully');
                        await loadWorkflows();
                    } else {
                        console.error('❌ Delete failed:', result.error);
                        alert('❌ Failed to delete workflow:\n' + result.error);
                    }
                } catch (error) {
                    console.error('❌ Delete error:', error);
                    alert('❌ Failed to delete workflow:\n' + error.message);
                }
            }
        });
        
        workflowGridListenersAttached = true;
        console.log('✅ Event listeners attached to workflow grid');
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
        console.log('🚀 runWorkflow function called!');
        console.log('▶️ Running workflow with ID:', id, 'Type:', typeof id);
        
        if (!id) {
            console.error('❌ No workflow ID provided!');
            alert('❌ Error: No workflow ID');
            return;
        }
        
        try {
            console.log('📡 Calling workflowExecute API...');
            // The preload expects (id, context) as separate parameters
            const result = await window.electronAPI.workflowExecute(id, {});
            console.log('📦 Got result:', result);
            
            if (result.success) {
                console.log('✅ Workflow executed successfully:', result);
                alert('✅ Workflow executed successfully!\n\nCheck the Executions tab to see results.');
                await loadExecutions();
                switchTab('executions'); // Show executions tab
            } else {
                console.error('❌ Workflow execution failed:', result.error);
                alert('❌ Workflow execution failed:\n' + result.error);
            }
        } catch (error) {
            console.error('❌ Failed to run workflow:', error);
            console.error('Error stack:', error.stack);
            alert('❌ Failed to run workflow:\n' + error.message);
        }
    };
    
    // Delete workflow from card
    window.deleteWorkflowCard = async function(id, name) {
        const confirmed = await window.customConfirm({
            title: 'Delete Workflow',
            message: `Delete workflow "${name}"? This action cannot be undone.`,
            confirmText: 'Delete',
            type: 'danger'
        });
        
        if (!confirmed) {
            return;
        }
        
        console.log('🗑️ Deleting workflow:', id);
        try {
            // The preload expects just the id as a parameter
            const result = await window.electronAPI.workflowDelete(id);
            if (result.success) {
                console.log('✅ Workflow deleted successfully');
                alert('✅ Workflow deleted successfully');
                await loadWorkflows();
            } else {
                console.error('❌ Failed to delete workflow:', result.error);
                alert('❌ Failed to delete workflow: ' + result.error);
            }
        } catch (error) {
            console.error('❌ Error deleting workflow:', error);
            alert('❌ Error deleting workflow: ' + error.message);
        }
    };
    
    // Edit workflow
    window.editWorkflow = async function(id) {
        try {
            const result = await window.electronAPI.workflowGet(id);
            if (result.success) {
                currentWorkflow = result.workflow;
                openWorkflowEditor();
            } else {
                console.error('Failed to load workflow:', result.error);
                alert('Failed to load workflow: ' + result.error);
            }
        } catch (error) {
            console.error('Failed to load workflow:', error);
            alert('Failed to load workflow: ' + error.message);
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
            const schedule = currentWorkflow.trigger?.schedule || {};
            const frequency = schedule.frequency || 'daily';
            const time = schedule.time || '09:00';
            const daysOfWeek = schedule.daysOfWeek || [];
            const dayOfMonth = schedule.dayOfMonth || '1';
            
            container.innerHTML = `
                <div class="workflow-field" style="margin-top: 16px;">
                    <label>Frequency</label>
                    <select id="schedule-frequency" class="workflow-select" onchange="updateScheduleOptions()">
                        <option value="daily" ${frequency === 'daily' ? 'selected' : ''}>Daily</option>
                        <option value="weekly" ${frequency === 'weekly' ? 'selected' : ''}>Weekly</option>
                        <option value="monthly" ${frequency === 'monthly' ? 'selected' : ''}>Monthly</option>
                    </select>
                </div>
                
                <div class="workflow-field" style="margin-top: 12px;">
                    <label>Time</label>
                    <input type="time" id="schedule-time" class="workflow-input" value="${time}">
                </div>
                
                <div id="schedule-extra-options" style="margin-top: 12px;">
                    ${frequency === 'weekly' ? `
                        <div class="workflow-field">
                            <label>Days of Week</label>
                            <div class="days-of-week-selector">
                                ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, idx) => `
                                    <label class="day-checkbox">
                                        <input type="checkbox" value="${idx + 1}" 
                                               ${daysOfWeek.includes(idx + 1) ? 'checked' : ''}
                                               class="schedule-day-checkbox">
                                        <span>${day}</span>
                                    </label>
                                `).join('')}
                            </div>
                        </div>
                    ` : ''}
                    
                    ${frequency === 'monthly' ? `
                        <div class="workflow-field">
                            <label>Day of Month</label>
                            <select id="schedule-day-of-month" class="workflow-select">
                                ${Array.from({length: 31}, (_, i) => i + 1).map(day => `
                                    <option value="${day}" ${dayOfMonth == day ? 'selected' : ''}>${day}</option>
                                `).join('')}
                            </select>
                        </div>
                    ` : ''}
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
    
    // Update schedule options when frequency changes
    window.updateScheduleOptions = function() {
        renderTriggerConfig();
    };
    
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
            const op = action.operation || 'copy';
            const opLabels = { copy: 'Copy to clipboard', read: 'Read from clipboard', append: 'Append to clipboard' };
            return opLabels[op] || 'Clipboard action';
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
                <div style="background: rgba(147, 51, 234, 0.1); border: 1px solid rgba(147, 51, 234, 0.3); border-radius: 8px; padding: 12px; margin-top: 12px;">
                    <div style="font-weight: 600; color: #c084fc; margin-bottom: 8px;">📝 Available Variables</div>
                    <div style="font-size: 12px; color: rgba(255,255,255,0.7); line-height: 1.6;">
                        <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">{{input}}</code> - Original trigger message<br>
                        <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">{{result}}</code> - Output from previous action<br>
                        <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">{{aiResponse}}</code> - Last AI response<br>
                        <code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">{{clipboard}}</code> - Clipboard content (if read)
                    </div>
                </div>
            `;
        } else if (type === 'notification') {
            title.textContent = 'Configure Notification';
            const duration = tempAction.duration || 5000;
            const sound = tempAction.sound !== false;
            body.innerHTML = `
                <div class="workflow-field">
                    <label>Title</label>
                    <input type="text" class="workflow-input" id="action-notif-title" 
                           placeholder="Notification title" value="${tempAction.title || ''}">
                    <p style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 6px;">
                        Use {{aiResponse}} to show workflow output
                    </p>
                </div>
                <div class="workflow-field">
                    <label>Message</label>
                    <textarea class="workflow-textarea" id="action-notif-message" rows="4" 
                              placeholder="Notification message (supports {{variables}})">${tempAction.message || ''}</textarea>
                </div>
                <div style="display: flex; gap: 16px;">
                    <div class="workflow-field" style="flex: 1;">
                        <label>Duration</label>
                        <select class="workflow-select" id="action-notif-duration">
                            <option value="3000" ${duration === 3000 ? 'selected' : ''}>3 seconds</option>
                            <option value="5000" ${duration === 5000 ? 'selected' : ''}>5 seconds</option>
                            <option value="8000" ${duration === 8000 ? 'selected' : ''}>8 seconds</option>
                            <option value="10000" ${duration === 10000 ? 'selected' : ''}>10 seconds</option>
                        </select>
                    </div>
                    <div class="workflow-field" style="flex: 1;">
                        <label>Sound</label>
                        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
                            <input type="checkbox" id="action-notif-sound" ${sound ? 'checked' : ''}>
                            <span style="color: rgba(255,255,255,0.7);">Play notification sound</span>
                        </label>
                    </div>
                </div>
            `;
        } else if (type === 'clipboard') {
            title.textContent = 'Configure Clipboard Action';
            const operation = tempAction.operation || 'copy';
            body.innerHTML = `
                <div class="workflow-field">
                    <label>Operation</label>
                    <select class="workflow-select" id="action-clipboard-operation" onchange="updateClipboardUI()">
                        <option value="copy" ${operation === 'copy' ? 'selected' : ''}>📋 Copy to Clipboard</option>
                        <option value="read" ${operation === 'read' ? 'selected' : ''}>📖 Read from Clipboard</option>
                        <option value="append" ${operation === 'append' ? 'selected' : ''}>➕ Append to Clipboard</option>
                    </select>
                    <p style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 6px;">
                        ${operation === 'copy' ? 'Copies the specified content to system clipboard' : 
                          operation === 'read' ? 'Reads clipboard content into {{clipboard}} variable' : 
                          'Appends content to existing clipboard text'}
                    </p>
                </div>
                <div class="workflow-field" id="clipboard-content-field" style="${operation === 'read' ? 'display:none;' : ''}">
                    <label>Content to ${operation === 'append' ? 'Append' : 'Copy'}</label>
                    <textarea class="workflow-textarea" id="action-clipboard-content" rows="4" 
                              placeholder="Use {{result}} to copy AI response, {{input}} for trigger input">${tempAction.content || ''}</textarea>
                    <p style="font-size: 12px; color: rgba(255,255,255,0.5); margin-top: 6px;">
                        Available variables: {{input}}, {{result}}, {{aiResponse}}, {{clipboard}}
                    </p>
                </div>
            `;
            
            // Add helper function to update UI when operation changes
            window.updateClipboardUI = function() {
                const op = document.getElementById('action-clipboard-operation').value;
                const contentField = document.getElementById('clipboard-content-field');
                if (contentField) {
                    contentField.style.display = op === 'read' ? 'none' : '';
                }
            };
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
            tempAction.duration = parseInt(document.getElementById('action-notif-duration').value, 10);
            tempAction.sound = document.getElementById('action-notif-sound').checked;
        } else if (type === 'clipboard') {
            tempAction.operation = document.getElementById('action-clipboard-operation').value;
            const contentEl = document.getElementById('action-clipboard-content');
            if (contentEl) {
                tempAction.content = contentEl.value;
            }
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
    window.deleteAction = async function(index) {
        if (!currentWorkflow) return;
        
        const confirmed = await window.customConfirm({
            title: 'Delete Action',
            message: 'Delete this action?',
            confirmText: 'Delete',
            type: 'danger'
        });
        
        if (confirmed) {
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
            const frequency = document.getElementById('schedule-frequency')?.value || 'daily';
            const time = document.getElementById('schedule-time')?.value || '09:00';
            
            currentWorkflow.trigger.schedule = {
                frequency,
                time
            };
            
            if (frequency === 'weekly') {
                const selectedDays = Array.from(document.querySelectorAll('.schedule-day-checkbox:checked'))
                    .map(cb => parseInt(cb.value));
                currentWorkflow.trigger.schedule.daysOfWeek = selectedDays.length > 0 ? selectedDays : [1]; // Default to Monday
            } else if (frequency === 'monthly') {
                const dayOfMonth = document.getElementById('schedule-day-of-month')?.value || '1';
                currentWorkflow.trigger.schedule.dayOfMonth = dayOfMonth;
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
        
        const confirmed = await window.customConfirm({
            title: 'Delete Workflow',
            message: `Delete workflow "${currentWorkflow.name}"?`,
            confirmText: 'Delete',
            type: 'danger'
        });
        
        if (!confirmed) return;
        
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
    
    // Helper function to display workflow result in chat
    async function displayWorkflowResultInChat(execution) {
        console.log('📤 Displaying workflow result in chat:', execution);
        
        // Check if addMessage function exists in the parent window
        if (typeof window.addMessage !== 'function') {
            console.error('❌ addMessage function not found in window');
            return;
        }
        
        // Get the workflow name
        const workflow = workflows.find(w => w.id === execution.workflowId);
        const workflowName = workflow ? workflow.name : 'Workflow';
        
        // First, show a loading message
        const loadingMsg = window.addMessage(`⏳ ${workflowName} is running...`, 'ai', false);
        
        // Wait a moment for the loading animation
        await new Promise(resolve => setTimeout(resolve, 800));
        
        // Remove the loading message
        if (loadingMsg && loadingMsg.parentNode) {
            loadingMsg.remove();
        }
        
        // Build the result message - ONLY show the actual output, not metadata
        let resultMessage = '';
        
        if (execution.success && execution.results && execution.results.length > 0) {
            execution.results.forEach((result) => {
                // Extract the actual action type and result
                const actionType = result.action?.type || result.type;
                const actionResult = result.result;
                
                if (actionType === 'ai_prompt' && actionResult) {
                    // For AI prompts, just show the response text
                    const response = actionResult.response || actionResult;
                    resultMessage += `${response}\n\n`;
                } else if (actionType === 'mcp_tool' && actionResult) {
                    // For MCP tools, show the tool output
                    resultMessage += `**MCP Tool Result:**\n\`\`\`json\n${JSON.stringify(actionResult, null, 2)}\n\`\`\`\n\n`;
                } else if (actionType === 'notification' && actionResult) {
                    // For notifications, show the message
                    const message = actionResult.message || actionResult;
                    resultMessage += `${message}\n\n`;
                } else if (actionType === 'http_request' && actionResult) {
                    // For HTTP requests, show formatted response
                    resultMessage += `**HTTP Response:**\n\`\`\`json\n${JSON.stringify(actionResult.data || actionResult, null, 2)}\n\`\`\`\n\n`;
                } else if (actionType === 'clipboard' && actionResult) {
                    // For clipboard actions, show what was done
                    if (actionResult.operation === 'copy') {
                        resultMessage += `📋 Copied ${actionResult.length} characters to clipboard\n\n`;
                    } else if (actionResult.operation === 'read') {
                        resultMessage += `📖 Read ${actionResult.length} characters from clipboard\n\n`;
                    } else if (actionResult.operation === 'append') {
                        resultMessage += `➕ Appended to clipboard (total: ${actionResult.totalLength} characters)\n\n`;
                    }
                } else {
                    // Fallback: show raw result
                    resultMessage += `${JSON.stringify(actionResult, null, 2)}\n\n`;
                }
            });
        } else if (!execution.success) {
            // If workflow failed, show error message
            resultMessage = `❌ Workflow failed: ${execution.error || 'Unknown error'}`;
            if (execution.errors && execution.errors.length > 0) {
                resultMessage += `\n\nErrors:\n${execution.errors.join('\n')}`;
            }
        } else {
            // No results
            resultMessage = '✅ Workflow completed successfully with no output.';
        }
        
        // Trim any extra whitespace
        resultMessage = resultMessage.trim();
        
        // Add the message to chat with typewriter effect
        window.addMessage(resultMessage, 'ai', true);
        console.log('✅ Workflow result added to chat');
    }
    
    // Helper function to switch to chat window
    function switchToChatWindow() {
        console.log('🔀 Switching to chat window');
        
        // Find the chat nav item
        const chatNavItem = document.querySelector('.nav-item[data-target="chat-window"]');
        if (!chatNavItem) {
            console.error('❌ Chat nav item not found');
            return;
        }
        
        // Trigger a click on the chat nav item
        chatNavItem.click();
        console.log('✅ Switched to chat window');
    }
    
    // Make loadWorkflows globally accessible for external refresh
    window.refreshWorkflowList = loadWorkflows;
    
    // Listen for workflow window activation to refresh
    window.addEventListener('workflow-window-activated', async () => {
        console.log('🔄 Workflow window activated, refreshing...');
        await loadWorkflows();
    });
    
    // Also listen for custom refresh event
    window.addEventListener('refresh-workflows', async () => {
        console.log('🔄 Refresh workflows event received');
        await loadWorkflows();
    });
    
    console.log('✅ Workflow Builder loaded');
})();
