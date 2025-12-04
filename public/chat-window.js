// Gemini Voice Live Integration with Chat
(function() {
    const chatInput = document.getElementById('chat-input');
    const capturePreview = document.getElementById('capture-preview');
    const capturePreviewContainer = document.querySelector('.capture-preview-container');
    const removeCaptureBtn = document.getElementById('remove-capture');
    const voiceModeBtn = document.getElementById('voice-mode-btn');
    const voiceIndicator = document.getElementById('voice-active-indicator');
    const chatInputArea = document.querySelector('.chat-input-area');
    const chatInputContainer = document.querySelector('.chat-input-container');
    const conversationView = document.querySelector('.conversation-view');
    const sendBtn = document.getElementById('send-btn');
    const sendIcon = document.getElementById('send-icon');
    const voiceAnimation = document.getElementById('voice-animation');
    
    let isVoiceActive = false;
    let geminiWebSocket = null;
    let audioContext = null;
    let audioWorkletNode = null;
    let audioStream = null;
    let currentListeningAnimation = null;
    let currentBotMessageElement = null;
    let currentButtonState = 'send'; // 'send' or 'voice'
    let accumulatedBotText = ''; // Track accumulated bot response text
    let pendingVoiceWorkflow = null; // Store pending workflow for voice confirmation
    let speechSynthesis = window.speechSynthesis; // Text-to-speech for voice responses
    
    console.log('🔍 Chat window voice integration loaded');
    console.log('🔍 Chat window elements found:', {
        chatInput: !!chatInput,
        voiceModeBtn: !!voiceModeBtn,
        voiceIndicator: !!voiceIndicator,
        conversationView: !!conversationView,
        sendBtn: !!sendBtn,
        sendIcon: !!sendIcon,
        voiceAnimation: !!voiceAnimation
    });

    // Toggle send button between send icon and voice animation
    function showVoiceAnimation() {
        if (sendIcon && voiceAnimation) {
            // Fade out send icon
            sendIcon.classList.add('fade-out');
            
            setTimeout(() => {
                sendIcon.style.display = 'none';
                sendIcon.classList.remove('fade-out');
                
                // Fade in voice animation
                voiceAnimation.style.display = 'flex';
                voiceAnimation.classList.remove('fade-out');
                voiceAnimation.classList.add('fade-in');
                
                // Remove fade-in class after animation
                setTimeout(() => {
                    voiceAnimation.classList.remove('fade-in');
                }, 400);
            }, 300);
        }
    }

    function showSendIcon() {
        if (sendIcon && voiceAnimation) {
            // Fade out voice animation
            voiceAnimation.classList.add('fade-out');
            
            setTimeout(() => {
                voiceAnimation.style.display = 'none';
                voiceAnimation.classList.remove('fade-out');
                
                // Fade in send icon
                sendIcon.style.display = 'block';
                sendIcon.classList.remove('fade-out');
                sendIcon.classList.add('fade-in');
                
                // Remove fade-in class after animation
                setTimeout(() => {
                    sendIcon.classList.remove('fade-in');
                }, 300);
            }, 300);
        }
    }

    // Update send button based on voice mode and input state
    function updateSendButton() {
        const shouldShowVoice = isVoiceActive && (!chatInput || chatInput.value.trim() === '');
        
        if (shouldShowVoice && currentButtonState !== 'voice') {
            // Switch to voice animation
            currentButtonState = 'voice';
            showVoiceAnimation();
        } else if (!shouldShowVoice && currentButtonState !== 'send') {
            // Switch to send icon
            currentButtonState = 'send';
            showSendIcon();
        }
        // If already in correct state, do nothing (prevents double animations)
    }

    // Helper function to add message to conversation
    function addVoiceMessage(text, isUser) {
        if (!conversationView) return null;
        
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', isUser ? 'user-message' : 'ai-message');
        
        const textContent = document.createElement('div');
        textContent.classList.add('text-content');
        textContent.textContent = text;
        
        messageEl.appendChild(textContent);
        conversationView.appendChild(messageEl);
        conversationView.scrollTop = conversationView.scrollHeight;
        
        return messageEl;
    }
    
    // Helper function to add voice mode activation logo animation
    function addVoiceModeActivationLogo() {
        if (!conversationView) return null;
        
        const messageEl = document.createElement('div');
        messageEl.classList.add('message', 'ai-message', 'voice-activation-message');
        
        const logoContainer = document.createElement('div');
        logoContainer.classList.add('voice-activation-logo-container');
        
        // Create the spinning circle
        const spinningCircle = document.createElement('div');
        spinningCircle.classList.add('voice-activation-circle');
        
        // Create the logo image
        const logoImg = document.createElement('img');
        logoImg.src = 'icon-64.png';
        logoImg.alt = 'Voice Mode Active';
        logoImg.classList.add('voice-activation-logo');
        
        logoContainer.appendChild(spinningCircle);
        logoContainer.appendChild(logoImg);
        messageEl.appendChild(logoContainer);
        
        conversationView.appendChild(messageEl);
        conversationView.scrollTop = conversationView.scrollHeight;
        
        return messageEl;
    }
    
    // Helper function to add speaking/listening indicator
    function addIndicator(element, isUser) {
        if (!element) return;
        
        const existingIndicator = element.querySelector('.speaking-indicator, .listening-indicator');
        if (existingIndicator) {
            existingIndicator.remove();
        }
        
        const indicator = document.createElement('span');
        indicator.classList.add(isUser ? 'listening-indicator' : 'speaking-indicator');
        
        if (isUser) {
            // Listening indicator (for user)
            for (let i = 0; i < 4; i++) {
                const bar = document.createElement('span');
                bar.classList.add('listening-bar');
                indicator.appendChild(bar);
            }
        } else {
            // Speaking indicator (for bot)
            for (let i = 0; i < 3; i++) {
                const dot = document.createElement('span');
                dot.classList.add('speaking-dot');
                indicator.appendChild(dot);
            }
        }
        
        const textContent = element.querySelector('.text-content');
        if (textContent) {
            textContent.appendChild(indicator);
        }
    }
    
    // Helper function to remove indicator
    function removeIndicator(element) {
        if (!element) return;
        const indicator = element.querySelector('.speaking-indicator, .listening-indicator');
        if (indicator) {
            indicator.remove();
        }
    }
    
    // Helper function to show listening animation (now uses send button)
    function showListeningAnimation() {
        updateSendButton();
    }
    
    // Helper function to remove listening animation (now uses send button)
    function removeListeningAnimation() {
        updateSendButton();
    }
    
    // ============================================
    // VOICE-BASED WORKFLOW CREATION
    // ============================================
    
    // Detect if transcription is a workflow creation request
    function detectWorkflowIntent(text) {
        const patterns = [
            { regex: /create\s+(a\s+)?workflow/i, type: 'explicit' },
            { regex: /make\s+(a\s+)?workflow/i, type: 'explicit' },
            { regex: /set\s+up\s+(a\s+)?(.+)\s+automation/i, type: 'explicit' },
            { regex: /when\s+I\s+say\s+(.+?)\s+(then\s+)?(.+)/i, type: 'keyword_trigger' },
            { regex: /every\s+(day|morning|night|monday|tuesday|wednesday|thursday|friday)/i, type: 'schedule' },
            { regex: /remind\s+me\s+to\s+(.+)\s+at\s+(\d+)/i, type: 'reminder' },
            { regex: /automatically\s+(.+)\s+when/i, type: 'automation' },
            { regex: /automate\s+(.+)/i, type: 'automation' },
            { regex: /schedule\s+(a\s+)?(.+)\s+(every|at|daily)/i, type: 'schedule' }
        ];
        
        for (const pattern of patterns) {
            const match = text.match(pattern.regex);
            if (match) {
                console.log(`🔍 Detected workflow intent: ${pattern.type}`, match);
                return { isWorkflowRequest: true, type: pattern.type, match };
            }
        }
        
        return { isWorkflowRequest: false };
    }
    
    // Speak response using text-to-speech
    function speakResponse(text) {
        if (!speechSynthesis) {
            console.warn('⚠️ Speech synthesis not available');
            return;
        }
        
        // Cancel any ongoing speech
        speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        utterance.volume = 1.0;
        
        // Try to use a natural voice
        const voices = speechSynthesis.getVoices();
        const preferredVoice = voices.find(v => v.lang.startsWith('en') && v.name.includes('Natural')) 
            || voices.find(v => v.lang.startsWith('en'));
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        speechSynthesis.speak(utterance);
        console.log('🔊 Speaking:', text);
    }
    
    // Process voice transcription for workflow detection
    async function processVoiceTranscription(transcribedText) {
        console.log('🎤 Processing voice transcription:', transcribedText);
        
        // First check if this is a confirmation/denial for pending workflow
        if (pendingVoiceWorkflow) {
            handleVoiceConfirmation(transcribedText);
            return true; // Handled as confirmation
        }
        
        // Check if it's a workflow creation request
        const workflowIntent = detectWorkflowIntent(transcribedText);
        
        if (workflowIntent.isWorkflowRequest) {
            console.log('🔧 Voice workflow creation request detected');
            
            // Show that we're generating a workflow
            addVoiceMessage('Creating workflow...', false);
            
            try {
                // Generate workflow from voice command
                const result = await window.electronAPI.generateWorkflowFromText(transcribedText);
                
                if (result.valid && result.workflow) {
                    // Voice confirm before creating
                    const confirmMessage = `I'll create a workflow called "${result.workflow.name}". It will ${result.workflow.description}. Say "yes" to confirm or "no" to cancel.`;
                    speakResponse(confirmMessage);
                    
                    // Store pending workflow for confirmation
                    pendingVoiceWorkflow = result.workflow;
                    
                    // Show visual preview in chat
                    showVoiceWorkflowPreview(result.workflow, transcribedText);
                    
                    return true; // Handled as workflow request
                } else {
                    speakResponse('Sorry, I could not create that workflow. Please try again.');
                    addVoiceMessage(`❌ Could not create workflow: ${result.errors?.join(', ') || 'Unknown error'}`, false);
                }
            } catch (error) {
                console.error('❌ Error generating workflow from voice:', error);
                speakResponse('Sorry, there was an error creating the workflow.');
                addVoiceMessage(`❌ Error: ${error.message}`, false);
            }
            
            return true; // Was a workflow request (even if failed)
        }
        
        return false; // Not a workflow request, process normally
    }
    
    // Handle voice confirmation for pending workflow
    function handleVoiceConfirmation(text) {
        const confirmPatterns = /\b(yes|yeah|yep|sure|do it|create it|confirm|okay|ok|go ahead)\b/i;
        const denyPatterns = /\b(no|nope|cancel|don't|stop|nevermind|forget it)\b/i;
        
        if (confirmPatterns.test(text)) {
            console.log('✅ Voice confirmation: Creating workflow');
            
            // Create the workflow
            createWorkflowFromVoice(pendingVoiceWorkflow);
            speakResponse(`Done! Your workflow "${pendingVoiceWorkflow.name}" is now active.`);
            
            // Clear pending
            pendingVoiceWorkflow = null;
            removeVoiceWorkflowPreview();
            
        } else if (denyPatterns.test(text)) {
            console.log('❌ Voice denial: Cancelling workflow');
            
            speakResponse('Okay, cancelled.');
            addVoiceMessage('❌ Workflow creation cancelled.', false);
            
            // Clear pending
            pendingVoiceWorkflow = null;
            removeVoiceWorkflowPreview();
        } else {
            // Not a clear confirmation/denial, ask again
            speakResponse('Say "yes" to create the workflow, or "no" to cancel.');
        }
    }
    
    // Create workflow from voice confirmation
    async function createWorkflowFromVoice(workflow) {
        try {
            const result = await window.electronAPI.createGeneratedWorkflow(workflow);
            
            if (result.success) {
                console.log('✅ Voice workflow created:', result.workflow);
                
                // Show success message
                if (typeof addNotificationToChat === 'function') {
                    addNotificationToChat(
                        `✅ Workflow "${workflow.name}" Created!`,
                        getWorkflowUsageHint(workflow),
                        'workflow'
                    );
                } else {
                    addVoiceMessage(`✅ Workflow "${workflow.name}" created successfully!`, false);
                }
                
                // Dispatch refresh event for workflow builder
                window.dispatchEvent(new CustomEvent('refresh-workflows'));
            } else {
                addVoiceMessage(`❌ Failed to create workflow: ${result.error}`, false);
            }
        } catch (error) {
            console.error('❌ Error creating workflow:', error);
            addVoiceMessage(`❌ Error: ${error.message}`, false);
        }
    }
    
    // Get usage hint for created workflow
    function getWorkflowUsageHint(workflow) {
        if (workflow.trigger?.type === 'keyword' && workflow.trigger.keywords?.length > 0) {
            return `Say "${workflow.trigger.keywords[0]}" followed by your text to use this workflow`;
        } else if (workflow.trigger?.type === 'schedule') {
            const schedule = workflow.trigger.schedule;
            return `This workflow will run ${schedule.frequency} at ${schedule.time}`;
        }
        return 'Go to Workflows to run it manually';
    }
    
    // Show workflow preview in chat for voice-created workflows
    function showVoiceWorkflowPreview(workflow, originalText) {
        if (!conversationView) return;
        
        // Remove any existing preview
        removeVoiceWorkflowPreview();
        
        const previewEl = document.createElement('div');
        previewEl.className = 'voice-workflow-preview';
        previewEl.id = 'voice-workflow-preview';
        
        previewEl.innerHTML = `
            <div class="voice-workflow-preview-header">
                <span class="preview-icon">⚡</span>
                <span class="preview-title">Create this workflow?</span>
            </div>
            <div class="voice-workflow-preview-content">
                <div class="preview-name">${workflow.name}</div>
                <div class="preview-description">${workflow.description || 'No description'}</div>
                <div class="preview-trigger">
                    <strong>Trigger:</strong> ${formatTriggerDescription(workflow.trigger)}
                </div>
                <div class="preview-actions">
                    <strong>Actions:</strong> ${workflow.actions.map(a => formatActionDescription(a)).join(' → ')}
                </div>
            </div>
            <div class="voice-workflow-preview-hint">
                🎤 Say "yes" to confirm or "no" to cancel
            </div>
        `;
        
        conversationView.appendChild(previewEl);
        conversationView.scrollTop = conversationView.scrollHeight;
    }
    
    // Remove workflow preview
    function removeVoiceWorkflowPreview() {
        const preview = document.getElementById('voice-workflow-preview');
        if (preview) {
            preview.style.opacity = '0';
            preview.style.transform = 'translateY(-10px)';
            setTimeout(() => preview.remove(), 300);
        }
    }
    
    // Format trigger description
    function formatTriggerDescription(trigger) {
        if (!trigger) return 'Manual';
        
        switch (trigger.type) {
            case 'keyword':
                return `Say "${trigger.keywords?.join('" or "')}"`;
            case 'schedule':
                const schedule = trigger.schedule || trigger;
                return `${schedule.frequency || 'daily'} at ${schedule.time || 'scheduled time'}`;
            case 'manual':
            default:
                return 'Manual';
        }
    }
    
    // Format action description
    function formatActionDescription(action) {
        switch (action.type) {
            case 'ai_prompt':
                return '🤖 AI Prompt';
            case 'notification':
                return '🔔 Notify';
            case 'clipboard':
                return `📋 ${action.operation || 'Copy'}`;
            case 'http_request':
                return '🌐 HTTP Request';
            case 'mcp_tool':
                return '🔧 MCP Tool';
            default:
                return action.type;
        }
    }
    
    // ============================================
    // END VOICE-BASED WORKFLOW CREATION
    // ============================================
    
    // Start Gemini Voice Live Session
    async function startVoiceMode() {
        try {
            console.log('🎤 Starting Gemini Voice Live from chat window...');
            
            // Get Gemini API key
            const apiKey = await window.electronAPI.invoke('get-env-var', 'GEMINI_API_KEY');
            
            if (!apiKey) {
                throw new Error('GEMINI_API_KEY not configured');
            }
            
            // Add voice mode activation logo
            addVoiceModeActivationLogo();
            
            // Connect to Gemini Live API via WebSocket
            const model = 'gemini-2.0-flash-exp';
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
            
            geminiWebSocket = new WebSocket(wsUrl);
            
            geminiWebSocket.onopen = () => {
                console.log('✅ Gemini Live WebSocket connected');
                
                // Send setup configuration
                const setup = {
                    setup: {
                        model: `models/${model}`,
                        generation_config: {
                            response_modalities: ["TEXT"]
                        }
                    }
                };
                
                console.log('📤 Sending setup:', JSON.stringify(setup));
                geminiWebSocket.send(JSON.stringify(setup));
            };
            
            geminiWebSocket.onmessage = async (event) => {
                try {
                    let data = event.data;
                    
                    if (data instanceof Blob) {
                        data = await data.text();
                    }
                    
                    const response = JSON.parse(data);
                    console.log('📥 Gemini Live response:', JSON.stringify(response, null, 2));
                    
                    // Log all available keys to understand response structure
                    if (response.serverContent) {
                        console.log('🔍 serverContent keys:', Object.keys(response.serverContent));
                    }
                    
                    // Handle setup complete - start audio capture
                    if (response.setupComplete) {
                        console.log('✅ Setup complete, starting audio capture...');
                        
                        // Start audio capture
                        await startAudioCapture();
                        
                        // Update UI
                        isVoiceActive = true;
                        chatInputArea.classList.add('voice-active');
                        voiceModeBtn.style.background = 'rgba(239, 68, 68, 0.3)';
                        
                        // Show listening animation
                        showListeningAnimation();
                        updateSendButton();
                        return;
                    }
                    
                    // Handle user transcription
                    if (response.serverContent?.userTranscription) {
                        const transcription = response.serverContent.userTranscription;
                        console.log('👤 User said:', transcription);
                        
                        // Remove listening animation and add user message
                        removeListeningAnimation();
                        addVoiceMessage(transcription, true);
                        
                        // Check for workflow creation intent
                        const wasWorkflowRequest = await processVoiceTranscription(transcription);
                        if (wasWorkflowRequest) {
                            console.log('🔧 Handled as workflow request');
                            // Don't let Gemini respond to workflow requests
                            return;
                        }
                    }
                    
                    // Handle bot response
                    if (response.serverContent?.modelTurn?.parts) {
                        const parts = response.serverContent.modelTurn.parts;
                        
                        for (const part of parts) {
                            // Handle text responses (bot speaking)
                            if (part.text) {
                                console.log('🤖 Bot says:', part.text);
                                
                                // Remove listening animation if still showing
                                removeListeningAnimation();
                                
                                // Create message element only once
                                if (!currentBotMessageElement) {
                                    accumulatedBotText = ''; // Reset accumulated text
                                    currentBotMessageElement = addVoiceMessage('', false);
                                    addIndicator(currentBotMessageElement, false);
                                }
                                
                                // Append new text to accumulated text
                                accumulatedBotText += part.text;
                                
                                const textContent = currentBotMessageElement.querySelector('.text-content');
                                if (textContent) {
                                    // Save and remove indicator temporarily
                                    const indicator = textContent.querySelector('.speaking-indicator');
                                    if (indicator) indicator.remove();
                                    
                                    // Update the full text content
                                    textContent.textContent = accumulatedBotText;
                                    
                                    // Re-add indicator at the end
                                    if (indicator) textContent.appendChild(indicator);
                                    
                                    // Scroll to show new content
                                    conversationView.scrollTop = conversationView.scrollHeight;
                                }
                            }
                        }
                    }
                    
                    // Handle turn complete
                    if (response.serverContent?.turnComplete) {
                        console.log('✅ Turn complete');
                        
                        // Remove bot indicator
                        if (currentBotMessageElement) {
                            removeIndicator(currentBotMessageElement);
                            currentBotMessageElement = null;
                            accumulatedBotText = ''; // Reset accumulated text
                        }
                        
                        // Show listening animation for next user turn
                        showListeningAnimation();
                    }
                    
                    // Handle user transcription
                    if (response.serverContent?.interrupted) {
                        console.log('🎙️ User speaking detected');
                    }
                    
                } catch (error) {
                    console.error('❌ Error parsing Gemini response:', error);
                    console.error('❌ Error stack:', error.stack);
                    console.error('❌ Raw event data:', event.data);
                }
            };
            
            geminiWebSocket.onerror = (error) => {
                console.error('❌ Gemini WebSocket error:', error);
                console.error('❌ Error details:', JSON.stringify(error));
                addVoiceMessage('Connection error. Please try again.', false);
                stopVoiceMode();
            };
            
            geminiWebSocket.onclose = (event) => {
                console.log('🔌 Gemini Live WebSocket closed');
                console.log('🔌 Close event:', {
                    code: event.code,
                    reason: event.reason,
                    wasClean: event.wasClean
                });
                if (event.code !== 1000) {
                    console.error('❌ Abnormal closure:', event.code, event.reason);
                }
                stopVoiceMode();
            };
            
        } catch (error) {
            console.error('❌ Error starting voice mode:', error);
            alert('Failed to start voice mode: ' + error.message);
            stopVoiceMode();
        }
    }
    
    // Start audio capture
    async function startAudioCapture() {
        try {
            // Request microphone access
            audioStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000
                }
            });
            
            console.log('✅ Microphone access granted');
            
            // Create AudioContext for PCM processing
            audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });
            
            const source = audioContext.createMediaStreamSource(audioStream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
                if (isVoiceActive && geminiWebSocket && geminiWebSocket.readyState === WebSocket.OPEN) {
                    const inputData = e.inputBuffer.getChannelData(0);
                    
                    // Convert Float32 to Int16 PCM
                    const pcmData = new Int16Array(inputData.length);
                    for (let i = 0; i < inputData.length; i++) {
                        pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                    }
                    
                    // Convert to base64 for sending
                    const base64Audio = btoa(String.fromCharCode.apply(null, new Uint8Array(pcmData.buffer)));
                    
                    // Send audio data to Gemini
                    const message = {
                        realtimeInput: {
                            mediaChunks: [{
                                mimeType: 'audio/pcm',
                                data: base64Audio
                            }]
                        }
                    };
                    
                    geminiWebSocket.send(JSON.stringify(message));
                }
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
            
            audioWorkletNode = processor;
            
        } catch (error) {
            console.error('❌ Error starting audio capture:', error);
            throw error;
        }
    }
    
    // Stop voice mode
    function stopVoiceMode() {
        console.log('🛑 Stopping voice mode...');
        
        isVoiceActive = false;
        accumulatedBotText = ''; // Reset accumulated text
        
        // Clean up listening animation
        removeListeningAnimation();
        
        // Clean up bot message indicator
        if (currentBotMessageElement) {
            removeIndicator(currentBotMessageElement);
            currentBotMessageElement = null;
        }
        
        // Stop audio
        if (audioWorkletNode) {
            audioWorkletNode.disconnect();
            audioWorkletNode = null;
        }
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        
        if (audioStream) {
            audioStream.getTracks().forEach(track => track.stop());
            audioStream = null;
        }
        
        // Close WebSocket
        if (geminiWebSocket) {
            geminiWebSocket.close();
            geminiWebSocket = null;
        }
        
        // Update UI
        chatInputArea.classList.remove('voice-active');
        voiceModeBtn.style.background = '';
        
        // Update send button to show send icon
        updateSendButton();
        
        console.log('✅ Voice mode stopped');
    }

    // Listen for input changes to toggle send button
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            updateSendButton();
        });
    }

    // Voice mode button - toggle voice mode
    if (voiceModeBtn) {
        console.log('✅ Chat window voice button listener attached');
        voiceModeBtn.addEventListener('click', function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🎤 Chat window voice button clicked!');
            
            if (isVoiceActive) {
                console.log('🛑 Stopping voice mode from chat window');
                stopVoiceMode();
            } else {
                console.log('▶️ Starting voice mode from chat window');
                startVoiceMode();
            }
        });
    } else {
        console.log('❌ Chat window voice button not found!');
    }

    // Auto-resize textarea
    if (chatInput) {
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Reset height on Enter key (when message is sent)
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                setTimeout(() => {
                    this.style.height = 'auto';
                    this.rows = 1;
                }, 0);
            }
        });
    }

    // Remove capture preview
    if (removeCaptureBtn && capturePreviewContainer) {
        removeCaptureBtn.addEventListener('click', function() {
            capturePreviewContainer.style.display = 'none';
            if (capturePreview) {
                capturePreview.src = '';
            }
        });
    }

    // ========================================
    // MINIMAL INTERFACE - Quick Actions
    // ========================================
    
    const quickActions = document.getElementById('quick-actions');
    
    // Show quick actions on "/" key or when input is focused with empty content
    if (chatInput && quickActions) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === '/' && this.value === '') {
                e.preventDefault();
                quickActions.classList.toggle('hidden');
            } else if (e.key === 'Escape') {
                quickActions.classList.add('hidden');
            }
        });
        
        // Hide quick actions when typing
        chatInput.addEventListener('input', function() {
            if (this.value.length > 0) {
                quickActions.classList.add('hidden');
            }
        });
    }
    
    // Update send button appearance based on input
    function updateSendButtonAppearance() {
        if (!sendBtn || !chatInput) return;
        
        const hasContent = chatInput.value.trim().length > 0;
        const hasAttachment = document.getElementById('inline-attachment-indicator') && 
                             !document.getElementById('inline-attachment-indicator').classList.contains('hidden');
        
        if (hasContent || hasAttachment) {
            sendBtn.classList.add('active');
        } else {
            sendBtn.classList.remove('active');
        }
    }
    
    if (chatInput) {
        chatInput.addEventListener('input', updateSendButtonAppearance);
    }
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (isVoiceActive) {
            stopVoiceMode();
        }
    });
})();

