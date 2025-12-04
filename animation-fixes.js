// Animation fixes for hero cycling text and bento grid
console.log('Animation fixes loaded');

// AOS initialization moved to red.html to prevent conflicts
document.addEventListener('DOMContentLoaded', function () {
    console.log('🔧 Animation fixes: AOS initialization handled by main script');

    // Fix 2: Hero cycling text animation
    setTimeout(function () {
        initCyclingTextFixed();
    }, 1000);

    // Fix 3: Bento grid animations
    setTimeout(function () {
        initBentoAnimationsFixed();
    }, 1500);

    // Fix 4: Video switching functionality
    setTimeout(function () {
        initVideoSwitcher();
    }, 2000);
});

// Fixed cycling text function
function initCyclingTextFixed() {
    console.log('🎯 animation-fixes.js: initCyclingTextFixed() started - this should be the ONLY typing system running');
    const words = ['Plan', 'Talk', 'Research', 'Task', 'Analyze', 'Create', 'Schedule'];
    const conversations = [
        {
            userMessage: "Help me plan a marketing strategy for Q2",
            aiResponse: "I'll help you create a comprehensive Q2 marketing strategy. Based on current market trends, I recommend focusing on digital channels with a 60/40 split between content marketing and paid acquisition.",
            hasScreenCapture: false
        },
        {
            userMessage: "Use voice recognition to transcribe my meeting notes",
            aiResponse: "Voice transcription activated. I can hear you clearly and will transcribe your meeting notes in real-time. Should I also identify speakers and create action items?",
            hasScreenCapture: false
        },
        {
            userMessage: "Research trends in AI automation",
            aiResponse: "I've analyzed the latest AI automation trends. Key findings: 73% increase in workflow automation adoption, with RPA and intelligent document processing leading growth areas.",
            hasScreenCapture: false
        },
        {
            userMessage: "Create a task checklist for the new project",
            aiResponse: "I've created a comprehensive project checklist with 12 key milestones. Each task includes estimated completion time, dependencies, and assigned team members. Would you like me to set up automated reminders?",
            hasScreenCapture: true
        },
        {
            userMessage: "Analyze the performance metrics from last quarter",
            aiResponse: "Based on your Q3 data, revenue increased 28% with customer acquisition up 45%. The highest performing channel was organic search at 34% conversion rate. I can create a detailed breakdown if needed.",
            hasScreenCapture: true
        },
        {
            userMessage: "Create a presentation for tomorrow's client meeting",
            aiResponse: "I can see your project files and client data. I'll create a professional presentation highlighting key deliverables, timeline, and ROI projections. Should I include the competitive analysis slides?",
            hasScreenCapture: true
        },
        {
            userMessage: "Schedule team meetings for next week",
            aiResponse: "I've checked everyone's calendars. Tuesday at 2 PM or Wednesday at 10 AM work best for all team members. I can send calendar invites and prepare an agenda based on current project priorities.",
            hasScreenCapture: false
        }
    ];

    const cyclingWordElement = document.getElementById('cyclingWord');
    const searchInput = document.querySelector('.demo-chat-input');
    const conversationView = document.querySelector('.demo-conversation-view');
    const sendButton = document.querySelector('.demo-send-button');

    console.log('Cycling text elements found:', {
        cyclingWord: !!cyclingWordElement,
        searchInput: !!searchInput,
        conversationView: !!conversationView,
        sendButton: !!sendButton
    });

    if (!cyclingWordElement || !searchInput || !conversationView) {
        console.warn('Cycling text elements not found');
        return;
    }

    let currentIndex = 0;
    let isTyping = false;
    let isConversationActive = false;

    // Function to switch demo windows based on the current word
    function switchDemoWindow(currentWord) {
        console.log('🔄 Switching demo window for word:', currentWord);

        const demoListItems = document.querySelectorAll('.demo-list');
        const demoWindows = document.querySelectorAll('.demo-window');
        const voiceButton = document.querySelector('.demo-voice-main-btn');

        // Determine target window based on current word
        let targetWindowId;
        if (currentWord === 'Talk') {
            targetWindowId = 'demo-voice-window';
        } else if (currentWord === 'Task') {
            targetWindowId = 'demo-workflows-window';
        } else {
            targetWindowId = 'demo-chat-window';
        }

        // Check if we're already showing the correct window
        const targetWindow = document.getElementById(targetWindowId);
        if (targetWindow && targetWindow.classList.contains('visible')) {
            console.log(`✅ Already showing ${targetWindowId}, skipping transition`);
            return; // No need to switch
        }

        // Start fade-out transition for currently visible windows
        demoWindows.forEach(win => {
            if (win.classList.contains('visible')) {
                win.classList.add('fade-out');
                win.classList.remove('visible');
            }
        });

        // Remove active class from all items
        demoListItems.forEach(item => item.classList.remove('active'));

        // Wait for fade-out transition to complete before showing new window
        setTimeout(() => {
            // Hide all windows after fade-out
            demoWindows.forEach(win => {
                if (win.classList.contains('fade-out')) {
                    win.style.display = 'none';
                    win.classList.remove('fade-out');
                }
            });

            if (currentWord === 'Talk') {
                // Switch to voice window
                const voiceTab = document.querySelector('.demo-list[data-target="demo-voice-window"]');
                const voiceWindow = document.getElementById('demo-voice-window');

                if (voiceTab && voiceWindow) {
                    voiceTab.classList.add('active');
                    voiceWindow.style.display = 'block';

                    // Small delay to ensure display is set before transition
                    setTimeout(() => {
                        voiceWindow.classList.add('visible');
                    }, 20);

                    // Animate the voice button to show it's "playing"
                    if (voiceButton) {
                        voiceButton.classList.add('recording');
                        console.log('🎤 Voice button activated for Talk mode');
                    }
                }
            } else if (currentWord === 'Task') {
                // Switch to workflows window
                const workflowsTab = document.querySelector('.demo-list[data-target="demo-workflows-window"]');
                const workflowsWindow = document.getElementById('demo-workflows-window');

                if (workflowsTab && workflowsWindow) {
                    workflowsTab.classList.add('active');
                    workflowsWindow.style.display = 'block';

                    // Small delay to ensure display is set before transition
                    setTimeout(() => {
                        workflowsWindow.classList.add('visible');
                    }, 20);

                    // Stop voice button animation if it was active
                    if (voiceButton) {
                        voiceButton.classList.remove('recording');
                    }

                    console.log('📋 Switched to workflows window for Task mode');
                }
            } else {
                // Switch to chat window for all other words
                const chatTab = document.querySelector('.demo-list[data-target="demo-chat-window"]');
                const chatWindow = document.getElementById('demo-chat-window');

                if (chatTab && chatWindow) {
                    chatTab.classList.add('active');
                    chatWindow.style.display = 'flex';

                    // Small delay to ensure display is set before transition
                    setTimeout(() => {
                        chatWindow.classList.add('visible');
                    }, 20);

                    // Stop voice button animation
                    if (voiceButton) {
                        voiceButton.classList.remove('recording');
                        console.log('💬 Switched back to chat mode');
                    }
                }
            }
        }, 200); // Wait for fade-out transition (200ms)
    }

    // Helper function to create demo messages
    function addDemoMessage(text, type, hasScreenCapture = false) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('demo-message', `${type}-message`);

        const textElement = document.createElement('span');
        textElement.classList.add('text-content');
        textElement.textContent = text;
        messageElement.appendChild(textElement);

        if (type === 'user' && hasScreenCapture) {
            const iconElement = document.createElement('span');
            iconElement.classList.add('screen-capture-icon');
            iconElement.title = "Screen capture was attached";
            iconElement.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
            messageElement.appendChild(iconElement);
        }

        // Store current height for smooth animation
        const currentHeight = conversationView.scrollHeight;

        // Add slide-in animation based on message type
        if (type === 'user') {
            messageElement.style.transform = 'translateX(100%)';
            messageElement.style.opacity = '0';
        } else {
            messageElement.style.transform = 'translateX(-100%)';
            messageElement.style.opacity = '0';
        }

        // Temporarily make message invisible to measure new height
        messageElement.style.visibility = 'hidden';
        conversationView.appendChild(messageElement);

        // Get the new height after adding the message
        const newHeight = conversationView.scrollHeight;

        // Make message visible again
        messageElement.style.visibility = 'visible';

        // Animate the height change of the conversation view
        const maxHeight = 300; // Hardcoded from CSS

        if (newHeight > currentHeight && currentHeight < maxHeight) {
            conversationView.style.height = currentHeight + 'px';

            // Use requestAnimationFrame to avoid synchronous reflow
            requestAnimationFrame(() => {
                conversationView.style.height = Math.min(newHeight, maxHeight) + 'px';

                // Reset height after animation completes
                setTimeout(() => {
                    conversationView.style.height = 'auto';
                }, 400);
            });
        } else {
            conversationView.style.height = 'auto';
        }

        conversationView.scrollTop = conversationView.scrollHeight;

        // Trigger slide-in animation
        setTimeout(() => {
            messageElement.style.transition = 'all 0.3s ease';
            messageElement.style.transform = 'translateX(0)';
            messageElement.style.opacity = '1';
        }, 50);

        return messageElement;
    }

    // Helper function to add typing indicator
    function addTypingIndicator() {
        const messageElement = document.createElement('div');
        messageElement.classList.add('demo-message', 'ai-message', 'typing-indicator-msg');

        const typingIndicator = document.createElement('div');
        typingIndicator.classList.add('demo-typing-indicator');

        // Create three animated dots
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.classList.add('demo-typing-dot');
            typingIndicator.appendChild(dot);
        }

        messageElement.appendChild(typingIndicator);

        // Store current height for smooth animation
        const currentHeight = conversationView.scrollHeight;

        // Temporarily make message invisible to measure new height
        messageElement.style.visibility = 'hidden';
        conversationView.appendChild(messageElement);

        // Get the new height after adding the message
        const newHeight = conversationView.scrollHeight;

        // Make message visible again
        messageElement.style.visibility = 'visible';

        // Animate the height change of the conversation view
        const maxHeight = 300;

        if (newHeight > currentHeight && currentHeight < maxHeight) {
            conversationView.style.height = currentHeight + 'px';

            requestAnimationFrame(() => {
                conversationView.style.height = Math.min(newHeight, maxHeight) + 'px';

                setTimeout(() => {
                    conversationView.style.height = 'auto';
                }, 400);
            });
        } else {
            conversationView.style.height = 'auto';
        }

        conversationView.scrollTop = conversationView.scrollHeight;

        return messageElement;
    }

    // Helper function to remove typing indicator with animation
    function removeTypingIndicator(typingMessage) {
        return new Promise((resolve) => {
            const typingIndicator = typingMessage.querySelector('.demo-typing-indicator');
            if (typingIndicator) {
                // Store current height for smooth animation
                const currentHeight = conversationView.scrollHeight;

                typingIndicator.classList.add('disappearing');
                setTimeout(() => {
                    // Temporarily hide message to measure new height
                    typingMessage.style.visibility = 'hidden';
                    const newHeight = conversationView.scrollHeight;
                    typingMessage.remove();

                    // Animate the height change if there's a difference
                    if (newHeight < currentHeight) {
                        conversationView.style.height = currentHeight + 'px';

                        requestAnimationFrame(() => {
                            conversationView.style.height = newHeight + 'px';

                            // Reset height after animation completes
                            setTimeout(() => {
                                conversationView.style.height = 'auto';
                                resolve();
                            }, 400);
                        });
                    } else {
                        resolve();
                    }
                }, 300); // Match the disappearing animation duration
            } else {
                typingMessage.remove();
                resolve();
            }
        });
    }

    function cycleWords() {
        if (isTyping || isConversationActive) return;

        // Smooth fade animation
        const outAnimation = 'cycling-word-fade-out';
        const inAnimation = 'cycling-word-fade-in';

        console.log(`🎬 Using smooth fade animation: ${outAnimation} -> ${inAnimation}`);

        // Clear any existing animation classes
        cyclingWordElement.className = '';

        // Apply the out animation
        cyclingWordElement.classList.add(outAnimation);

        // Smooth animation duration (matches CSS)
        let animationDuration = 400;

        setTimeout(function () {
            // Change the word
            currentIndex = (currentIndex + 1) % words.length;
            cyclingWordElement.textContent = words[currentIndex];

            // Switch to appropriate demo window based on the current word
            switchDemoWindow(words[currentIndex]);

            // Clear out animation and apply in animation
            cyclingWordElement.classList.remove(outAnimation);
            cyclingWordElement.classList.add(inAnimation);

            // Add simple red flash effect when the word appears
            setTimeout(function () {
                cyclingWordElement.classList.add('cycling-word-shimmer');

                // Remove flash effect after animation completes
                setTimeout(function () {
                    cyclingWordElement.classList.remove('cycling-word-shimmer');
                }, 400); // Match the simplified flash animation duration
            }, 50); // Reduced delay for cleaner timing

            // Start typing animation after in animation completes
            setTimeout(function () {
                // Clear in animation class
                cyclingWordElement.classList.remove(inAnimation);
                startConversationFlow(conversations[currentIndex]);
            }, animationDuration + 100);

        }, animationDuration);
    }

    async function startConversationFlow(conversation) {
        if (isTyping || isConversationActive) return;

        isTyping = true;
        isConversationActive = true;
        searchInput.value = '';
        searchInput.placeholder = '';

        // Type the user message
        await typeText(searchInput, conversation.userMessage, 25);

        // Pause briefly
        await new Promise(resolve => setTimeout(resolve, 300));

        // Animate send button
        if (sendButton) {
            sendButton.classList.add('sending');
            setTimeout(() => {
                sendButton.classList.remove('sending');
            }, 600);
        }

        // Add user message to conversation
        console.log('📝 Adding user message:', conversation.userMessage);
        addDemoMessage(conversation.userMessage, 'user', conversation.hasScreenCapture);

        // Clear input
        searchInput.value = '';

        // Show typing indicator
        await new Promise(resolve => setTimeout(resolve, 400));
        const typingIndicator = addTypingIndicator();

        // Wait for AI "thinking" time
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Remove typing indicator with animation
        await removeTypingIndicator(typingIndicator);

        // Add AI response
        console.log('🤖 Adding AI response:', conversation.aiResponse.substring(0, 50) + '...');
        addDemoMessage(conversation.aiResponse, 'ai');

        // Wait before clearing conversation and starting next cycle
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Start smooth transition back to original position
        await startSmoothTransition();

        // Clear conversation after retraction animation
        conversationView.innerHTML = '';

        // Reset height to auto after clearing content
        conversationView.style.height = 'auto';

        // Reset placeholder
        searchInput.placeholder = 'Ask Red to help with anything...';

        // Reset states
        isTyping = false;
        isConversationActive = false;

        // Start next cycle
        setTimeout(cycleWords, 500);
    }

    // Helper function for smooth height transition when chat gets smaller
    async function startSmoothTransition() {
        console.log('🔄 Starting smooth height transition for chat retraction');

        const demoWindowContainer = document.querySelector('.demo-window-container');
        const conversationView = document.querySelector('.demo-conversation-view');

        if (!demoWindowContainer || !conversationView) {
            console.warn('Demo window elements not found for smooth transition');
            return;
        }

        // Store current height for smooth animation
        const currentHeight = conversationView.scrollHeight;

        // Set explicit height to current height to enable smooth transition
        conversationView.style.height = currentHeight + 'px';

        // Force a reflow
        conversationView.offsetHeight;

        // Animate to zero height (or minimal height)
        conversationView.style.height = '0px';

        // Wait for transition to complete
        await new Promise(resolve => setTimeout(resolve, 400));

        // If we were in Talk or Task mode, ensure we switch back to chat window
        const currentWord = words[currentIndex];
        if (currentWord === 'Talk' || currentWord === 'Task') {
            console.log(`🔄 Switching back to chat after ${currentWord} conversation ended`);
            switchDemoWindow('Chat'); // Force switch back to chat
        }
        // Note: No window switching needed for chat-based words as we're already in chat mode

        console.log('✅ Smooth height transition completed');
    }

    // Helper function for typing animation
    async function typeText(element, text, speed = 25) {
        element.value = '';
        let currentText = '';

        for (let i = 0; i < text.length; i++) {
            currentText += text[i];
            element.value = currentText + '|';
            await new Promise(resolve => setTimeout(resolve, Math.random() * speed + 10));
        }

        // Remove cursor
        element.value = currentText;
    }

    // Initialize with the first word and appropriate window
    setTimeout(function () {
        // Set initial window based on first word
        switchDemoWindow(words[0]); // 'Plan' - should show chat window
        startConversationFlow(conversations[0]);
    }, 1000);
}

