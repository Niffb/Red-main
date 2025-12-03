// Workflow Builder Dynamic Loader
// Loads the enhanced workflow builder UI into the workflows window

(function() {
    'use strict';
    
    console.log('🔧 Loading Enhanced Workflow Builder...');
    
    const WorkflowLoader = {
        loaded: false,
        version: Date.now(), // Cache-busting version
        
        async init() {
            if (this.loaded) {
                console.log('⚠️ Workflow Builder already loaded');
                return;
            }
            
            try {
                // Wait for DOM to be ready
                if (document.readyState === 'loading') {
                    await new Promise(resolve => {
                        document.addEventListener('DOMContentLoaded', resolve);
                    });
                }
                
                // Load components with cache-busting version
                await this.loadCSS(`workflow-builder.css?v=${this.version}`);
                await this.loadHTML(`workflow-builder.html?v=${this.version}`);
                await this.loadJS(`workflow-builder.js?v=${this.version}`);
                
                this.loaded = true;
                console.log('✅ Enhanced Workflow Builder loaded successfully');
                
                // Dispatch custom event
                window.dispatchEvent(new CustomEvent('workflow-builder-loaded'));
                
            } catch (error) {
                console.error('❌ Failed to load Workflow Builder:', error);
            }
        },
        
        loadCSS(url) {
            return new Promise((resolve, reject) => {
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
                
                // Wait for workflows window to exist, with retries
                let workflowsWindow = document.getElementById('workflows-window');
                let retries = 0;
                const maxRetries = 10;
                
                while (!workflowsWindow && retries < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, 100));
                    workflowsWindow = document.getElementById('workflows-window');
                    retries++;
                }
                
                if (workflowsWindow) {
                    // Replace existing content with new builder
                    workflowsWindow.innerHTML = html;
                    console.log('✅ HTML replaced in workflows window');
                } else {
                    console.error('❌ Workflows window not found after retries');
                    // Try to create it if it doesn't exist
                    const windowContainer = document.querySelector('.window-container');
                    if (windowContainer) {
                        const newWindow = document.createElement('div');
                        newWindow.id = 'workflows-window';
                        newWindow.className = 'window';
                        newWindow.style.display = 'none';
                        newWindow.innerHTML = html;
                        windowContainer.appendChild(newWindow);
                        console.log('✅ Created workflows window');
                    }
                }
                
            } catch (error) {
                console.error('❌ Failed to load HTML:', url, error);
                throw error;
            }
        },
        
        loadJS(url) {
            return new Promise((resolve, reject) => {
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
        }
    };
    
    // Initialize
    WorkflowLoader.init();
    
})();

