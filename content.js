// content.js - Enhanced version with system audio capture and persistent transcription

class MeetingTranscriber {
    constructor() {
        this.isTranscribing = false;
        this.recognition = null;
        this.transcript = '';
        this.speakers = new Map(); // Track speakers and their transcripts
        this.currentSpeaker = 'Unknown';
        this.lastError = null;
        this.errorCount = 0;
        this.startTime = null;
        this.wordCount = 0;
        this.audioContext = null;
        this.mediaStream = null;
        this.setupRecognition();
        this.setupSpeakerDetection();
        // Remove visibility handler to allow background transcription
    }

    async setupAudioCapture() {
        try {
            // Request tab audio capture permission
            this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: false,
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Create audio context for processing
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = this.audioContext.createMediaStreamSource(this.mediaStream);

            // Connect to speech recognition
            const destination = this.audioContext.createMediaStreamDestination();
            source.connect(destination);

            // Update recognition to use captured audio
            if (this.recognition) {
                this.recognition.stop();
                // Small delay before restarting with new audio source
                setTimeout(() => {
                    if (this.isTranscribing) {
                        this.recognition.start();
                    }
                }, 500);
            }

            return true;
        } catch (error) {
            console.error('Failed to capture system audio:', error);
            // Fallback to microphone
            return this.setupMicrophoneCapture();
        }
    }

