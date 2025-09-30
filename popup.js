document.addEventListener('DOMContentLoaded', () => {
  // --- Element References ---
  const toggleTabAudio = document.getElementById('toggle-tab-audio');
  const waveform = document.querySelector('.waveform');
  const statusText = document.getElementById('status-text');
  const liveDot = document.getElementById('live-dot');
  const transcriptPopup = document.getElementById('live-transcript-popup');
  const qqaResponse = document.getElementById('qqa-response');
  const summarizeBtn = document.getElementById('summarize');
  const askInput = document.getElementById('ask-input');
  const askMicBtn = document.getElementById('ask-mic');
  const screenshotPreview = document.getElementById('screenshot-preview');
  const captureScreenBtn = document.getElementById('capture-screen');
  const summarizeImageBtn = document.getElementById('summarize-image');
  const providerSelect = document.getElementById('provider-select');
  const apiKeyInput = document.getElementById('api-key-input');
  const saveSettingsBtn = document.getElementById('save-settings');
  let screenshotUrl = null;

  // --- Initial State & Permissions ---

  // Load saved settings from chrome.storage
  chrome.storage.local.get(['provider', 'apiKey'], (result) => {
    if (result.provider) {
      providerSelect.value = result.provider;
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
  });

  // Proactively request microphone permission when the popup opens
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      // Permission granted, we can close the stream immediately
      stream.getTracks().forEach(track => track.stop());
    })
    .catch(err => {
      // Permission denied, display a message
      if (err.name === 'NotAllowedError') {
        qqaResponse.textContent = 'Microphone permission is required for voice input. Please allow access.';
      }
    });

  // Request initial state from background for tab recording
  chrome.runtime.sendMessage({ type: 'get-state' }, (response) => {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      return;
    }
    if (response && response.isRecording) {
      updateUIRecording();
    } else {
      updateUIIdle();
    }
  });

  let fullTranscript = '';

  // --- Event Listeners ---

  // Save settings to chrome.storage
  saveSettingsBtn.addEventListener('click', () => {
    const provider = providerSelect.value;
    const apiKey = apiKeyInput.value;
    chrome.storage.local.set({ provider, apiKey }, () => {
      const originalText = saveSettingsBtn.textContent;
      saveSettingsBtn.textContent = 'Saved!';
      setTimeout(() => {
        saveSettingsBtn.textContent = originalText;
      }, 1500);
    });
  });

  // Listener for messages from the background script
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'recording-started') {
      updateUIRecording();
    } else if (message.type === 'recording-stopped') {
      updateUIIdle();
    } else if (message.type === 'transcript-update') {
      fullTranscript += message.transcript + ' ';
      transcriptPopup.textContent = fullTranscript;
      transcriptPopup.classList.remove('hidden');
    }
  });

  // Toggle tab audio recording
  toggleTabAudio.addEventListener('change', () => {
    chrome.runtime.sendMessage({ target: 'background', type: 'toggle-recording' });
  });

  // Microphone input for Q&A
  askMicBtn.addEventListener('click', () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.onstart = () => {
      askInput.placeholder = 'Listening...';
      askMicBtn.classList.add('recording');
    };
    recognition.onresult = (event) => {
      askInput.value = event.results[0][0].transcript;
    };
    recognition.onerror = (event) => {
      if (event.error === 'not-allowed') {
        qqaResponse.textContent = 'Microphone permission denied. Please allow microphone access in your browser settings.';
      } else {
        askInput.placeholder = 'Error listening.';
      }
    };
    recognition.onend = () => {
      askInput.placeholder = 'Ask anything...';
      askMicBtn.classList.remove('recording');
    };
    recognition.start();
  });

  // Screen capture functionality
  captureScreenBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'get-state' }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      if (response && response.isRecording) {
        qqaResponse.textContent = 'Cannot capture screen while tab audio is being recorded.';
        return;
      }
      chrome.tabs.captureVisibleTab({ format: 'png' }, (url) => {
        if (url) {
          screenshotUrl = url;
          screenshotPreview.src = url;
          screenshotPreview.classList.remove('hidden');
          summarizeImageBtn.classList.remove('hidden');
          captureScreenBtn.classList.add('hidden');
        } else {
          qqaResponse.textContent = 'Failed to capture screenshot.';
        }
      });
    });
  });

  // Send screenshot for analysis
  summarizeImageBtn.addEventListener('click', () => {
    if (screenshotUrl) {
      getSummaryForImage(screenshotUrl);
    }
  });

  // Summarize transcript
  summarizeBtn.addEventListener('click', () => {
    if (fullTranscript && fullTranscript.trim() !== '') {
      getSummary(fullTranscript);
    } else {
      qqaResponse.textContent = 'Nothing to summarize yet.';
    }
  });

  // --- UI Update Functions ---
  function updateUIRecording() {
    toggleTabAudio.checked = true;
    waveform.style.display = 'flex';
    statusText.textContent = 'Status: Active & Listening...';
    liveDot.classList.remove('hidden');
    transcriptPopup.classList.remove('hidden');
    transcriptPopup.textContent = 'Starting transcription...';
    fullTranscript = '';
  }

  function updateUIIdle() {
    toggleTabAudio.checked = false;
    waveform.style.display = 'none';
    statusText.textContent = 'Status: Inactive';
    liveDot.classList.add('hidden');
  }

  // --- API Call Functions ---
  async function getSummary(transcript) {
    qqaResponse.textContent = 'Summarizing...';
    try {
      const { provider, apiKey } = await new Promise(resolve => chrome.storage.local.get(['provider', 'apiKey'], resolve));
      const res = await fetch('https://answerai-extension-twq4.vercel.app/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: `Summarize this: ${transcript}`,
          provider: provider || 'openai',
          apiKey: apiKey || ''
        })
      });
      const data = await res.json();
      qqaResponse.textContent = data.answer || 'No summary received.';
    } catch (error) {
      qqaResponse.textContent = 'Error summarizing transcript.';
    }
  }

  async function getSummaryForImage(imageUrl) {
    qqaResponse.textContent = 'Analyzing image...';
    try {
      const { provider, apiKey } = await new Promise(resolve => chrome.storage.local.get(['provider', 'apiKey'], resolve));
      const res = await fetch('https://answerai-extension-twq4.vercel.app/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          provider: provider || 'openai',
          apiKey: apiKey || ''
        })
      });
      const data = await res.json();
      qqaResponse.textContent = data.answer || 'No analysis received.';
    } catch (error) {
      qqaResponse.textContent = 'Error analyzing image.';
    }
  }
});
