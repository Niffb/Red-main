const ComponentLoader = {
    components: new Map(),
    loaded: new Set(),
    version: Date.now(),
    
    async loadComponent(componentName, config = {}) {
        if (this.loaded.has(componentName)) {
            console.log(`⚠️ Component already loaded: ${componentName}`);
            return;
        }
        
        try {
            console.log(`📦 Loading component: ${componentName}`);
            
            if (config.css) {
                await this.loadCSS(config.css);
            }
            
            if (config.html) {
                await this.loadHTML(config.html, config.target, config.insertMode);
            }
            
            if (config.js) {
                await this.loadJS(config.js);
            }
            
            this.loaded.add(componentName);
            console.log(`✅ Component loaded: ${componentName}`);
            
            window.dispatchEvent(new CustomEvent(`component-loaded`, { 
                detail: { component: componentName } 
            }));
            
        } catch (error) {
            console.error(`❌ Failed to load component ${componentName}:`, error);
            throw error;
        }
    },
    
    loadCSS(url) {
        return new Promise((resolve, reject) => {
            const fullUrl = `${url}?v=${this.version}`;
            
            if (document.querySelector(`link[href*="${url}"]`)) {
                console.log(`  ✓ CSS already loaded: ${url}`);
                resolve();
                return;
            }
            
            console.log(`  📄 Loading CSS: ${url}`);
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = fullUrl;
            link.onload = () => {
                console.log(`  ✓ CSS loaded: ${url}`);
                resolve();
            };
            link.onerror = () => {
                console.error(`  ✗ Failed to load CSS: ${url}`);
                reject(new Error(`Failed to load CSS: ${url}`));
            };
            document.head.appendChild(link);
        });
    },
    
    async loadHTML(url, targetSelector, insertMode = 'replace') {
        const fullUrl = `${url}?v=${this.version}`;
        console.log(`  📄 Loading HTML: ${url}`);
        
        try {
            const response = await fetch(fullUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const html = await response.text();
            
            if (targetSelector) {
                const target = document.querySelector(targetSelector);
                if (target) {
                    switch(insertMode) {
                        case 'replace':
                            target.innerHTML = html;
                            break;
                        case 'append':
                            target.insertAdjacentHTML('beforeend', html);
                            break;
                        case 'prepend':
                            target.insertAdjacentHTML('afterbegin', html);
                            break;
                        case 'after':
                            target.insertAdjacentHTML('afterend', html);
                            break;
                        case 'before':
                            target.insertAdjacentHTML('beforebegin', html);
                            break;
                    }
                    console.log(`  ✓ HTML loaded into ${targetSelector}`);
                } else {
                    console.error(`  ✗ Target not found: ${targetSelector}`);
                }
            } else {
                document.body.insertAdjacentHTML('beforeend', html);
                console.log(`  ✓ HTML appended to body`);
            }
            
        } catch (error) {
            console.error(`  ✗ Failed to load HTML: ${url}`, error);
            throw error;
        }
    },
    
    loadJS(url) {
        return new Promise((resolve, reject) => {
            const fullUrl = `${url}?v=${this.version}`;
            
            if (document.querySelector(`script[src*="${url}"]`)) {
                console.log(`  ✓ JavaScript already loaded: ${url}`);
                resolve();
                return;
            }
            
            console.log(`  📄 Loading JavaScript: ${url}`);
            const script = document.createElement('script');
            script.src = fullUrl;
            script.onload = () => {
                console.log(`  ✓ JavaScript loaded: ${url}`);
                resolve();
            };
            script.onerror = () => {
                console.error(`  ✗ Failed to load JavaScript: ${url}`);
                reject(new Error(`Failed to load JavaScript: ${url}`));
            };
            document.body.appendChild(script);
        });
    },
    
    async loadAll(componentConfigs) {
        console.log('🚀 Loading all components...');
        const promises = componentConfigs.map(({ name, config }) => 
            this.loadComponent(name, config)
        );
        await Promise.all(promises);
        console.log('✅ All components loaded successfully');
    }
};

window.ComponentLoader = ComponentLoader;

