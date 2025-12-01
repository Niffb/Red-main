// Transcription Window - Deepgram Real-time Integration
console.log('🎙️ Transcription window loaded (Deepgram)');
    
    // State
    let isRecording = false;
let audioContext = null;
let mediaStream = null;
let processor = null;
let startTime = null;
let timerInterval = null;
let transcriptBuffer = [];
let fullTranscript = '';
let wordCount = 0;

    // DOM Elements
const elements = {
    stepReady: document.getElementById('step-ready'),
    stepRecording: document.getElementById('step-recording'),
    stepOptions: document.getElementById('step-options'),
    stepGoal: document.getElementById('step-goal'),
    stepWorkflow: document.getElementById('step-workflow'),
    startBtn: document.getElementById('start-recording-btn'),
    stopBtn: document.getElementById('stop-recording-btn'),
    timer: document.getElementById('timer'),
    transcriptText: document.getElementById('transcript-text'),
    wordCountEl: document.getElementById('word-count'),
    confidenceText: document.getElementById('confidence-text'),
    goalInput: document.getElementById('goal-input'),
    generateWorkflowBtn: document.getElementById('generate-workflow-btn'),
    backToRecordBtn: document.getElementById('back-to-record-btn'),
    newTranscriptionBtn: document.getElementById('new-transcription-btn'),
    saveWorkflowBtn: document.getElementById('save-workflow-btn'),
    summaryText: document.getElementById('summary-text'),
    finalWordCount: document.getElementById('final-word-count'),
    viewFullTranscriptBtn: document.getElementById('view-full-transcript-btn'),
    transcriptModal: document.getElementById('transcript-modal'),
    fullTranscriptText: document.getElementById('full-transcript-text'),
    closeTranscriptModal: document.getElementById('close-transcript-modal'),
    closeTranscriptBtn: document.getElementById('close-transcript-btn'),
    copyTranscriptBtn: document.getElementById('copy-transcript-btn'),
    workflowContainer: document.getElementById('workflow-container'),
    // Post-transcription options elements
    optionsPreviewText: document.getElementById('options-preview-text'),
    optionsWordCount: document.getElementById('options-word-count'),
    attachToChatBtn: document.getElementById('attach-to-chat-btn'),
    createWorkflowBtn: document.getElementById('create-workflow-btn'),
    dismissOptionsBtn: document.getElementById('dismiss-options-btn')
};

    // Initialize
    function init() {
    setupEventListeners();
    setupTranscriptionListeners();
}

// Setup Event Listeners
function setupEventListeners() {
    elements.startBtn.addEventListener('click', startRecording);
    elements.stopBtn.addEventListener('click', stopRecording);
    elements.generateWorkflowBtn.addEventListener('click', generateWorkflow);
    elements.backToRecordBtn.addEventListener('click', resetToStart);
    elements.newTranscriptionBtn.addEventListener('click', resetToStart);
    elements.viewFullTranscriptBtn.addEventListener('click', () => showModal(elements.transcriptModal));
    elements.closeTranscriptModal.addEventListener('click', () => hideModal(elements.transcriptModal));
    elements.closeTranscriptBtn.addEventListener('click', () => hideModal(elements.transcriptModal));
    elements.copyTranscriptBtn.addEventListener('click', copyTranscriptToClipboard);
    
    // Post-transcription options event listeners
    if (elements.attachToChatBtn) {
        elements.attachToChatBtn.addEventListener('click', attachTranscriptionToChat);
    }
    if (elements.createWorkflowBtn) {
        elements.createWorkflowBtn.addEventListener('click', () => showGoalStep());
    }
    if (elements.dismissOptionsBtn) {
        elements.dismissOptionsBtn.addEventListener('click', resetToStart);
    }
}

// Setup Transcription Event Listeners
function setupTranscriptionListeners() {
    // Listen for transcription results
    window.electronAPI.onTranscriptionResult((data) => {
        console.log('📝 Transcription result:', data);
        updateTranscript(data);
    });

    // Listen for errors
    window.electronAPI.onTranscriptionError((error) => {
        console.error('❌ Transcription error:', error);
        alert(`Transcription error: ${error.message}`);
                stopRecording();
            });
        }
        
