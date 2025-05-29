// popup.js - Enhanced version with speaker-based downloads

document.addEventListener('DOMContentLoaded', function () {
    const statusDiv = document.getElementById('status');
    const statusText = document.getElementById('statusText');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const downloadSpeakerBtn = document.getElementById('downloadSpeakerBtn');
    const durationSpan = document.getElementById('duration');
    const wordCountSpan = document.getElementById('wordCount');
    const currentSpeakerSpan = document.getElementById('currentSpeaker');
    const speakerCountSpan = document.getElementById('speakerCount');
    const speakersListDiv = document.getElementById('speakersList');
    const errorDiv = document.getElementById('error');

    let startTime = null;
    let durationInterval = null;
    let statsInterval = null;

    function updateDuration() {
        if (!startTime) return;
        const now = new Date();
        const diff = new Date(now - startTime);
        const hours = diff.getUTCHours().toString().padStart(2, '0');
        const minutes = diff.getUTCMinutes().toString().padStart(2, '0');
        const seconds = diff.getUTCSeconds().toString().padStart(2, '0');
        durationSpan.textContent = `${hours}:${minutes}:${seconds}`;
    }

    function updateStats() {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getStats' }, function (response) {
                if (response) {
                    wordCountSpan.textContent = response.wordCount || '0';
                    currentSpeakerSpan.textContent = response.currentSpeaker || 'None';
                    speakerCountSpan.textContent = response.speakerCount || '0';

                    // Update speakers list
                    if (response.speakers && response.speakers.length > 0) {
                        speakersListDiv.innerHTML = response.speakers
                            .map(speaker => `<span class="speaker-tag">${speaker}</span>`)
                            .join('');
                        speakersListDiv.style.display = 'block';
                    } else {
                        speakersListDiv.style.display = 'none';
                    }
                }
            });
        });
    }

    function showError(message) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => {
            errorDiv.style.display = 'none';
        }, 5000);
    }

    function showSuccess(message) {
        const successDiv = document.createElement('div');
        successDiv.textContent = message;
        successDiv.style.cssText = 'color: #2e7d32; text-align: center; margin-top: 10px; font-size: 12px;';
        document.body.appendChild(successDiv);
        setTimeout(() => {
            successDiv.remove();
        }, 3000);
    }

    // Check if we're in a meeting tab
    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        const url = tabs[0].url;
        const isMeeting = url.includes('zoom.us/') ||
            url.includes('meet.google.com') ||
            url.includes('teams.microsoft.com') ||
            url.includes('webex.com/');

        if (isMeeting) {
            statusText.textContent = 'Meeting detected - Ready to transcribe';
            startBtn.disabled = false;

            // Check if transcription is already running
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getStatus' }, function (response) {
                if (response && response.isTranscribing) {
                    statusDiv.classList.remove('inactive');
                    statusDiv.classList.add('active');
                    statusText.textContent = 'Transcription in progress (background)';
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    startTime = new Date(response.startTime);
                    updateDuration();
                    durationInterval = setInterval(updateDuration, 1000);
                    statsInterval = setInterval(updateStats, 2000);
                }
            });
        } else {
            statusText.textContent = 'No active meeting detected';
            startBtn.disabled = true;
            stopBtn.disabled = true;
        }
    });

    // Start transcription
    startBtn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'startTranscribing' }, function (response) {
                if (response && response.status === 'started') {
                    statusDiv.classList.remove('inactive');
                    statusDiv.classList.add('active');
                    statusText.textContent = 'Transcription in progress (background)';
                    startBtn.disabled = true;
                    stopBtn.disabled = false;
                    startTime = new Date();
                    durationInterval = setInterval(updateDuration, 1000);
                    statsInterval = setInterval(updateStats, 2000);
                    showSuccess('Transcription started with system audio capture');
                } else {
                    showError('Failed to start transcription. Grant audio permissions when prompted.');
                }
            });
        });
    });

    // Stop transcription
    stopBtn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'stopTranscribing' }, function (response) {
                if (response && response.status === 'stopped') {
                    statusDiv.classList.remove('active');
                    statusDiv.classList.add('inactive');
                    statusText.textContent = 'Transcription stopped';
                    startBtn.disabled = false;
                    stopBtn.disabled = true;
                    clearInterval(durationInterval);
                    clearInterval(statsInterval);
                    startTime = null;
                    showSuccess('Transcription saved successfully');
                } else {
                    showError('Failed to stop transcription. Please try again.');
                }
            });
        });
    });

    // Download complete transcript
    downloadBtn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'getTranscript' }, function (response) {
                if (response && response.transcript) {
                    const blob = new Blob([response.transcript], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `meeting_transcript_${new Date().toISOString().slice(0, 10)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showSuccess('Complete transcript downloaded');
                } else {
                    showError('No transcript available to download.');
                }
            });
        });
    });

    // Download speaker-separated transcript
    downloadSpeakerBtn.addEventListener('click', function () {
        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'exportBySpeaker' }, function (response) {
                if (response && response.transcript) {
                    const blob = new Blob([response.transcript], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `meeting_by_speaker_${new Date().toISOString().slice(0, 10)}.txt`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showSuccess('Speaker-separated transcript downloaded');
                } else {
                    showError('No speaker data available to download.');
                }
            });
        });
    });
});