// Unified Chat Window - All Features Integrated
(function() {
    // ========================================
    // ELEMENT REFERENCES
    // ========================================
    
    const chatInput = document.getElementById('chat-input');
    const captureBtn = document.getElementById('capture-btn');
    const voiceModeBtn = document.getElementById('voice-mode-btn');
    const chatHistoryBtn = document.getElementById('chat-history-btn');
    const chatClearBtn = document.getElementById('chat-clear-btn');
    const sendBtn = document.getElementById('send-btn');
    const sendIcon = document.getElementById('send-icon');
    const voiceAnimation = document.getElementById('voice-animation');
    const conversationView = document.querySelector('.conversation-view');
    const inputCard = document.getElementById('chat-input-area');
    const captureActiveBadge = document.getElementById('capture-active-badge');
    const removeCaptureInline = document.getElementById('remove-capture-inline');
    const navTabs = document.querySelectorAll('.nav-tab');
    
    // State
    let isVoiceActive = false;
    let geminiWebSocket = null;
    let audioContext = null;
    let audioWorkletNode = null;
    let audioStream = null;
    let currentBotMessageElement = null;
    let currentButtonState = 'send';
    let accumulatedBotText = '';
    let pendingVoiceWorkflow = null;
    let speechSynthesis = window.speechSynthesis;
    
    console.log('🚀 Unified Chat Window loaded');
    console.log('📍 Elements found:', {
        chatInput: !!chatInput,
        captureBtn: !!captureBtn,
        voiceModeBtn: !!voiceModeBtn,
        sendBtn: !!sendBtn,
        conversationView: !!conversationView,
        inputCard: !!inputCard
    });

    // ========================================
    // NAVIGATION TAB HANDLING
    // ========================================
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', function() {
            const view = this.dataset.view;
            
            // Update active state
            navTabs.forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            
            // Emit navigation event for external handling
            window.dispatchEvent(new CustomEvent('unified-nav-change', {
                detail: { view }
            }));
            
            console.log('📱 Nav changed to:', view);
        });
    });

    // ========================================
    // SEND BUTTON STATE
    // ========================================
    
    function updateSendButtonAppearance() {
        if (!sendBtn || !chatInput) return;
        
        const hasContent = chatInput.value.trim().length > 0;
        const hasAttachment = (captureActiveBadge && !captureActiveBadge.classList.contains('hidden')) ||
                             (document.getElementById('inline-attachment-indicator') && 
                              !document.getElementById('inline-attachment-indicator').classList.contains('hidden'));
        
        if (hasContent || hasAttachment || isVoiceActive) {
            sendBtn.classList.add('active');
        } else {
            sendBtn.classList.remove('active');
        }
    }

    function showVoiceAnimation() {
        if (sendIcon && voiceAnimation) {
            sendIcon.style.display = 'none';
            voiceAnimation.style.display = 'flex';
        }
    }

    function showSendIcon() {
        if (sendIcon && voiceAnimation) {
            voiceAnimation.style.display = 'none';
            sendIcon.style.display = 'block';
        }
    }

    function updateSendButton() {
        const shouldShowVoice = isVoiceActive && (!chatInput || chatInput.value.trim() === '');
        
        if (shouldShowVoice && currentButtonState !== 'voice') {
            currentButtonState = 'voice';
            showVoiceAnimation();
        } else if (!shouldShowVoice && currentButtonState !== 'send') {
            currentButtonState = 'send';
            showSendIcon();
        }
        
        updateSendButtonAppearance();
    }

    // ========================================
    // SCREEN CAPTURE
    // ========================================
    
    if (captureBtn) {
        captureBtn.addEventListener('click', async function() {
            console.log('📸 Capture button clicked');
            
            try {
                // Toggle capture mode
                const isActive = this.classList.contains('active');
                
                if (isActive) {
                    // Deactivate
                    this.classList.remove('active');
                    if (captureActiveBadge) captureActiveBadge.classList.add('hidden');
                    window.currentCapturedScreenshot = null;
                } else {
                    // Capture screen
                    if (window.electronAPI && window.electronAPI.captureScreenshot) {
                        const result = await window.electronAPI.captureScreenshot('high');
                        if (result && result.base64) {
                            window.currentCapturedScreenshot = result.base64;
                            this.classList.add('active');
                            if (captureActiveBadge) captureActiveBadge.classList.remove('hidden');
                            console.log('✅ Screen captured');
                        }
                    }
                }
                
                updateSendButtonAppearance();
            } catch (error) {
                console.error('❌ Capture error:', error);
            }
        });
    }

    // Remove capture badge
    if (removeCaptureInline) {
        removeCaptureInline.addEventListener('click', function(e) {
            e.stopPropagation();
            if (captureActiveBadge) captureActiveBadge.classList.add('hidden');
            if (captureBtn) captureBtn.classList.remove('active');
            window.currentCapturedScreenshot = null;
            updateSendButtonAppearance();
        });
    }

    // ========================================
    // VOICE MODE (Gemini Live)
    // ========================================
    
    async function startVoiceMode() {
        try {
            console.log('🎤 Starting voice mode...');
            
            const apiKey = await window.electronAPI.invoke('get-env-var', 'GEMINI_API_KEY');
            if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
            
            // Update UI
            if (voiceModeBtn) voiceModeBtn.classList.add('voice-active');
            if (inputCard) inputCard.classList.add('voice-active');
            
            // Add activation message
            addMessage('🎤 Voice mode activated. Start speaking...', false);
            
            // Connect to Gemini
            const model = 'gemini-2.0-flash-exp';
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
            
            geminiWebSocket = new WebSocket(wsUrl);
            
            geminiWebSocket.onopen = () => {
                console.log('✅ Gemini WebSocket connected');
                geminiWebSocket.send(JSON.stringify({
                    setup: {
                        model: `models/${model}`,
                        generation_config: { response_modalities: ["TEXT"] }
                    }
                }));
            };
            
            geminiWebSocket.onmessage = async (event) => {
                try {
                    let data = event.data;
                    if (data instanceof Blob) data = await data.text();
                    const response = JSON.parse(data);
                    
                    if (response.setupComplete) {
                        await startAudioCapture();
                        isVoiceActive = true;
                        updateSendButton();
                    }
                    
                    if (response.serverContent?.userTranscription) {
                        addMessage(response.serverContent.userTranscription, true);
                    }
                    
                    if (response.serverContent?.modelTurn?.parts) {
                        for (const part of response.serverContent.modelTurn.parts) {
                            if (part.text) {
                                if (!currentBotMessageElement) {
                                    accumulatedBotText = '';
                                    currentBotMessageElement = addMessage('', false);
                                }
                                accumulatedBotText += part.text;
                                const textEl = currentBotMessageElement.querySelector('.text-content');
                                if (textEl) textEl.textContent = accumulatedBotText;
                            }
                        }
                    }
                    
                    if (response.serverContent?.turnComplete) {
                        currentBotMessageElement = null;
                        accumulatedBotText = '';
                    }
                } catch (error) {
                    console.error('❌ WebSocket message error:', error);
                }
            };
            
            geminiWebSocket.onerror = () => stopVoiceMode();
            geminiWebSocket.onclose = () => stopVoiceMode();
            
        } catch (error) {
            console.error('❌ Voice mode error:', error);
            addMessage('❌ Voice mode failed: ' + error.message, false);
            stopVoiceMode();
        }
    }
    
    async function startAudioCapture() {
        audioStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 }
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        const source = audioContext.createMediaStreamSource(audioStream);
        const processor = audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (e) => {
            if (isVoiceActive && geminiWebSocket?.readyState === WebSocket.OPEN) {
                const inputData = e.inputBuffer.getChannelData(0);
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
                }
                geminiWebSocket.send(JSON.stringify({
                    realtimeInput: {
                        mediaChunks: [{ mimeType: 'audio/pcm', data: btoa(String.fromCharCode.apply(null, new Uint8Array(pcmData.buffer))) }]
                    }
                }));
            }
        };
        
        source.connect(processor);
        processor.connect(audioContext.destination);
        audioWorkletNode = processor;
    }
    
    function stopVoiceMode() {
        console.log('🛑 Stopping voice mode');
        isVoiceActive = false;
        
        if (audioWorkletNode) { audioWorkletNode.disconnect(); audioWorkletNode = null; }
        if (audioContext) { audioContext.close(); audioContext = null; }
        if (audioStream) { audioStream.getTracks().forEach(t => t.stop()); audioStream = null; }
        if (geminiWebSocket) { geminiWebSocket.close(); geminiWebSocket = null; }
        
        if (voiceModeBtn) voiceModeBtn.classList.remove('voice-active');
        if (inputCard) inputCard.classList.remove('voice-active');
        
        currentBotMessageElement = null;
        accumulatedBotText = '';
        updateSendButton();
    }
    
    if (voiceModeBtn) {
        voiceModeBtn.addEventListener('click', function() {
            if (isVoiceActive) {
                stopVoiceMode();
            } else {
                startVoiceMode();
            }
        });
    }

    // ========================================
    // CHAT HISTORY
    // ========================================
    
    if (chatHistoryBtn) {
        chatHistoryBtn.addEventListener('click', function() {
            console.log('📜 History button clicked');
            // Emit event for external handling
            window.dispatchEvent(new CustomEvent('show-chat-history'));
        });
    }

    // ========================================
    // CLEAR CHAT
    // ========================================
    
    if (chatClearBtn) {
        chatClearBtn.addEventListener('click', function() {
            console.log('🗑️ Clear chat clicked');
            if (conversationView) {
                conversationView.innerHTML = '';
            }
            // Emit event for external handling
            window.dispatchEvent(new CustomEvent('chat-cleared'));
        });
    }

    // ========================================
    // MESSAGE HELPERS
    // ========================================
    
    function addMessage(text, isUser) {
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

    // ========================================
    // INPUT HANDLING
    // ========================================
    
    if (chatInput) {
        // Auto-resize
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
            updateSendButtonAppearance();
        });
        
        // Keyboard shortcuts
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                // Let frontend.html handle the send
                setTimeout(() => {
                    this.style.height = 'auto';
                }, 0);
            }
            
            if (e.key === 'Escape') {
                this.blur();
            }
        });
    }

    // ========================================
    // KEYBOARD SHORTCUTS
    // ========================================
    
    document.addEventListener('keydown', function(e) {
        // Cmd/Ctrl + Shift + S = Capture
        if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 's') {
            e.preventDefault();
            if (captureBtn) captureBtn.click();
        }
        
        // Cmd/Ctrl + M = Voice Mode
        if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
            e.preventDefault();
            if (voiceModeBtn) voiceModeBtn.click();
        }
    });

    // ========================================
    // CLEANUP
    // ========================================
    
    window.addEventListener('beforeunload', () => {
        if (isVoiceActive) stopVoiceMode();
    });

    // Initial state
    updateSendButtonAppearance();
})();
