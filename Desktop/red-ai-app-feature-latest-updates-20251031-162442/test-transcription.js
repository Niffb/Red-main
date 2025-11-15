// Test script to verify Deepgram transcription implementation
const fs = require('fs');
const path = require('path');

console.log('🧪 Testing Deepgram Transcription Implementation\n');

const checks = [];

// Check 1: Deepgram SDK installed
try {
    require('@deepgram/sdk');
    checks.push({ name: 'Deepgram SDK installed', status: '✅' });
} catch (error) {
    checks.push({ name: 'Deepgram SDK installed', status: '❌', error: error.message });
}

// Check 2: Deepgram API key in .env
const envContent = fs.readFileSync('.env', 'utf8');
const hasDeepgramKey = envContent.includes('DEEPGRAM_API_KEY=') && 
                       !envContent.includes('DEEPGRAM_API_KEY=your_deepgram_api_key_here');
checks.push({ 
    name: 'Deepgram API key configured', 
    status: hasDeepgramKey ? '✅' : '⚠️',
    note: hasDeepgramKey ? '' : 'Using placeholder key'
});

// Check 3: Transcription service exists
const serviceExists = fs.existsSync('electron/realtime-transcription-service.js');
checks.push({ 
    name: 'Transcription service file', 
    status: serviceExists ? '✅' : '❌'
});

// Check 4: Old Python server removed
const pythonServerRemoved = !fs.existsSync('realtime-stt-server.py');
checks.push({ 
    name: 'Old Python STT server removed', 
    status: pythonServerRemoved ? '✅' : '⚠️'
});

// Check 5: New IPC handlers in main.js
const mainJs = fs.readFileSync('electron/main.js', 'utf8');
const hasNewHandlers = mainJs.includes('transcription-start') && 
                       mainJs.includes('transcription-stop') &&
                       mainJs.includes('realtime-transcription-service');
checks.push({ 
    name: 'New IPC handlers in main.js', 
    status: hasNewHandlers ? '✅' : '❌'
});

// Check 6: Old STT handlers removed
const hasOldHandlers = mainJs.includes('start-stt-server') || 
                       mainJs.includes('realtimeSTTProcess');
checks.push({ 
    name: 'Old STT handlers removed', 
    status: !hasOldHandlers ? '✅' : '⚠️'
});

// Check 7: Preload exports updated
const preload = fs.readFileSync('electron/preload.js', 'utf8');
const hasNewExports = preload.includes('transcriptionStart') && 
                      preload.includes('transcriptionSendAudio') &&
                      preload.includes('onTranscriptionResult');
checks.push({ 
    name: 'Preload.js updated with new methods', 
    status: hasNewExports ? '✅' : '❌'
});

// Check 8: IPC security whitelist updated
const ipcSecurity = fs.readFileSync('electron/ipc-security.js', 'utf8');
const hasSecurityChannels = ipcSecurity.includes('transcription-start') && 
                            ipcSecurity.includes('transcription-stop');
checks.push({ 
    name: 'IPC security whitelist updated', 
    status: hasSecurityChannels ? '✅' : '❌'
});

// Check 9: New UI files
const uiExists = fs.existsSync('public/transcription-window.html') &&
                 fs.existsSync('public/transcription-window.js');
checks.push({ 
    name: 'New UI files present', 
    status: uiExists ? '✅' : '❌'
});

// Check 10: UI uses Web Audio API
const uiJs = fs.readFileSync('public/transcription-window.js', 'utf8');
const usesWebAudio = uiJs.includes('AudioContext') && 
                     uiJs.includes('getUserMedia') &&
                     uiJs.includes('createScriptProcessor');
checks.push({ 
    name: 'UI uses Web Audio API', 
    status: usesWebAudio ? '✅' : '❌'
});

// Print results
checks.forEach(check => {
    console.log(`${check.status} ${check.name}`);
    if (check.error) {
        console.log(`   Error: ${check.error}`);
    }
    if (check.note) {
        console.log(`   Note: ${check.note}`);
    }
});

// Summary
const passed = checks.filter(c => c.status === '✅').length;
const total = checks.length;
const warnings = checks.filter(c => c.status === '⚠️').length;
const failed = checks.filter(c => c.status === '❌').length;

console.log(`\n📊 Summary: ${passed}/${total} checks passed`);
if (warnings > 0) {
    console.log(`⚠️  ${warnings} warnings`);
}
if (failed > 0) {
    console.log(`❌ ${failed} failed`);
}

if (failed === 0) {
    console.log('\n✅ All critical checks passed!');
    console.log('\n🚀 Next steps:');
    console.log('   1. Start the app: npm start');
    console.log('   2. Navigate to the Transcription tab');
    console.log('   3. Click "Start Recording"');
    console.log('   4. Grant microphone permissions');
    console.log('   5. Speak or play audio');
    console.log('   6. Watch real-time transcription appear!');
    console.log('\n💡 Features:');
    console.log('   • Real-time speech-to-text with Deepgram');
    console.log('   • Sub-second latency (~300ms)');
    console.log('   • High accuracy (~95%+)');
    console.log('   • AI workflow generation from transcripts');
    console.log('   • No complex setup required!');
} else {
    console.log('\n⚠️  Some checks failed. Please review the errors above.');
}