// Start Recording
async function startRecording() {
    try {
        console.log('🎙️ Starting recording...');
        elements.startBtn.disabled = true;

        // Request microphone access
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                sampleRate: 16000,
                channelCount: 1
            }
        });

        // Create audio context
        audioContext = new (window.AudioContext || window.webkitAudioContext)({
            sampleRate: 16000
        });

        const source = audioContext.createMediaStreamSource(mediaStream);
        
        // Create script processor for audio data
        const bufferSize = 4096;
        processor = audioContext.createScriptProcessor(bufferSize, 1, 1);

        processor.onaudioprocess = (e) => {
            if (!isRecording) return;

            const inputData = e.inputBuffer.getChannelData(0);
            
            // Convert Float32 to Int16 PCM
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Send to Deepgram via IPC
            window.electronAPI.transcriptionSendAudio(Array.from(pcmData))
                .catch(err => console.error('Error sending audio:', err));
        };

        source.connect(processor);
        processor.connect(audioContext.destination);

        // Start Deepgram transcription
        const result = await window.electronAPI.transcriptionStart();
            
        if (!result.success) {
            throw new Error(result.error || 'Failed to start transcription');
        }
            
            // Update UI
            isRecording = true;
        transcriptBuffer = [];
        fullTranscript = '';
        wordCount = 0;
        startTime = Date.now();
        
        showStep('recording');
        startTimer();
        clearTranscript();
            
            console.log('✅ Recording started successfully');
            
        } catch (error) {
        console.error('❌ Failed to start recording:', error);
        alert(`Failed to start recording: ${error.message}\n\nPlease check microphone permissions.`);
        cleanupAudio();
        elements.startBtn.disabled = false;
        }
    }

    // Stop Recording
    async function stopRecording() {
    try {
        console.log('🛑 Stopping recording...');
        isRecording = false;
        stopTimer();

        // Stop Deepgram
        const result = await window.electronAPI.transcriptionStop();
        
        if (result.success) {
            fullTranscript = result.transcript || transcriptBuffer.join(' ');
            wordCount = result.wordCount || countWords(fullTranscript);
            console.log(`✅ Recording stopped. ${wordCount} words transcribed.`);
        }

        // Cleanup audio
        cleanupAudio();

        // Show post-transcription options step
        if (fullTranscript && fullTranscript.trim().length > 0) {
            showOptionsStep();
            } else {
            alert('No audio was transcribed. Please try again.');
            resetToStart();
            }
            
        } catch (error) {
            console.error('❌ Error stopping recording:', error);
        cleanupAudio();
        resetToStart();
        }
    }

// Cleanup Audio Resources
function cleanupAudio() {
    if (processor) {
        processor.disconnect();
        processor = null;
    }
    
    if (mediaStream) {
        mediaStream.getTracks().forEach(track => track.stop());
        mediaStream = null;
    }
    
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
        audioContext = null;
    }

    elements.startBtn.disabled = false;
}

// Update Transcript Display
function updateTranscript(data) {
    const { text, isFinal, confidence } = data;

    // Update confidence indicator
    if (confidence) {
        const confidencePercent = Math.round(confidence * 100);
        elements.confidenceText.textContent = `${confidencePercent}%`;
    }

    // Hide placeholder
    const placeholder = elements.transcriptText.parentElement.querySelector('.transcript-placeholder');
    if (placeholder) {
        placeholder.style.display = 'none';
    }
        
        if (isFinal) {
        // Add to buffer and display
        transcriptBuffer.push(text);
        
        const line = document.createElement('div');
        line.className = 'transcript-line final';
        line.textContent = text;
        elements.transcriptText.appendChild(line);

        // Update word count
        wordCount = countWords(transcriptBuffer.join(' '));
        elements.wordCountEl.textContent = `${wordCount} words`;

        // Remove any interim text
        const interimEl = elements.transcriptText.querySelector('.interim');
        if (interimEl) {
            interimEl.remove();
        }
        } else {
        // Show interim text
        let interimEl = elements.transcriptText.querySelector('.interim');
        if (!interimEl) {
            interimEl = document.createElement('div');
            interimEl.className = 'transcript-line interim';
            elements.transcriptText.appendChild(interimEl);
        }
        interimEl.textContent = text;
    }

    // Auto-scroll
    elements.transcriptText.parentElement.scrollTop = elements.transcriptText.parentElement.scrollHeight;
    }

    // Clear Transcript
    function clearTranscript() {
    elements.transcriptText.innerHTML = '';
    const placeholder = elements.transcriptText.parentElement.querySelector('.transcript-placeholder');
    if (placeholder) {
        placeholder.style.display = 'flex';
    }
    elements.wordCountEl.textContent = '0 words';
}

