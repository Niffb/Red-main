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
    workflowContainer: document.getElementById('workflow-container')
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

        // Show goal input step
        if (fullTranscript && fullTranscript.trim().length > 0) {
            showGoalStep();
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
        
        const result = await window.electronAPI.transcriptionCreateWorkflow(fullTranscript, goal);
            
            if (result.success) {
                displayWorkflow(result.workflow);
            } else {
            throw new Error(result.error || 'Failed to generate workflow');
            }
            
        } catch (error) {
        console.error('❌ Error generating workflow:', error);
        alert(`Failed to generate workflow: ${error.message}`);
        showStep('goal');
    } finally {
        elements.generateWorkflowBtn.disabled = false;
        elements.generateWorkflowBtn.innerHTML = '<i class="fas fa-magic"></i><span>Generate Workflow</span>';
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
    elements.stepGoal.classList.add('hidden');
    elements.stepWorkflow.classList.add('hidden');
    
    switch(step) {
        case 'ready':
            elements.stepReady.classList.remove('hidden');
            break;
        case 'recording':
            elements.stepRecording.classList.remove('hidden');
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
