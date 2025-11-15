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
                                
                                if (!currentBotMessageElement) {
                                    currentBotMessageElement = addVoiceMessage('', false);
                                    addIndicator(currentBotMessageElement, false);
                                }
                                
                                const textContent = currentBotMessageElement.querySelector('.text-content');
                                if (textContent) {
                                    // Remove indicator temporarily
                                    const indicator = textContent.querySelector('.speaking-indicator');
                                    if (indicator) indicator.remove();
                                    
                                    textContent.textContent = part.text;
                                    
                                    // Re-add indicator if still speaking
                                    addIndicator(currentBotMessageElement, false);
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
    
    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        if (isVoiceActive) {
            stopVoiceMode();
        }
    });
})();

