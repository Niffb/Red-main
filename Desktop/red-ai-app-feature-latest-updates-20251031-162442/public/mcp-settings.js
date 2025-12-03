// MCP Settings JavaScript
//=========================================
// MCP State Management
//=========================================
const mcpState = {
    servers: [],
    tools: {},
    selectedServer: null,
    templates: {
        filesystem: {
            name: 'filesystem',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/yousefaly/Desktop'],
            env: {},
            requiresConfig: true,
            configFields: [
                { name: 'rootPath', label: 'Root Directory Path', type: 'text', default: '/Users/yousefaly/Desktop', required: true, placeholder: '/Users/yousefaly/Desktop', isArg: true, argIndex: 2 }
            ],
            description: 'Access files and directories. The root path specifies which directory the AI can access.'
        },
        github: {
            name: 'github',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-github'],
            env: { GITHUB_TOKEN: '' },
            requiresConfig: true,
            configFields: [
                { name: 'GITHUB_TOKEN', label: 'GitHub Personal Access Token', type: 'password', required: true }
            ]
        },
        notion: {
            name: 'notion',
            command: 'npx',
            args: ['-y', 'mcp-remote', 'https://mcp.notion.com/mcp'],
            env: {},
            requiresConfig: false,
            description: 'Connect to Notion workspace. Uses Notion\'s official MCP remote server. You\'ll authenticate through Notion\'s OAuth when you first use it.'
        },
        slack: {
            name: 'slack',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-slack'],
            env: { SLACK_BOT_TOKEN: '' },
            requiresConfig: true,
            configFields: [
                { name: 'SLACK_BOT_TOKEN', label: 'Slack Bot Token', type: 'password', required: true }
            ]
        },
        'google-drive': {
            name: 'google-drive',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-google-drive'],
            env: { GOOGLE_APPLICATION_CREDENTIALS: '' },
            requiresConfig: true,
            configFields: [
                { name: 'GOOGLE_APPLICATION_CREDENTIALS', label: 'Service Account JSON Path', type: 'text', required: true }
            ]
        },
        database: {
            name: 'database',
            command: 'npx',
            args: ['-y', '@modelcontextprotocol/server-postgres'],
            env: { DATABASE_URL: '' },
            requiresConfig: true,
            configFields: [
                { name: 'DATABASE_URL', label: 'Database Connection URL', type: 'text', placeholder: 'postgresql://user:pass@localhost:5432/db', required: true }
            ]
        }
    }
};

//=========================================
// MCP Initialization
//=========================================
async function initMcpSettings() {
    console.log('🔌 Initializing MCP settings...');
    
    // Set up tab navigation
    setupMcpTabs();
    
    // Set up event listeners
    setupMcpEventListeners();
    
    // Load initial data
    await refreshMcpServers();
    await refreshMcpTools();
    
    // Listen for MCP events from Electron
    if (window.electronAPI && window.electronAPI.onMcpEvent) {
        window.electronAPI.onMcpEvent((event) => {
            console.log('📡 MCP Event:', event);
            handleMcpEvent(event);
        });
    }
    
    console.log('✅ MCP settings initialized');
}

//=========================================
// Tab Navigation
//=========================================
function setupMcpTabs() {
    const tabs = document.querySelectorAll('.mcp-tab');
    const contents = document.querySelectorAll('.mcp-tab-content');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const targetTab = tab.dataset.tab;
            
            // Update active tab
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Update active content
            contents.forEach(c => c.classList.remove('active'));
            const targetContent = document.querySelector(`[data-content="${targetTab}"]`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

//=========================================
// Event Listeners
//=========================================
function setupMcpEventListeners() {
    // Add server button
    const addBtn = document.getElementById('mcp-add-server-btn');
    if (addBtn) {
        addBtn.addEventListener('click', openMcpModal);
    }
    
    // Refresh tools button
    const refreshBtn = document.getElementById('mcp-refresh-tools-btn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', refreshMcpTools);
    }
    
    // Tools search
    const searchInput = document.getElementById('mcp-tools-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            filterMcpTools(e.target.value);
        });
    }
}

