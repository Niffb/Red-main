// MCP Settings Dynamic Loader
// This script dynamically loads the MCP Settings UI into the app

(function() {
    'use strict';
    
    console.log('🔌 Loading MCP Settings...');
    
    const MCPLoader = {
        loaded: false,
        retryCount: 0,
        maxRetries: 3,
        
        async init() {
            if (this.loaded) {
                console.log('⚠️ MCP Settings already loaded');
                return;
            }
            
            try {
                // Wait for DOM to be ready
                if (document.readyState === 'loading') {
                    await new Promise(resolve => {
                        document.addEventListener('DOMContentLoaded', resolve);
                    });
                }
                
                // Load components
                await this.loadCSS('mcp-settings.css');
                await this.loadHTML('mcp-settings.html');
                await this.loadJS('mcp-settings.js');
                
                // Setup navigation
                this.setupNavigation();
                
                this.loaded = true;
                console.log('✅ MCP Settings loaded successfully');
                
                // Dispatch custom event
                window.dispatchEvent(new CustomEvent('mcp-settings-loaded'));
                
            } catch (error) {
                console.error('❌ Failed to load MCP Settings:', error);
                
                // Retry
                if (this.retryCount < this.maxRetries) {
                    this.retryCount++;
                    console.log(`🔄 Retrying... (${this.retryCount}/${this.maxRetries})`);
                    setTimeout(() => this.init(), 1000);
                }
            }
        },
        
        loadCSS(url) {
            return new Promise((resolve, reject) => {
                // Check if already loaded
                if (document.querySelector(`link[href="${url}"]`)) {
                    console.log('📄 CSS already loaded:', url);
                    resolve();
                    return;
                }
                
                console.log('📄 Loading CSS:', url);
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = url;
                link.onload = () => {
                    console.log('✅ CSS loaded:', url);
                    resolve();
                };
                link.onerror = () => {
                    console.error('❌ Failed to load CSS:', url);
                    reject(new Error(`Failed to load CSS: ${url}`));
                };
                document.head.appendChild(link);
            });
        },
        
        async loadHTML(url) {
            console.log('📄 Loading HTML:', url);
            
            try {
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                }
                
                const html = await response.text();
                
                // Find insertion point
                const workflowsWindow = document.getElementById('workflows-window');
                if (workflowsWindow) {
                    workflowsWindow.insertAdjacentHTML('afterend', html);
                    console.log('✅ HTML inserted after workflows window');
                } else {
                    // Fallback: insert before closing body
                    document.body.insertAdjacentHTML('beforeend', html);
                    console.log('✅ HTML inserted at end of body');
                }
                
            } catch (error) {
                console.error('❌ Failed to load HTML:', url, error);
                throw error;
            }
        },
        
        loadJS(url) {
            return new Promise((resolve, reject) => {
                // Check if already loaded
                if (document.querySelector(`script[src="${url}"]`)) {
                    console.log('📄 JavaScript already loaded:', url);
                    resolve();
                    return;
                }
                
                console.log('📄 Loading JavaScript:', url);
                const script = document.createElement('script');
                script.src = url;
                script.onload = () => {
                    console.log('✅ JavaScript loaded:', url);
                    resolve();
                };
                script.onerror = () => {
                    console.error('❌ Failed to load JavaScript:', url);
                    reject(new Error(`Failed to load JavaScript: ${url}`));
                };
                document.body.appendChild(script);
            });
        },
        
        setupNavigation() {
            console.log('🔧 Setting up navigation...');
            
            const nav = document.querySelector('.navigation ul');
            if (!nav) {
                console.error('❌ Navigation element not found');
                return;
            }
            
            // Check if already added
            if (document.querySelector('[data-target="mcp-window"]')) {
                console.log('⚠️ MCP navigation item already exists');
                return;
            }
            
            // Create MCP navigation item
            const mcpTab = document.createElement('li');
            mcpTab.className = 'list';
            mcpTab.dataset.target = 'mcp-window';
            mcpTab.innerHTML = `
                <a>
                    <span class="icon">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                            <path d="M2 17l10 5 10-5"></path>
                            <path d="M2 12l10 5 10-5"></path>
                        </svg>
                    </span>
                    <span class="text">Integrations</span>
                </a>
            `;
            
            // Insert after workflows tab
            const workflowsTab = nav.querySelector('[data-target="workflows-window"]');
            if (workflowsTab) {
                workflowsTab.parentNode.insertBefore(mcpTab, workflowsTab.nextSibling);
                console.log('✅ MCP tab inserted after workflows tab');
            } else {
                nav.appendChild(mcpTab);
                console.log('✅ MCP tab appended to navigation');
            }
            
            // Hook into navigation system
            this.setupNavigationEvents(mcpTab);
            
            console.log('✅ Navigation setup complete');
        },
        
        setupNavigationEvents(mcpTab) {
            // Find existing navigation handler pattern
            const existingTabs = document.querySelectorAll('.list');
            
            // Add click handler
            mcpTab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                console.log('🔌 MCP tab clicked');
                
                // Remove active from all tabs
                existingTabs.forEach(tab => tab.classList.remove('active'));
                
                // Hide all windows
                document.querySelectorAll('.window').forEach(window => {
                    window.style.display = 'none';
                });
                
                // Activate MCP tab
                mcpTab.classList.add('active');
                
                // Show MCP window
                const mcpWindow = document.getElementById('mcp-window');
                if (mcpWindow) {
                    mcpWindow.style.display = 'block';
                    console.log('✅ MCP window displayed');
                    
                    // Trigger initialization if not already done
                    if (typeof initMcpSettings === 'function' && !window.mcpSettingsInitialized) {
                        console.log('🔧 Initializing MCP settings...');
                        initMcpSettings();
                        window.mcpSettingsInitialized = true;
                    }
                } else {
                    console.error('❌ MCP window not found');
                }
            });
            
            // Also hook into the existing navigation system if it exists
            if (typeof window.setupNavigation === 'function') {
                console.log('🔧 Hooking into existing navigation system');
                // The existing system will handle our tab too
            }
        }
    };
    
    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => MCPLoader.init());
    } else {
        // DOM already loaded
        MCPLoader.init();
    }
    
    // Export for manual initialization if needed
    window.MCPLoader = MCPLoader;
    
})();