// Timer Functions
function startTimer() {
    timerInterval = setInterval(updateTimer, 1000);
    updateTimer();
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
        }
    }

function updateTimer() {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const minutes = Math.floor(elapsed / 60);
    const seconds = elapsed % 60;
    elements.timer.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }

// Show Options Step (Post-Transcription)
function showOptionsStep() {
    // Populate preview
    const preview = fullTranscript.length > 200 
        ? fullTranscript.substring(0, 200) + '...' 
        : fullTranscript;
    
    if (elements.optionsPreviewText) {
        elements.optionsPreviewText.textContent = preview;
    }
    if (elements.optionsWordCount) {
        elements.optionsWordCount.textContent = `${wordCount} words`;
    }
    
    // Store transcription globally for other features to access
    window.completedTranscription = fullTranscript;
    window.completedTranscriptionWordCount = wordCount;
    
    showStep('options');
}

// Attach Transcription to Chat
function attachTranscriptionToChat() {
    console.log('📎 Attaching transcription to chat...');
    
    // Create the attachment object
    const attachment = {
        type: 'transcription',
        content: fullTranscript,
        wordCount: wordCount,
        timestamp: new Date().toISOString(),
        preview: fullTranscript.length > 100 
            ? fullTranscript.substring(0, 100) + '...' 
            : fullTranscript
    };
    
    // Store in window for chat to access
    window.chatAttachment = attachment;
    
    // Dispatch custom event to notify chat
    window.dispatchEvent(new CustomEvent('transcription-attached', { 
        detail: attachment 
    }));
    
    console.log('✅ Transcription attached:', attachment);
    
    // Switch to chat window
    const chatNavItem = document.querySelector('.nav-item[data-target="chat-window"]');
    if (chatNavItem) {
        chatNavItem.click();
        console.log('🔀 Switched to chat window');
    } else {
        console.error('❌ Chat nav item not found');
        alert('Transcription attached! Switch to Chat to use it.');
    }
    
    // Reset transcription for new recording
    resetToStart();
}

// Show Goal Step
function showGoalStep() {
    // Populate summary
    const summary = fullTranscript.length > 300 
        ? fullTranscript.substring(0, 300) + '...' 
        : fullTranscript;
    
    elements.summaryText.textContent = summary;
    elements.finalWordCount.textContent = `${wordCount} words transcribed`;
    elements.fullTranscriptText.textContent = fullTranscript;
    
    showStep('goal');
}

// Generate Workflow
let generatedWorkflow = null; // Store generated workflow for saving

async function generateWorkflow() {
    const goal = elements.goalInput.value.trim();
    
    if (!goal) {
        alert('Please enter your goal to generate a workflow.');
        return;
    }

    try {
        elements.generateWorkflowBtn.disabled = true;
        elements.generateWorkflowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating...';
        
        showStep('workflow');
        
        // Show loading animation
        showLoadingAnimation();
        
        // Use the new transcription-to-workflow API
        const result = await window.electronAPI.generateWorkflowFromTranscription(fullTranscript, goal);
        
        console.log('🔧 Workflow generation result:', result);
        
        if (result.valid && result.workflow) {
            generatedWorkflow = result.workflow;
            displayGeneratedWorkflow(result.workflow, result.usageHint);
        } else {
            const errorMsg = result.errors?.join(', ') || 'Failed to generate workflow';
            throw new Error(errorMsg);
        }
            
    } catch (error) {
        console.error('❌ Error generating workflow:', error);
        showWorkflowError(error.message);
    } finally {
        elements.generateWorkflowBtn.disabled = false;
        elements.generateWorkflowBtn.innerHTML = '<i class="fas fa-magic"></i><span>Generate Workflow</span>';
    }
}

