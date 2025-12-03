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
let recordingDuration = 0;
let currentTranscriptionId = null;

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
    loadTranscriptionHistory();
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
            // Check if rate limited
            if (result.rateLimited) {
                cleanupAudio();
                elements.startBtn.disabled = false;
                alert(`⚠️ ${result.error || 'Transcription limit reached. Please upgrade your plan for more transcription time.'}`);
                return;
            }
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
        
        // Calculate recording duration
        recordingDuration = startTime ? Math.floor((Date.now() - startTime) / 1000) : 0;

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
async function showOptionsStep() {
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
    
    // Auto-save transcription
    await saveTranscription();
    
    showStep('options');
}

// Save transcription to storage
async function saveTranscription() {
    // Don't save if viewing an existing transcription
    if (currentTranscriptionId) {
        console.log('Viewing existing transcription, skipping save');
        return;
    }
    
    if (!fullTranscript || fullTranscript.trim().length === 0) {
        console.log('No transcript to save');
        return;
    }
    
    try {
        const transcriptionData = {
            text: fullTranscript,
            wordCount: wordCount,
            duration: recordingDuration,
            timestamp: new Date().toISOString(),
            preview: fullTranscript.length > 100 
                ? fullTranscript.substring(0, 100) + '...' 
                : fullTranscript
        };
        
        const result = await window.electronAPI.transcriptionSave(transcriptionData);
        
        if (result.success) {
            currentTranscriptionId = result.transcription?.id || result.transcription?._id;
            console.log('✅ Transcription saved:', currentTranscriptionId);
            loadTranscriptionHistory();
        } else {
            console.warn('Failed to save transcription:', result.error);
        }
    } catch (error) {
        console.error('Error saving transcription:', error);
    }
}

// Load transcription history
async function loadTranscriptionHistory() {
    const historyContainer = document.getElementById('transcription-history');
    if (!historyContainer) return;
    
    try {
        const result = await window.electronAPI.transcriptionGetAll();
        
        if (result.success && result.transcriptions?.length > 0) {
            historyContainer.innerHTML = result.transcriptions.map(t => {
                const id = t.id || t._id;
                const preview = t.preview || (t.text ? t.text.substring(0, 80) + '...' : 'No content');
                return `
                    <div class="history-item" data-id="${id}">
                        <div class="history-item-content">
                            <div class="history-item-preview">${preview}</div>
                            <div class="history-item-meta">
                                <span>${t.wordCount || 0} words</span>
                                <span class="meta-dot">·</span>
                                <span>${formatDate(t.timestamp || t.createdAt)}</span>
                            </div>
                        </div>
                        <button class="history-item-delete" title="Delete">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                `;
            }).join('');
            
            // Store transcriptions for viewing
            historyContainer._transcriptions = result.transcriptions;
            
            // Add click handlers
            historyContainer.querySelectorAll('.history-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    if (!e.target.closest('.history-item-delete')) {
                        viewTranscription(item.dataset.id, historyContainer._transcriptions);
                    }
                });
                
                item.querySelector('.history-item-delete').addEventListener('click', (e) => {
                    e.stopPropagation();
                    deleteTranscription(item.dataset.id);
                });
            });
            
            historyContainer.parentElement?.classList.remove('empty');
        } else {
            historyContainer.innerHTML = `
                <div class="history-empty">
                    <p>No transcriptions yet</p>
                </div>
            `;
            historyContainer.parentElement?.classList.add('empty');
        }
    } catch (error) {
        console.error('Error loading history:', error);
        historyContainer.innerHTML = `
            <div class="history-empty">
                <p>Unable to load history</p>
            </div>
        `;
    }
}

// View a saved transcription - load it into the options step
function viewTranscription(id, transcriptions) {
    const transcription = transcriptions.find(t => (t.id || t._id) === id);
    if (!transcription) {
        console.error('Transcription not found:', id);
        return;
    }
    
    // Load this transcription as the current one
    fullTranscript = transcription.text || '';
    wordCount = transcription.wordCount || countWords(fullTranscript);
    currentTranscriptionId = id;
    
    // Store for other features
    window.completedTranscription = fullTranscript;
    window.completedTranscriptionWordCount = wordCount;
    
    // Update and show options step
    const preview = fullTranscript.length > 200 
        ? fullTranscript.substring(0, 200) + '...' 
        : fullTranscript;
    
    if (elements.optionsPreviewText) {
        elements.optionsPreviewText.textContent = preview;
    }
    if (elements.optionsWordCount) {
        elements.optionsWordCount.textContent = `${wordCount} words`;
    }
    
    // Also update the full transcript modal content
    elements.fullTranscriptText.textContent = fullTranscript;
    
    showStep('options');
}

// Delete a transcription
async function deleteTranscription(id) {
    try {
        const result = await window.electronAPI.transcriptionDelete(id);
        if (result.success) {
            console.log('✅ Transcription deleted');
            loadTranscriptionHistory();
        } else {
            console.error('Failed to delete:', result.error);
        }
    } catch (error) {
        console.error('Error deleting transcription:', error);
    }
}

// Format date helper
function formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
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
    // Populate summary (shorter for compact view)
    const summary = fullTranscript.length > 100 
        ? fullTranscript.substring(0, 100) + '...' 
        : fullTranscript;
    
    elements.summaryText.textContent = summary;
    elements.finalWordCount.textContent = `${wordCount} words`;
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
        elements.generateWorkflowBtn.textContent = 'Generating...';
        
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
        elements.generateWorkflowBtn.textContent = 'Generate Workflow';
    }
}