// Fixed bento animations function - disable custom animations, let AOS handle it
function initBentoAnimationsFixed() {
    console.log('Bento animations: Letting AOS handle card animations, only fixing text visibility issues...');

    // Instead of creating our own animation system, just ensure text elements
    // are properly styled and let AOS handle the main card animations
    const bentoCards = document.querySelectorAll('.bento .social, .bento .manage, .bento .schedule, .bento .media, .bento .follower, .bento .growth, .bento .create, .bento .content');
    console.log('Found bento cards:', bentoCards.length);

    if (bentoCards.length === 0) {
        console.warn('No bento cards found');
        return;
    }

    // Only fix initial text visibility - don't interfere with AOS
    bentoCards.forEach(function (card) {
        const textElements = card.querySelectorAll('p, h1, h3');
        textElements.forEach(function (element) {
            // Remove any conflicting inline styles that might interfere with CSS animations
            element.style.opacity = '';
            element.style.transform = '';
            element.style.transition = '';
        });
    });

    console.log('✅ Bento cards prepared - AOS will handle animations');
}

// animateCard function removed - AOS handles all animations now

// Simple video navigation functionality
function initVideoSwitcher() {
    console.log('Initializing video switcher...');

    const video = document.getElementById('mainDemoVideo');
    const videoSource = document.getElementById('videoSource');
    const prevBtn = document.getElementById('videoPrevBtn');
    const nextBtn = document.getElementById('videoNextBtn');
    const videoDots = document.querySelectorAll('.video-dot');
    const currentTitle = document.getElementById('currentVideoTitle');
    const currentDescription = document.getElementById('currentVideoDescription');

    if (!video || !videoSource || !prevBtn || !nextBtn || !videoDots.length) {
        console.warn('Video switcher elements not found');
        return;
    }

    let currentVideoIndex = 0;

    // Video data array (only 2 videos)
    const videoData = [
        {
            src: 'Screen Recording 2025-08-06 at 11.30.22.mp4',
            title: 'Use RED Anywhere, Anytime',
            description: 'Experience the freedom of RED AI across all your devices and platforms. Whether you\'re at home, in the office, or on the go, RED adapts to your workflow seamlessly.'
        },
        {
            src: 'Screen Recording 2025-08-06 at 11.43.09.mp4',
            title: 'Context-Aware Assistant',
            description: 'RED can see your screen when prompted, enabling deeper understanding of your requests and context. This visual awareness allows RED to provide more intelligent, relevant assistance based on exactly what you\'re working on.'
        }
    ];

    // Update navigation state
    function updateNavigation() {
        // Update button states
        prevBtn.disabled = currentVideoIndex === 0;
        nextBtn.disabled = currentVideoIndex === videoData.length - 1;

        // Update dots
        videoDots.forEach((dot, index) => {
            dot.classList.toggle('active', index === currentVideoIndex);
        });

        // Update video info with smooth animation
        currentTitle.style.opacity = '0';
        currentDescription.style.opacity = '0';

        setTimeout(() => {
            const videoInfo = videoData[currentVideoIndex];
            currentTitle.textContent = videoInfo.title;
            currentDescription.textContent = videoInfo.description;

            currentTitle.style.opacity = '1';
            currentDescription.style.opacity = '1';
        }, 200);
    }

    // Switch to specific video
    function switchToVideo(index) {
        if (index < 0 || index >= videoData.length || index === currentVideoIndex) return;

        currentVideoIndex = index;
        const videoInfo = videoData[currentVideoIndex];

        // Pause current video
        video.pause();

        // Update video source
        videoSource.src = videoInfo.src;
        video.load();

        // Auto-play the new video once it's loaded
        video.addEventListener('loadeddata', function autoPlayHandler() {
            video.play().catch(error => {
                console.log('Autoplay was prevented:', error);
            });
            // Remove the event listener after use to prevent multiple bindings
            video.removeEventListener('loadeddata', autoPlayHandler);
        });

        updateNavigation();

        console.log('Switched to video:', index, videoInfo.title);
    }

    // Event listeners
    prevBtn.addEventListener('click', () => {
        switchToVideo(currentVideoIndex - 1);
    });

    nextBtn.addEventListener('click', () => {
        switchToVideo(currentVideoIndex + 1);
    });

    // Dot navigation
    videoDots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
            switchToVideo(index);
        });
    });

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft') {
            switchToVideo(currentVideoIndex - 1);
        } else if (e.key === 'ArrowRight') {
            switchToVideo(currentVideoIndex + 1);
        }
    });

    // Initialize - Load the first video properly
    const firstVideoInfo = videoData[0];
    videoSource.src = firstVideoInfo.src;
    video.load(); // This ensures the video is properly loaded

    // Set initial video info
    currentTitle.textContent = firstVideoInfo.title;
    currentDescription.textContent = firstVideoInfo.description;

    updateNavigation();

    console.log('Video switcher initialized with', videoData.length, 'videos');
}

console.log('Animation fixes ready');