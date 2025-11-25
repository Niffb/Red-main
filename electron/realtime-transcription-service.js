// Real-time Transcription Service using Deepgram
const { createClient, LiveTranscriptionEvents } = require('@deepgram/sdk');

class RealtimeTranscriptionService {
  constructor() {
    this.deepgram = null;
    this.connection = null;
    this.isRecording = false;
    this.transcriptBuffer = [];
    this.onTranscriptCallback = null;
    this.onErrorCallback = null;
  }

  /**
   * Initialize Deepgram client
   */
  initializeClient() {
    if (!this.deepgram) {
      const apiKey = process.env.DEEPGRAM_API_KEY;
      
      if (!apiKey) {
        throw new Error('DEEPGRAM_API_KEY not configured. Please set it in your .env file');
      }
      
      this.deepgram = createClient(apiKey);
      console.log('✅ Deepgram client initialized');
    }
  }

  /**
   * Start real-time transcription
   * @param {Function} onTranscript - Callback for transcription results
   * @param {Function} onError - Callback for errors
   */
  async startRecording(onTranscript, onError) {
    try {
      this.initializeClient();
      
      this.onTranscriptCallback = onTranscript;
      this.onErrorCallback = onError;
      this.transcriptBuffer = [];

      // Create live transcription connection
      this.connection = this.deepgram.listen.live({
        model: 'nova-2',
        language: 'en-US',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: 16000,
        channels: 1
      });

      // Handle connection open
      this.connection.on(LiveTranscriptionEvents.Open, () => {
        console.log('✅ Deepgram connection opened');
        this.isRecording = true;
        
        // Keep connection alive
        this.keepAlive();
      });

      // Handle transcription results
      this.connection.on(LiveTranscriptionEvents.Transcript, (data) => {
        const transcript = data.channel?.alternatives?.[0]?.transcript;
        const isFinal = data.is_final;
        const confidence = data.channel?.alternatives?.[0]?.confidence || 0;
        
        if (transcript && transcript.length > 0) {
          console.log(`📝 Transcript (${isFinal ? 'final' : 'interim'}): ${transcript}`);
          
          // Add to buffer if final
          if (isFinal) {
            this.transcriptBuffer.push(transcript);
          }
          
          // Send to callback
          if (this.onTranscriptCallback) {
            this.onTranscriptCallback({
              text: transcript,
              isFinal: isFinal,
              confidence: confidence,
              timestamp: Date.now()
            });
          }
        }
      });

      // Handle metadata
      this.connection.on(LiveTranscriptionEvents.Metadata, (data) => {
        console.log('📊 Deepgram metadata:', data);
      });

      // Handle errors
      this.connection.on(LiveTranscriptionEvents.Error, (error) => {
        console.error('❌ Deepgram error:', error);
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
      });

      // Handle connection close
      this.connection.on(LiveTranscriptionEvents.Close, () => {
        console.log('🔌 Deepgram connection closed');
        this.isRecording = false;
        this.clearKeepAlive();
      });

      // Handle warnings
      this.connection.on(LiveTranscriptionEvents.Warning, (warning) => {
        console.warn('⚠️ Deepgram warning:', warning);
      });

      console.log('🎙️ Deepgram recording started');
      
    } catch (error) {
      console.error('Failed to start recording:', error);
      this.isRecording = false;
      if (onError) {
        onError(error);
      }
      throw error;
    }
  }

  /**
   * Send audio data to Deepgram
   * @param {Buffer|ArrayBuffer|Int16Array} audioData - Raw audio data (PCM16, 16kHz, mono)
   */
  sendAudio(audioData) {
    if (this.connection && this.isRecording) {
      try {
        // Convert to Buffer if needed
        let buffer;
        if (Buffer.isBuffer(audioData)) {
          buffer = audioData;
        } else if (audioData instanceof ArrayBuffer) {
          buffer = Buffer.from(audioData);
        } else if (audioData instanceof Int16Array) {
          buffer = Buffer.from(audioData.buffer);
        } else if (Array.isArray(audioData)) {
          buffer = Buffer.from(Int16Array.from(audioData).buffer);
        } else {
          console.error('Invalid audio data type:', typeof audioData);
          return;
        }
        
        this.connection.send(buffer);
      } catch (error) {
        console.error('Error sending audio:', error);
        if (this.onErrorCallback) {
          this.onErrorCallback(error);
        }
      }
    }
  }

  /**
   * Stop recording and close connection
   * @returns {Object} Final transcript and metadata
   */
  async stopRecording() {
    try {
      console.log('🛑 Stopping Deepgram recording...');
      
      this.clearKeepAlive();
      
      if (this.connection) {
        this.connection.finish();
        this.connection = null;
      }
      
      this.isRecording = false;
      
      // Return complete transcript
      const fullTranscript = this.transcriptBuffer.join(' ');
      const result = {
        transcript: fullTranscript,
        segments: this.transcriptBuffer,
        duration: 0, // Could track this if needed
        wordCount: fullTranscript.split(' ').filter(w => w.length > 0).length
      };
      
      console.log('✅ Recording stopped. Transcript length:', result.wordCount, 'words');
      
      return result;
      
    } catch (error) {
      console.error('Error stopping recording:', error);
      throw error;
    }
  }

  /**
   * Keep connection alive by sending keepalive messages
   */
  keepAlive() {
    this.keepAliveInterval = setInterval(() => {
      if (this.connection && this.isRecording) {
        this.connection.keepAlive();
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Clear keep alive interval
   */
  clearKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval);
      this.keepAliveInterval = null;
    }
  }

  /**
   * Get current transcription status
   * @returns {Object} Status information
   */
  getStatus() {
    return {
      isRecording: this.isRecording,
      segmentCount: this.transcriptBuffer.length,
      wordCount: this.transcriptBuffer.join(' ').split(' ').filter(w => w.length > 0).length,
      connected: this.connection !== null
    };
  }

  /**
   * Get accumulated transcript so far
   * @returns {string} Current transcript
   */
  getCurrentTranscript() {
    return this.transcriptBuffer.join(' ');
  }
}

// Create singleton instance
const realtimeTranscriptionService = new RealtimeTranscriptionService();

module.exports = realtimeTranscriptionService;