// Display generated workflow with editable preview
function displayGeneratedWorkflow(workflow, usageHint) {
    elements.workflowContainer.style.opacity = '0';
    
    setTimeout(() => {
        const triggerDescription = formatTriggerDescription(workflow.trigger);
        const actionsHtml = workflow.actions.map((action, index) => 
            formatActionHtml(action, index)
        ).join('');
        
        elements.workflowContainer.innerHTML = `
            <div class="workflow-result generated">
                <div class="workflow-header">
                    <div class="workflow-icon-badge">⚡</div>
                    <div class="workflow-header-text">
                        <h3>${workflow.name}</h3>
                        <p>${workflow.description || 'AI-generated workflow'}</p>
                    </div>
                </div>
                
                ${workflow.transcriptionContext ? `
                    <div class="transcription-context">
                        <i class="fas fa-file-alt"></i>
                        <span>${workflow.transcriptionContext}</span>
                    </div>
                ` : ''}
                
                <div class="workflow-trigger-info">
                    <strong>Trigger:</strong> ${triggerDescription}
                </div>
                
                <div class="workflow-actions-list">
                    <h4>Actions</h4>
                    ${actionsHtml}
                </div>
                
                ${usageHint ? `
                    <div class="workflow-usage-hint">
                        <i class="fas fa-lightbulb"></i>
                        ${usageHint}
                    </div>
                ` : ''}
            </div>
        `;
        
        // Update save button to actually save
        if (elements.saveWorkflowBtn) {
            elements.saveWorkflowBtn.onclick = saveGeneratedWorkflow;
        }
        
        elements.workflowContainer.style.opacity = '1';
    }, 300);
}

// Format trigger description
function formatTriggerDescription(trigger) {
    if (!trigger) return 'Manual';
    
    switch (trigger.type) {
        case 'keyword':
            const keywords = trigger.keywords?.join('", "') || '';
            return `When you say "<strong>${keywords}</strong>"`;
        case 'schedule':
            const schedule = trigger.schedule || trigger;
            return `${schedule.frequency || 'Daily'} at <strong>${schedule.time || '09:00'}</strong>`;
        case 'manual':
        default:
            return 'Click to run manually';
    }
}

// Format action HTML
function formatActionHtml(action, index) {
    let icon = '⚙️';
    let description = '';
    
    switch (action.type) {
        case 'ai_prompt':
            icon = '🤖';
            const promptPreview = action.prompt?.length > 80 
                ? action.prompt.substring(0, 80) + '...' 
                : action.prompt;
            description = `AI Process: ${promptPreview}`;
            break;
        case 'notification':
            icon = '🔔';
            description = `Notify: "${action.title || 'Notification'}"`;
            break;
        case 'clipboard':
            icon = '📋';
            description = `Clipboard: ${action.operation || 'copy'}`;
            break;
        case 'http_request':
            icon = '🌐';
            description = `HTTP ${action.method || 'GET'}: ${action.url || 'API call'}`;
            break;
        default:
            description = action.type;
    }
    
    return `
        <div class="workflow-action-item">
            <span class="action-number">${index + 1}</span>
            <span class="action-icon">${icon}</span>
            <span class="action-description">${description}</span>
        </div>
    `;
}

// Show workflow error
function showWorkflowError(message) {
    elements.workflowContainer.innerHTML = `
        <div class="workflow-error">
            <div class="error-icon">❌</div>
            <h3>Failed to Generate Workflow</h3>
            <p>${message}</p>
            <button class="secondary-btn" onclick="showStep('goal')">
                <i class="fas fa-arrow-left"></i>
                Try Again
            </button>
        </div>
    `;
}

// Save the generated workflow
async function saveGeneratedWorkflow() {
    if (!generatedWorkflow) {
        alert('No workflow to save');
        return;
    }
    
    try {
        elements.saveWorkflowBtn.disabled = true;
        elements.saveWorkflowBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
        
        const result = await window.electronAPI.createGeneratedWorkflow(generatedWorkflow);
        
        if (result.success) {
            console.log('✅ Workflow saved:', result.workflow);
            
            // Show success message
            elements.workflowContainer.innerHTML = `
                <div class="workflow-success">
                    <div class="success-icon">✅</div>
                    <h3>Workflow Saved!</h3>
                    <p>"${generatedWorkflow.name}" has been added to your workflows.</p>
                    ${result.usageHint ? `<p class="usage-hint">${result.usageHint}</p>` : ''}
                    <div class="success-buttons">
                        <button class="secondary-btn" onclick="resetToStart()">
                            <i class="fas fa-microphone"></i>
                            New Transcription
                        </button>
                        <button class="primary-btn" onclick="goToWorkflows()">
                            <i class="fas fa-sitemap"></i>
                            View Workflows
                        </button>
                    </div>
                </div>
            `;
            
            // Dispatch event to refresh workflow list
            window.dispatchEvent(new CustomEvent('refresh-workflows'));
            
        } else {
            throw new Error(result.error || 'Failed to save workflow');
        }
        
    } catch (error) {
        console.error('❌ Error saving workflow:', error);
        alert(`Failed to save workflow: ${error.message}`);
    } finally {
        elements.saveWorkflowBtn.disabled = false;
        elements.saveWorkflowBtn.innerHTML = '<i class="fas fa-save"></i> Save Workflow';
    }
}