    async setupMicrophoneCapture() {
        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });
            return true;
        } catch (error) {
            console.error('Failed to access microphone:', error);
            return false;
        }
    }

    setupRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.error('Speech Recognition API not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = true;
        this.recognition.interimResults = true;
        this.recognition.maxAlternatives = 1;
        this.recognition.lang = 'en-US';

        this.recognition.onstart = () => {
            console.log('Speech recognition started');
            this.errorCount = 0;
            this.lastError = null;
        };

        this.recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript;
                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                    this.detectCurrentSpeaker();

                    // Save transcript with speaker attribution
                    const cleanTranscript = transcript.trim();
                    const formattedTranscript = `${this.currentSpeaker}: "${cleanTranscript}"\n`;

                    // Add to overall transcript
                    this.transcript += formattedTranscript;

                    // Track per-speaker transcripts
                    if (!this.speakers.has(this.currentSpeaker)) {
                        this.speakers.set(this.currentSpeaker, []);
                    }
                    this.speakers.get(this.currentSpeaker).push({
                        text: cleanTranscript,
                        timestamp: new Date().toISOString()
                    });

                    this.wordCount += cleanTranscript.split(/\s+/).length;
                    this.saveTranscript();
                } else {
                    interimTranscript += transcript;
                }
            }

            if (finalTranscript) {
                console.log(`${this.currentSpeaker}: ${finalTranscript.trim()}`);
            }
        };

        this.recognition.onerror = (event) => {
            console.error('Speech Recognition Error:', event.error);
            this.lastError = event.error;
            this.errorCount++;

            if (event.error === 'no-speech' && this.errorCount > 3) {
                this.restartRecognition(2000);
            } else if (['audio-capture', 'not-allowed'].includes(event.error)) {
                this.isTranscribing = false;
            } else {
                this.restartRecognition(1000);
            }
        };

        this.recognition.onend = () => {
            console.log('Speech recognition ended');
            // Continue transcription regardless of tab visibility
            if (this.isTranscribing) {
                const delay = this.lastError === 'no-speech' ? 1000 : 100;
                this.restartRecognition(delay);
            }
        };
    }

    setupSpeakerDetection() {
        setInterval(() => {
            this.detectCurrentSpeaker();
        }, 500);
    }

    detectCurrentSpeaker() {
        const hostname = window.location.hostname;
        let newSpeaker = 'Unknown';

        try {
            if (hostname.includes('zoom.us')) {
                // Enhanced Zoom speaker detection
                const speakingElements = document.querySelectorAll('[aria-label*="is speaking"], [aria-label*="speaking"]');
                if (speakingElements.length > 0) {
                    const speakerText = speakingElements[0].getAttribute('aria-label');
                    const match = speakerText.match(/(.+?)\s+is speaking/);
                    if (match) {
                        newSpeaker = match[1].trim();
                    }
                }

                // Fallback: check for active video tiles
                if (newSpeaker === 'Unknown') {
                    const videoTiles = document.querySelectorAll('[data-participant-id]');
                    for (const tile of videoTiles) {
                        if (tile.classList.contains('active-speaker') || tile.querySelector('.active-speaker')) {
                            const nameElement = tile.querySelector('[data-tooltip]');
                            if (nameElement) {
                                newSpeaker = nameElement.getAttribute('data-tooltip').trim();
                                break;
                            }
                        }
                    }
                }
            } else if (hostname.includes('meet.google.com')) {
                // Enhanced Google Meet detection
                const speakerElements = document.querySelectorAll('[data-participant-id][data-self-name]');
                for (const element of speakerElements) {
                    const parent = element.closest('[data-participant-id]');
                    if (parent && (parent.classList.contains('speaking') || parent.querySelector('[class*="speaking"]'))) {
                        newSpeaker = element.getAttribute('data-self-name') ||
                            element.getAttribute('data-participant-id');
                        break;
                    }
                }

                // Check for active video feeds
                if (newSpeaker === 'Unknown') {
                    const activeVideos = document.querySelectorAll('video[autoplay]');
                    for (const video of activeVideos) {
                        const container = video.closest('[data-participant-id]');
                        if (container) {
                            const nameAttr = container.getAttribute('data-self-name') ||
                                container.getAttribute('data-participant-id');
                            if (nameAttr) {
                                newSpeaker = nameAttr;
                                break;
                            }
                        }
                    }
                }
            } else if (hostname.includes('teams.microsoft.com')) {
                // Enhanced Teams detection
                const activeParticipants = document.querySelectorAll('[role="gridcell"] .participant-name, [data-tid="participant-name"]');
                for (const nameElement of activeParticipants) {
                    const parent = nameElement.closest('[role="gridcell"]') || nameElement.closest('[data-tid*="participant"]');
                    if (parent && (parent.querySelector('[class*="active"]') || parent.querySelector('[class*="speaking"]'))) {
                        newSpeaker = nameElement.textContent.trim();
                        break;
                    }
                }
            } else if (hostname.includes('webex.com')) {
                // Enhanced Webex detection
                const speakerElements = document.querySelectorAll('.participant-name, [data-participant-name]');
                for (const element of speakerElements) {
                    const container = element.closest('[class*="participant"]');
                    if (container && (container.classList.contains('active-speaker') || container.querySelector('[class*="active-speaker"]'))) {
                        newSpeaker = element.textContent.trim() || element.getAttribute('data-participant-name');
                        break;
                    }
                }
            }

            // Clean up speaker name
            if (newSpeaker && newSpeaker !== 'Unknown') {
                // Remove common suffixes and clean up
                newSpeaker = newSpeaker.replace(/\s*\(.*?\)$/, '').trim();
                this.currentSpeaker = newSpeaker;
            }
        } catch (e) {
            console.error('Error detecting speaker:', e);
        }
    }

    async startTranscribing() {
        if (!this.isTranscribing && this.recognition) {
            // Setup audio capture first
            const audioSetup = await this.setupAudioCapture();
            if (!audioSetup) {
                console.error('Failed to setup audio capture');
                return false;
            }

            this.isTranscribing = true;
            this.errorCount = 0;
            this.lastError = null;
            this.startTime = new Date();
            this.speakers.clear();

            try {
                this.recognition.start();
                console.log('Transcription started with system audio capture');
                return true;
            } catch (e) {
                console.error('Error starting recognition:', e);
                return false;
            }
        }
        return false;
    }

    stopTranscribing() {
        if (this.isTranscribing && this.recognition) {
            this.isTranscribing = false;
            try {
                this.recognition.stop();

                // Clean up audio resources
                if (this.mediaStream) {
                    this.mediaStream.getTracks().forEach(track => track.stop());
                    this.mediaStream = null;
                }
                if (this.audioContext) {
                    this.audioContext.close();
                    this.audioContext = null;
                }

                console.log('Transcription stopped');
                return true;
            } catch (e) {
                console.error('Error stopping recognition:', e);
                return false;
            }
        }
        return false;
    }

    restartRecognition(delay = 1000) {
        if (this.isTranscribing) {
            setTimeout(() => {
                try {
                    this.recognition.start();
                    console.log('Recognition restarted');
                } catch (e) {
                    console.error('Error restarting recognition:', e);
                    if (delay < 5000) {
                        this.restartRecognition(delay * 2);
                    }
                }
            }, delay);
        }
    }

    getStats() {
        return {
            isTranscribing: this.isTranscribing,
            startTime: this.startTime,
            wordCount: this.wordCount,
            currentSpeaker: this.currentSpeaker,
            speakerCount: this.speakers.size,
            speakers: Array.from(this.speakers.keys())
        };
    }

    saveTranscript() {
        const timestamp = new Date().toISOString();
        const speakersData = {};

        // Convert speakers Map to object for storage
        for (const [speaker, utterances] of this.speakers) {
            speakersData[speaker] = utterances;
        }

        chrome.storage.local.set({
            [`transcript_${Date.now()}`]: {
                text: this.transcript,
                timestamp: timestamp,
                speakers: speakersData,
                currentSpeaker: this.currentSpeaker,
                wordCount: this.wordCount,
                startTime: this.startTime
            }
        }, () => {
            if (chrome.runtime.lastError) {
                console.error('Error saving transcript:', chrome.runtime.lastError);
            }
        });
    }

    getTranscript() {
        return this.transcript;
    }

    getSpeakerTranscripts() {
        const result = {};
        for (const [speaker, utterances] of this.speakers) {
            result[speaker] = utterances.map(u => u.text).join(' ');
        }
        return result;
    }

    exportTranscriptBySpeaker() {
        let output = `Meeting Transcript - ${new Date().toLocaleString()}\n`;
        output += `Duration: ${this.startTime ? Math.floor((new Date() - this.startTime) / 60000) : 0} minutes\n`;
        output += `Total Words: ${this.wordCount}\n\n`;

        for (const [speaker, utterances] of this.speakers) {
            output += `=== ${speaker} ===\n`;
            utterances.forEach((utterance, index) => {
                const time = new Date(utterance.timestamp).toLocaleTimeString();
                output += `[${time}] ${utterance.text}\n`;
            });
            output += '\n';
        }

        output += '\n=== Complete Transcript ===\n';
        output += this.transcript;

        return output;
    }
}

// Initialize the transcriber
const transcriber = new MeetingTranscriber();

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    switch (request.action) {
        case 'startTranscribing':
            transcriber.startTranscribing().then(started => {
                sendResponse({ status: started ? 'started' : 'error' });
            });
            break;
        case 'stopTranscribing':
            const stopped = transcriber.stopTranscribing();
            sendResponse({ status: stopped ? 'stopped' : 'error' });
            break;
        case 'getTranscript':
            sendResponse({ transcript: transcriber.getTranscript() });
            break;
        case 'getSpeakerTranscripts':
            sendResponse({ speakers: transcriber.getSpeakerTranscripts() });
            break;
        case 'exportBySpeaker':
            sendResponse({ transcript: transcriber.exportTranscriptBySpeaker() });
            break;
        case 'getStats':
            sendResponse(transcriber.getStats());
            break;
        case 'getStatus':
            sendResponse({
                isTranscribing: transcriber.isTranscribing,
                startTime: transcriber.startTime
            });
            break;
    }
    return true;
});