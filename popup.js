document.addEventListener('DOMContentLoaded', () => {
  const toggleListen = document.getElementById('toggle-listen');
  const processingBtn = document.getElementById('processing-btn');
  const waveform = document.querySelector('.waveform');
  const statusText = document.getElementById('status-text');
  const liveDot = document.getElementById('live-dot');
  const transcriptPopup = document.getElementById('live-transcript-popup');
  const qqaResponse = document.getElementById('qqa-response');
  const summarizeBtn = document.getElementById('summarize');

  // Request initial state from background
  chrome.runtime.sendMessage({ type: 'get-state' }, (response) => {
    if (response && response.isRecording) {
      updateUIRecording();
    } else {
      updateUIIdle();
    }
  });

  toggleListen.addEventListener('change', async () => {
    if (toggleListen.checked) {
      try {
        // Request microphone permission to enable the SpeechRecognition API.
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Immediately stop the tracks to release the microphone, as we only need the permission.
        stream.getTracks().forEach(track => track.stop());
        
        // Now that permission is granted, proceed with tab audio capture.
        chrome.runtime.sendMessage({ target: 'background', type: 'toggle-recording' });
      } catch (error) {
        console.error('Microphone permission denied:', error);
        qqaResponse.textContent = 'Microphone permission is required for transcription to work.';
        toggleListen.checked = false; // Revert the toggle if permission is denied.
      }
    } else {
      // If turning off, just send the message to stop recording.
      chrome.runtime.sendMessage({ target: 'background', type: 'toggle-recording' });
    }
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'recording-started') {
      updateUIRecording();
    } else if (message.type === 'recording-stopped') {
      updateUIIdle();
      if (message.transcript) {
        transcriptPopup.textContent = message.transcript;
        transcriptPopup.classList.remove('hidden');
      }
    } else if (message.type === 'transcript-update') {
        transcriptPopup.textContent = message.transcript;
        transcriptPopup.classList.remove('hidden');
    }
  });

  function updateUIRecording() {
    toggleListen.checked = true;
    processingBtn.textContent = 'Listening...';
    waveform.style.display = 'flex';
    statusText.textContent = 'Status: Active & Listening...';
    liveDot.classList.remove('hidden');
  }

  function updateUIIdle() {
    toggleListen.checked = false;
    processingBtn.textContent = 'Processing transcript';
    waveform.style.display = 'none';
    statusText.textContent = 'Status: Inactive';
    liveDot.classList.add('hidden');
  }

  async function getSummary(transcript) {
    qqaResponse.textContent = 'Summarizing...';
    try {
      const res = await fetch('http://localhost:3000/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: `Summarize this: ${transcript}` })
      });
      const data = await res.json();
      qqaResponse.textContent = data.answer;
    } catch (error) {
      console.error('Error getting summary:', error);
      qqaResponse.textContent = 'Error summarizing transcript.';
    }
  }

  summarizeBtn.addEventListener('click', () => {
    const transcript = transcriptPopup.textContent;
    if (transcript && transcript !== 'Nothing to summarize yet.') {
      getSummary(transcript);
    } else {
      qqaResponse.textContent = 'Nothing to summarize yet.';
    }
  });

  // Screenshot functionality
  const screenshotPreview = document.getElementById('screenshot-preview');
  document.getElementById('capture-screen').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (screenshotUrl) => {
      if (screenshotUrl) {
        screenshotPreview.src = screenshotUrl;
        screenshotPreview.classList.remove('hidden');
        getSummaryForImage(screenshotUrl);
      } else {
        console.error('Could not capture screenshot.');
        qqaResponse.textContent = 'Failed to capture screenshot.';
      }
    });
  });

  async function getSummaryForImage(imageUrl) {
    qqaResponse.textContent = 'Analyzing image...';
    try {
      const res = await fetch('http://localhost:3000/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imageUrl })
      });
      const data = await res.json();
      qqaResponse.textContent = data.answer;
    } catch (error) {
      console.error('Error getting image summary:', error);
      qqaResponse.textContent = 'Error analyzing image.';
    }
  }
});