// Navigate to workflows window
function goToWorkflows() {
    const workflowsNavItem = document.querySelector('.nav-item[data-target="workflows-window"]');
    if (workflowsNavItem) {
        workflowsNavItem.click();
    }
}

// Show Loading Animation
function showLoadingAnimation() {
    elements.workflowContainer.innerHTML = `
        <div class="loading-spinner">
            <div class="loading-spinner-icon">
                <div class="spinner-ring"></div>
                <div class="spinner-ring"></div>
                <div class="spinner-ring"></div>
            </div>
            <h3>Generating Workflow</h3>
            <p>Analyzing your transcript and creating actionable steps</p>
            <div class="loading-dots">
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
                <div class="loading-dot"></div>
            </div>
        </div>
    `;
    }

    // Display Workflow
    function displayWorkflow(workflow) {
    // Fade out loading animation
    elements.workflowContainer.style.opacity = '0';
    
    setTimeout(() => {
        elements.workflowContainer.innerHTML = '';
        
        const workflowHTML = `
            <div class="workflow-result">
                <div class="workflow-header">
                    <h3>${workflow.title || 'Your Workflow'}</h3>
                    <p>${workflow.description || ''}</p>
                </div>
                
                <div class="workflow-steps">
                    ${workflow.steps.map((step, index) => `
            <div class="workflow-step">
                            <div class="step-number">${index + 1}</div>
                            <div class="step-content-inner">
                                <h4>${step.title || step.action}</h4>
                                ${step.description ? `<p>${step.description}</p>` : ''}
                                ${step.details ? `<ul>${step.details.map(d => `<li>${d}</li>`).join('')}</ul>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                
                ${workflow.notes ? `
                    <div class="workflow-notes">
                        <strong>Notes:</strong> ${workflow.notes}
                    </div>
                ` : ''}
            </div>
        `;
        
        elements.workflowContainer.innerHTML = workflowHTML;
        
        // Fade in workflow result
        setTimeout(() => {
            elements.workflowContainer.style.opacity = '1';
        }, 50);
    }, 300);
    }

// Navigation Functions
function showStep(step) {
    elements.stepReady.classList.add('hidden');
    elements.stepRecording.classList.add('hidden');
    if (elements.stepOptions) elements.stepOptions.classList.add('hidden');
    elements.stepGoal.classList.add('hidden');
    elements.stepWorkflow.classList.add('hidden');
    
    switch(step) {
        case 'ready':
            elements.stepReady.classList.remove('hidden');
            break;
        case 'recording':
            elements.stepRecording.classList.remove('hidden');
            break;
        case 'options':
            if (elements.stepOptions) elements.stepOptions.classList.remove('hidden');
            break;
        case 'goal':
            elements.stepGoal.classList.remove('hidden');
            break;
        case 'workflow':
            elements.stepWorkflow.classList.remove('hidden');
            break;
    }
}

function resetToStart() {
    // Cleanup
    if (isRecording) {
        stopRecording();
    }
    
    transcriptBuffer = [];
    fullTranscript = '';
    wordCount = 0;
    elements.goalInput.value = '';
    
    showStep('ready');
    }

// Modal Functions
function showModal(modal) {
    modal.classList.remove('hidden');
}

function hideModal(modal) {
    modal.classList.add('hidden');
}

function copyTranscriptToClipboard() {
    navigator.clipboard.writeText(fullTranscript).then(() => {
        elements.copyTranscriptBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
        setTimeout(() => {
            elements.copyTranscriptBtn.innerHTML = '<i class="fas fa-copy"></i> Copy to Clipboard';
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert('Failed to copy transcript');
    });
    }

// Utility Functions
function countWords(text) {
    return text.trim().split(/\s+/).filter(w => w.length > 0).length;
}

// Initialize on load
init();

console.log('✅ Transcription window ready');
