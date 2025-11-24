// Prevent browser scroll restoration
if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

document.addEventListener('DOMContentLoaded', function () {
    console.log('Script.js loaded and DOM ready');

    // Force scroll to top on DOM ready
    window.scrollTo(0, 0);

    // Theme toggle functionality
    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);

        // Update toggle button UI (only if elements exist)
        const themeToggle = document.querySelector('.theme-toggle');
        const sunIcon = document.querySelector('.sun-icon');
        const moonIcon = document.querySelector('.moon-icon');

        if (sunIcon && moonIcon) {
            if (theme === 'dark') {
                sunIcon.style.opacity = '0';
                sunIcon.style.transform = 'translateY(-10px)';
                moonIcon.style.opacity = '1';
                moonIcon.style.transform = 'translateY(0)';
            } else {
                sunIcon.style.opacity = '1';
                sunIcon.style.transform = 'translateY(0)';
                moonIcon.style.opacity = '0';
                moonIcon.style.transform = 'translateY(10px)';
            }
        }
    }

    // Initialize theme
    const savedTheme = localStorage.getItem('theme');
    const prefersDarkMode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

    if (savedTheme) {
        setTheme(savedTheme);
    } else if (prefersDarkMode) {
        setTheme('dark');
    } else {
        setTheme('light');
    }

    // Theme toggle event listener
    const themeToggle = document.querySelector('.theme-toggle');
    if (themeToggle) {
        themeToggle.addEventListener('click', function () {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
        });
    }

    // Navbar scroll background functionality
    const header = document.querySelector('.modern-header');
    if (header) {
        let lastScrollY = window.scrollY;

        // Function to handle navbar background on scroll
        function handleNavbarBackground() {
            const scrollY = window.scrollY;

            // Add background when user scrolls down past 100px
            const triggerPoint = 100;
            const shouldShowBackground = scrollY > triggerPoint;

            // Add a slight delay/hysteresis to prevent flickering
            if (shouldShowBackground && !header.classList.contains('scrolled')) {
                header.classList.add('scrolled');
            } else if (!shouldShowBackground && header.classList.contains('scrolled')) {
                // Only remove if we've scrolled back up significantly
                const returnPoint = triggerPoint - 30;
                if (scrollY < returnPoint) {
                    header.classList.remove('scrolled');
                }
            }

            lastScrollY = scrollY;
        }

        // Initial setup
        setTimeout(() => {
            handleNavbarBackground();
        }, 100);

        // Update on scroll with throttling for better performance
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            if (scrollTimeout) {
                clearTimeout(scrollTimeout);
            }
            scrollTimeout = setTimeout(handleNavbarBackground, 10);
        });

        // Also update on resize
        window.addEventListener('resize', () => {
            setTimeout(() => {
                handleNavbarBackground();
            }, 100);
        });
    }

    // Mobile Menu Functionality - Updated for simplified navbar structure
    const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
    const navBar = document.querySelector('.nav-bar');
    const navLinks = document.querySelectorAll('.nav-link');

    if (mobileMenuBtn) {
        mobileMenuBtn.addEventListener('click', function () {
            this.classList.toggle('active');
            navBar.classList.toggle('active');
        });
    }

    // Close mobile menu when clicking outside
    document.addEventListener('click', function (event) {
        if (!event.target.closest('.mobile-menu-btn') && !event.target.closest('.nav-bar')) {
            if (mobileMenuBtn) mobileMenuBtn.classList.remove('active');
            if (navBar) navBar.classList.remove('active');
        }
    });

    // Close mobile menu when clicking on a link
    navLinks.forEach(link => {
        link.addEventListener('click', function () {
            if (mobileMenuBtn) mobileMenuBtn.classList.remove('active');
            if (navBar) navBar.classList.remove('active');
        });
    });

    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
        if (!localStorage.getItem('theme')) {
            const newTheme = e.matches ? 'dark' : 'light';
            setTheme(newTheme);
        }
    });

    // Advanced Typewriter Effect with MCP Mocks
    const typewriterElement = document.getElementById('typewriter-text');
    const mcpContainer = document.getElementById('mcp-cards-container');

    if (typewriterElement && mcpContainer) {
        // Sequence definition: Array of steps
        // type: 'text' | 'icon' | 'card' | 'delete' | 'pause'
        const sequence = [


            // 7. Screen Capture Tool Call
            { type: 'text', content: 'Capture ' },
            { type: 'icon', content: '<span class="inline-icon" style="background:#e0f2fe; color:#0284c7"><i class="fas fa-desktop"></i></span>' },
            { type: 'text', content: ' this bug report' },
            {
                type: 'card', id: 'capture-card',
                html: `<div class="mcp-card">
                        <div class="mcp-card-icon capture"><i class="fas fa-desktop"></i></div>
                        <div class="mcp-card-content">
                            <div class="mcp-card-title">Bug Report</div>
                            <div class="mcp-card-subtitle">Screen Capture • Saved</div>
                        </div>
                     </div>`
            },
            { type: 'pause', duration: 3000 },
            { type: 'delete', amount: 'all' },

            // 2. Notion Tool Call
            { type: 'text', content: 'Draft a project brief in ' },
            { type: 'icon', content: '<span class="inline-icon" style="background:#f3f4f6; color:#000"><i class="fas fa-book"></i></span>' }, // Notion icon
            { type: 'text', content: ' Team Wiki' },
            {
                type: 'card', id: 'notion-card',
                html: `<div class="mcp-card">
                        <div class="mcp-card-icon notion"><i class="fas fa-book"></i></div>
                        <div class="mcp-card-content">
                            <div class="mcp-card-title">Project Brief</div>
                            <div class="mcp-card-subtitle">Notion • Team Wiki</div>
                        </div>
                     </div>`
            },
            { type: 'pause', duration: 3000 },
            { type: 'delete', amount: 'all' },



            // 4. GitHub Tool Call
            { type: 'text', content: 'Check status of ' },
            { type: 'icon', content: '<span class="inline-icon" style="background:#f0f0f0; color:#24292e"><i class="fab fa-github"></i></span>' },
            { type: 'text', content: ' PR #88' },
            {
                type: 'card', id: 'github-card',
                html: `<div class="mcp-card">
                        <div class="mcp-card-icon github"><i class="fab fa-github"></i></div>
                        <div class="mcp-card-content">
                            <div class="mcp-card-title">Fix auth flow</div>
                            <div class="mcp-card-subtitle">GitHub • #88</div>
                        </div>
                     </div>`
            },
            { type: 'pause', duration: 3000 },
            { type: 'delete', amount: 'all' },

            // 5. Voice Transcription Tool Call
            { type: 'text', content: 'Transcribe ' },
            { type: 'icon', content: '<span class="inline-icon" style="background:#fee2e2; color:#dc2626"><i class="fas fa-microphone"></i></span>' },
            { type: 'text', content: ' this morning\'s standup' },
            {
                type: 'card', id: 'voice-card',
                html: `<div class="mcp-card">
                        <div class="mcp-card-icon voice"><i class="fas fa-microphone"></i></div>
                        <div class="mcp-card-content">
                            <div class="mcp-card-title">Daily Standup</div>
                            <div class="mcp-card-subtitle">Voice • Processing...</div>
                        </div>
                     </div>`
            },
            { type: 'pause', duration: 3000 },
            { type: 'delete', amount: 'all' },

            // 6. Workflow Tool Call
            { type: 'text', content: 'Run ' },
            { type: 'icon', content: '<span class="inline-icon" style="background:#f3e8ff; color:#9333ea"><i class="fas fa-bolt"></i></span>' },
            { type: 'text', content: ' Monthly Report' },
            {
                type: 'card', id: 'workflow-card',
                html: `<div class="mcp-card">
                        <div class="mcp-card-icon workflow"><i class="fas fa-bolt"></i></div>
                        <div class="mcp-card-content">
                            <div class="mcp-card-title">Generate Report</div>
                            <div class="mcp-card-subtitle">Workflow • Running</div>
                        </div>
                     </div>`
            },
            { type: 'pause', duration: 3000 },
            { type: 'delete', amount: 'all' },


        ];

        let stepIndex = 0;
        let charIndex = 0;
        let currentText = ''; // To track text for deletion

        function processSequence() {
            if (stepIndex >= sequence.length) {
                stepIndex = 0; // Loop
            }

            const step = sequence[stepIndex];

            if (step.type === 'text') {
                // Optimization: Use insertAdjacentText instead of innerHTML +=
                // This is performant and avoids re-parsing HTML, and is less fragile than manual text node manipulation
                const char = step.content[charIndex];
                typewriterElement.insertAdjacentText('beforeend', char);
                currentText += char;
                charIndex++;

                if (charIndex < step.content.length) {
                    setTimeout(processSequence, 40 + Math.random() * 30);
                } else {
                    charIndex = 0;
                    stepIndex++;
                    setTimeout(processSequence, 50);
                }
            } else if (step.type === 'icon') {
                typewriterElement.insertAdjacentHTML('beforeend', step.content);
                stepIndex++;
                setTimeout(processSequence, 100);
            } else if (step.type === 'card') {
                // Show container if hidden
                if (mcpContainer.style.display !== 'flex') {
                    mcpContainer.style.display = 'flex';
                    mcpContainer.classList.add('visible');
                }
                mcpContainer.insertAdjacentHTML('beforeend', step.html);
                stepIndex++;
                setTimeout(processSequence, 100);
            } else if (step.type === 'pause') {
                setTimeout(() => {
                    stepIndex++;
                    processSequence();
                }, step.duration);
            } else if (step.type === 'delete') {
                // Clear cards first with a slight delay for effect
                mcpContainer.classList.remove('visible');
                setTimeout(() => {
                    mcpContainer.innerHTML = '';
                    mcpContainer.style.display = 'none';
                }, 300);

                // Simple clear for now
                typewriterElement.textContent = '';
                currentText = '';
                stepIndex++;
                setTimeout(processSequence, 500);
            }
        }

        // Start after a short delay
        setTimeout(processSequence, 1000);
    }
});