//=========================================
// Server Management
//=========================================
async function refreshMcpServers() {
    try {
        const result = await window.electronAPI.mcpListServers();
        
        if (result.success) {
            mcpState.servers = result.servers;
            renderMcpServers();
        } else {
            console.error('Failed to list servers:', result.error);
            showMcpNotification('Failed to load servers', 'error');
        }
    } catch (error) {
        console.error('Error refreshing servers:', error);
        showMcpNotification('Error loading servers', 'error');
    }
}

function renderMcpServers() {
    const container = document.getElementById('mcp-servers-list');
    if (!container) return;
    
    if (mcpState.servers.length === 0) {
        container.innerHTML = `
            <div class="mcp-empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
                    <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
                    <line x1="6" y1="6" x2="6.01" y2="6"></line>
                    <line x1="6" y1="18" x2="6.01" y2="18"></line>
                </svg>
                <h3>No servers connected</h3>
                <p>Add an MCP server to start integrating with external tools and services</p>
                <button class="mcp-primary-btn" onclick="openMcpModal()">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="5" x2="12" y2="19"></line>
                        <line x1="5" y1="12" x2="19" y2="12"></line>
                    </svg>
                    Add Your First Server
                </button>
            </div>
        `;
        return;
    }
    
    container.innerHTML = mcpState.servers.map(server => `
        <div class="mcp-server-card">
            <div class="mcp-server-header">
                <div class="mcp-server-info">
                    <div class="mcp-server-name">
                        ${escapeHtml(server.name)}
                        <span class="mcp-status-badge ${server.status}">
                            <span class="mcp-status-dot"></span>
                            ${server.status}
                        </span>
                    </div>
                    <div class="mcp-server-command">${escapeHtml(getServerCommand(server))}</div>
                </div>
                <div class="mcp-server-actions">
                    <button class="mcp-icon-btn" onclick="refreshMcpServer('${escapeHtml(server.name)}')" title="Refresh">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                        </svg>
                    </button>
                    <button class="mcp-icon-btn danger" onclick="removeMcpServer('${escapeHtml(server.name)}')" title="Remove">
                        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M3 6h18"></path>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="mcp-server-stats">
                <div class="mcp-stat">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                    </svg>
                    ${server.toolCount} tools
                </div>
                <div class="mcp-stat">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="10"></circle>
                        <path d="M12 6v6l4 2"></path>
                    </svg>
                    ${formatUptime(server.uptime)}
                </div>
                ${server.restartCount > 0 ? `
                <div class="mcp-stat">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"></path>
                    </svg>
                    ${server.restartCount} restarts
                </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

async function removeMcpServer(serverName) {
    if (!confirm(`Are you sure you want to remove the server "${serverName}"?`)) {
        return;
    }
    
    try {
        const result = await window.electronAPI.mcpRemoveServer(serverName);
        
        if (result.success) {
            showMcpNotification(`Server "${serverName}" removed`, 'success');
            await refreshMcpServers();
            await refreshMcpTools();
        } else {
            showMcpNotification(`Failed to remove server: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error removing server:', error);
        showMcpNotification('Error removing server', 'error');
    }
}

async function refreshMcpServer(serverName) {
    try {
        showMcpNotification(`Refreshing server "${serverName}"...`, 'info');
        
        // Get current server status
        const result = await window.electronAPI.mcpGetStatus(serverName);
        
        if (result.success) {
            await refreshMcpServers();
            await refreshMcpTools();
            showMcpNotification(`Server "${serverName}" refreshed`, 'success');
        } else {
            showMcpNotification(`Failed to refresh: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error refreshing server:', error);
        showMcpNotification('Error refreshing server', 'error');
    }
}

//=========================================
// Tools Management
//=========================================
async function refreshMcpTools() {
    try {
        const result = await window.electronAPI.mcpGetTools();
        
        if (result.success) {
            mcpState.tools = result.tools;
            renderMcpTools();
        } else {
            console.error('Failed to get tools:', result.error);
        }
    } catch (error) {
        console.error('Error refreshing tools:', error);
    }
}

function renderMcpTools() {
    const container = document.getElementById('mcp-tools-list');
    if (!container) return;
    
    const toolKeys = Object.keys(mcpState.tools);
    
    if (toolKeys.length === 0) {
        container.innerHTML = `
            <div class="mcp-empty-state">
                <svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"></path>
                </svg>
                <h3>No tools available</h3>
                <p>Connect an MCP server to access its tools</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = toolKeys.map(key => {
        const tool = mcpState.tools[key];
        return `
            <div class="mcp-tool-card" onclick="showToolDetails('${escapeHtml(key)}')">
                <div class="mcp-tool-header">
                    <div class="mcp-tool-name">${escapeHtml(tool.name)}</div>
                    <div class="mcp-tool-server">${escapeHtml(tool.server)}</div>
                </div>
                <div class="mcp-tool-description">${escapeHtml(tool.description || 'No description available')}</div>
            </div>
        `;
    }).join('');
}

function filterMcpTools(searchTerm) {
    const toolCards = document.querySelectorAll('.mcp-tool-card');
    const term = searchTerm.toLowerCase();
    
    toolCards.forEach(card => {
        const name = card.querySelector('.mcp-tool-name').textContent.toLowerCase();
        const desc = card.querySelector('.mcp-tool-description').textContent.toLowerCase();
        const matches = name.includes(term) || desc.includes(term);
        card.style.display = matches ? 'block' : 'none';
    });
}

function showToolDetails(toolKey) {
    const tool = mcpState.tools[toolKey];
    if (!tool) return;
    
    const modal = document.getElementById('mcp-tool-details-modal');
    const title = document.getElementById('mcp-tool-modal-title');
    const body = document.getElementById('mcp-tool-modal-body');
    
    title.textContent = tool.name;
    body.innerHTML = `
        <div class="mcp-form-group">
            <label>Server</label>
            <div style="padding: 12px; background: rgba(102, 126, 234, 0.15); border-radius: 10px; color: #667eea; font-weight: 600;">
                ${escapeHtml(tool.server)}
            </div>
        </div>
        <div class="mcp-form-group">
            <label>Description</label>
            <div style="padding: 12px; background: rgba(40, 40, 40, 0.8); border-radius: 10px; color: rgba(255, 255, 255, 0.8);">
                ${escapeHtml(tool.description || 'No description available')}
            </div>
        </div>
        <div class="mcp-form-group">
            <label>Input Schema</label>
            <pre style="padding: 16px; background: rgba(20, 20, 20, 0.9); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; color: #d4d4d4; overflow-x: auto; font-size: 12px; font-family: 'Courier New', monospace; white-space: pre-wrap;">${JSON.stringify(tool.inputSchema, null, 2)}</pre>
        </div>
    `;
    
    modal.style.display = 'flex';
}

function closeToolDetailsModal() {
    const modal = document.getElementById('mcp-tool-details-modal');
    modal.style.display = 'none';
}

//=========================================
// Modal Management
//=========================================
function openMcpModal() {
    const modal = document.getElementById('mcp-add-server-modal');
    modal.style.display = 'flex';
    
    // Clear form
    document.getElementById('mcp-modal-name').value = '';
    document.getElementById('mcp-modal-command').value = 'npx';
    document.getElementById('mcp-modal-args').value = '';
    document.getElementById('mcp-modal-env').value = '';
}

function closeMcpModal() {
    const modal = document.getElementById('mcp-add-server-modal');
    modal.style.display = 'none';
}

async function addMcpServer() {
    const name = document.getElementById('mcp-modal-name').value.trim();
    const command = document.getElementById('mcp-modal-command').value.trim();
    const argsText = document.getElementById('mcp-modal-args').value;
    const envText = document.getElementById('mcp-modal-env').value;
    
    if (!name || !command) {
        showMcpNotification('Please fill in required fields', 'error');
        return;
    }
    
    // Parse args
    const args = argsText.split('\n').map(s => s.trim()).filter(s => s);
    
    // Parse env
    const env = {};
    envText.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            env[key.trim()] = valueParts.join('=').trim();
        }
    });
    
    // Disable button and show loader
    const addBtn = document.getElementById('mcp-modal-add-btn');
    addBtn.disabled = true;
    addBtn.querySelector('.mcp-btn-text').style.display = 'none';
    addBtn.querySelector('.mcp-btn-loader').style.display = 'flex';
    
    try {
        const result = await window.electronAPI.mcpAddServer({
            serverName: name,
            command,
            args,
            env
        });
        
        if (result.success) {
            showMcpNotification(`Server "${name}" added successfully`, 'success');
            closeMcpModal();
            await refreshMcpServers();
            await refreshMcpTools();
        } else {
            showMcpNotification(`Failed to add server: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('Error adding server:', error);
        showMcpNotification('Error adding server', 'error');
    } finally {
        // Re-enable button
        addBtn.disabled = false;
        addBtn.querySelector('.mcp-btn-text').style.display = 'block';
        addBtn.querySelector('.mcp-btn-loader').style.display = 'none';
    }
}

//=========================================
// Template Management
//=========================================
async function mcpAddFromTemplate(templateName) {
    const template = mcpState.templates[templateName];
    if (!template) {
        showMcpNotification('Template not found', 'error');
        return;
    }
    
    // Always show the modal with template pre-filled
    // This allows users to review/edit before adding
    showTemplateConfigModal(template);
}

function showTemplateConfigModal(template) {
    const modal = document.getElementById('mcp-add-server-modal');
    const nameInput = document.getElementById('mcp-modal-name');
    const commandInput = document.getElementById('mcp-modal-command');
    const argsTextarea = document.getElementById('mcp-modal-args');
    const envTextarea = document.getElementById('mcp-modal-env');
    
    // Pre-fill form
    nameInput.value = template.name;
    commandInput.value = template.command;
    argsTextarea.value = template.args.join('\n');
    
    if (template.configFields && template.configFields.length > 0) {
        // Separate fields into args and env
        const envFields = template.configFields.filter(field => !field.isArg);
        const argFields = template.configFields.filter(field => field.isArg);
        
        // Update args with field values
        if (argFields.length > 0) {
            const argsArray = [...template.args];
            argFields.forEach(field => {
                if (field.argIndex !== undefined) {
                    argsArray[field.argIndex] = field.default || '';
                }
            });
            argsTextarea.value = argsArray.join('\n');
        }
        
        // Build env text from non-arg config fields
        if (envFields.length > 0) {
            const envLines = envFields.map(field => {
                const defaultValue = field.default || '';
                return `${field.name}=${defaultValue}`;
            });
            envTextarea.value = envLines.join('\n');
        } else {
            envTextarea.value = '';
        }
    } else {
        const envLines = Object.entries(template.env).map(([key, value]) => `${key}=${value}`);
        envTextarea.value = envLines.join('\n');
    }
    
    modal.style.display = 'flex';
}

//=========================================
// Event Handlers
//=========================================
function handleMcpEvent(event) {
    switch (event.type) {
        case 'server-started':
            showMcpNotification(`Server "${event.data.serverName}" started`, 'success');
            refreshMcpServers();
            refreshMcpTools();
            break;
        case 'server-stopped':
        case 'server-exit':
            refreshMcpServers();
            break;
        case 'server-error':
            showMcpNotification(`Server error: ${event.data.error}`, 'error');
            refreshMcpServers();
            break;
    }
}

//=========================================
// Utility Functions
//=========================================
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m`;
    } else {
        return `${seconds}s`;
    }
}

function getServerCommand(server) {
    // This is a placeholder - in real implementation, we'd store the command
    return `Server: ${server.name}`;
}

function showMcpNotification(message, type = 'info') {
    console.log(`[MCP ${type}] ${message}`);
    
    // You can integrate this with your existing notification system
    // For now, we'll just use console
    
    // If you have a notification system in the main app, use it here
    // Example: showNotification(message, type);
}

//=========================================
// Initialize on load
//=========================================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMcpSettings);
} else {
    // If called after page load (e.g., dynamic insertion)
    setTimeout(initMcpSettings, 100);
}

// Export functions for global access
window.mcpAddFromTemplate = mcpAddFromTemplate;
window.closeMcpModal = closeMcpModal;
window.addMcpServer = addMcpServer;
window.removeMcpServer = removeMcpServer;
window.refreshMcpServer = refreshMcpServer;
window.showToolDetails = showToolDetails;
window.closeToolDetailsModal = closeToolDetailsModal;
window.openMcpModal = openMcpModal;