// Display generated workflow with compact preview
function displayGeneratedWorkflow(workflow, usageHint) {
    elements.workflowContainer.style.opacity = '0';
    
    setTimeout(() => {
        const actionsHtml = workflow.actions.slice(0, 3).map((action, index) => 
            formatActionHtmlCompact(action, index)
        ).join('');
        
        const moreActions = workflow.actions.length > 3 
            ? `<div class="more-actions">+${workflow.actions.length - 3} more</div>` 
            : '';
        
        elements.workflowContainer.innerHTML = `
            <div class="workflow-result-compact">
                <div class="workflow-name">${workflow.name}</div>
                <div class="workflow-actions-compact">
                    ${actionsHtml}
                    ${moreActions}
                </div>
            </div>
        `;
        
        // Update save button to actually save
        if (elements.saveWorkflowBtn) {
            elements.saveWorkflowBtn.onclick = saveGeneratedWorkflow;
        }
        
        elements.workflowContainer.style.opacity = '1';
    }, 200);
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

// Format action HTML (compact version)
function formatActionHtmlCompact(action, index) {
    let label = '';
    let detail = '';
    
    switch (action.type) {
        case 'ai_prompt':
            label = 'AI';
            detail = action.prompt?.length > 40 ? action.prompt.substring(0, 40) + '...' : action.prompt;
            break;
        case 'notification':
            label = 'Notify';
            detail = action.title || 'Alert';
            break;
        case 'clipboard':
            label = 'Clipboard';
            detail = action.operation || 'copy';
            break;
        case 'http_request':
            label = 'HTTP';
            detail = action.method || 'Request';
            break;
        default:
            label = action.type;
            detail = '';
    }
    
    return `
        <div class="action-item-compact">
            <span class="action-num">${index + 1}</span>
            <span class="action-label">${label}</span>
            ${detail ? `<span class="action-detail">${detail}</span>` : ''}
        </div>
    `;
}

// Show workflow error
function showWorkflowError(message) {
    elements.workflowContainer.innerHTML = `
        <div class="workflow-error-compact">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2">
                <circle cx="12" cy="12" r="10"/>
                <line x1="15" y1="9" x2="9" y2="15"/>
                <line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            <span class="error-msg">${message}</span>
            <button class="retry-btn" onclick="showStep('goal')">Retry</button>
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
        elements.saveWorkflowBtn.textContent = 'Saving...';
        
        const result = await window.electronAPI.createGeneratedWorkflow(generatedWorkflow);
        
        if (result.success) {
            console.log('✅ Workflow saved:', result.workflow);
            
            // Show compact success message
            elements.workflowContainer.innerHTML = `
                <div class="workflow-saved-compact">
                    <div class="saved-check">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5">
                            <polyline points="20 6 9 17 4 12"/>
                        </svg>
                    </div>
                    <div class="saved-text">
                        <span class="saved-title">${generatedWorkflow.name}</span>
                        <span class="saved-subtitle">Saved to workflows</span>
                    </div>
                </div>
            `;
            
            // Dispatch event to refresh workflow list
            window.dispatchEvent(new CustomEvent('refresh-workflows'));
            
            // Auto-navigate to workflows after a short delay
            setTimeout(() => goToWorkflows(), 1500);
            
        } else {
            throw new Error(result.error || 'Failed to save workflow');
        }
        
    } catch (error) {
        console.error('❌ Error saving workflow:', error);
        alert(`Failed to save workflow: ${error.message}`);
    } finally {
        elements.saveWorkflowBtn.disabled = false;
        elements.saveWorkflowBtn.textContent = 'Save Workflow';
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
        <div class="loading-compact">
            <div class="spinner-sm"></div>
            <span>Generating...</span>
        </div>
    `;
}

// Display Workflow
function displayWorkflow(workflow) {
    elements.workflowContainer.style.opacity = '0';
    
    setTimeout(() => {
        elements.workflowContainer.innerHTML = '';
        
        const workflowHTML = `
            <div class="workflow-result">
                <div class="workflow-header">
                    <div class="workflow-header-text">
                        <h3>${workflow.title || 'Your Workflow'}</h3>
                        ${workflow.description ? `<p>${workflow.description}</p>` : ''}
                    </div>
                </div>
                
                <div class="workflow-actions-list">
                    ${workflow.steps.map((step, index) => `
                        <div class="workflow-action-item">
                            <span class="action-number">${index + 1}</span>
                            <span class="action-description">${step.title || step.action}${step.description ? ` — ${step.description}` : ''}</span>
                        </div>
                    `).join('')}
                </div>
                
                ${workflow.notes ? `
                    <div class="workflow-usage-hint">
                        ${workflow.notes}
                    </div>
                ` : ''}
            </div>
        `;
        
        elements.workflowContainer.innerHTML = workflowHTML;
        
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
    currentTranscriptionId = null;
    elements.goalInput.value = '';
    
    // Reload history
    loadTranscriptionHistory();
    
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
        elements.copyTranscriptBtn.textContent = 'Copied!';
        setTimeout(() => {
            elements.copyTranscriptBtn.textContent = 'Copy';
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
