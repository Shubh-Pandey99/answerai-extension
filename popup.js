document.addEventListener('DOMContentLoaded', () => {
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
  const vercelUrlInput = document.getElementById('vercel-url-input');

  let fullTranscript = '';
  let screenshotUrl = null;

  // Load settings
  chrome.storage.local.get(['provider', 'apiKey', 'vercelUrl'], (res) => {
    if (res.provider) providerSelect.value = res.provider;
    if (res.apiKey) apiKeyInput.value = res.apiKey;
    if (res.vercelUrl) vercelUrlInput.value = res.vercelUrl;
  });

  const waveformBars = document.querySelectorAll('.waveform .bar');

  function animateWaveform(audioData) {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) sum += audioData[i] ** 2;
    const rms = Math.sqrt(sum / audioData.length);

    waveformBars.forEach((bar, idx) => {
      const scale = Math.min(1, rms * 10 + Math.random() * 0.5);
      bar.style.height = `${Math.max(4, scale * 24)}px`;
      bar.style.opacity = 0.3 + scale * 0.7;
    });
  }

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
    waveformBars.forEach(bar => {
      bar.style.height = '4px';
      bar.style.opacity = 0.3;
    });
  }

  // Listen to messages
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'recording-started') updateUIRecording();
    if (message.type === 'recording-stopped') updateUIIdle();
    if (message.type === 'transcript-update') {
      fullTranscript += message.transcript + ' ';
      transcriptPopup.textContent = fullTranscript;
      transcriptPopup.classList.remove('hidden');
    }
    if (message.type === 'audio-data') animateWaveform(message.data);
  });

  toggleTabAudio.addEventListener('change', () => {
    chrome.runtime.sendMessage({ target: 'background', type: 'toggle-recording' });
  });

  saveSettingsBtn.addEventListener('click', () => {
    const provider = providerSelect.value;
    const apiKey = apiKeyInput.value;
    const vercelUrl = vercelUrlInput.value;
    chrome.storage.local.set({ provider, apiKey, vercelUrl }, () => {
      saveSettingsBtn.textContent = 'Saved!';
      setTimeout(() => { saveSettingsBtn.textContent = 'Save Settings'; }, 1500);
    });
  });

  // Q&A Mic
  askMicBtn.addEventListener('click', () => {
    const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.onstart = () => { askInput.placeholder = 'Listening...'; askMicBtn.classList.add('recording'); };
    recognition.onresult = (event) => { askInput.value = event.results[0][0].transcript; };
    recognition.onerror = (event) => { askInput.placeholder = 'Error listening.'; };
    recognition.onend = () => { askInput.placeholder = 'Ask anything...'; askMicBtn.classList.remove('recording'); };
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

  // --- API Call Functions ---
  async function getSummary(transcript) {
    qqaResponse.textContent = 'Summarizing...';
    try {
      const { provider, apiKey, vercelUrl } = await new Promise(resolve => chrome.storage.local.get(['provider', 'apiKey', 'vercelUrl'], resolve));
      if (!vercelUrl) {
        qqaResponse.textContent = 'Please set the Vercel URL in the settings.';
        return;
      }
      const res = await fetch(`${vercelUrl}/api/answer`, {
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
      const { provider, apiKey, vercelUrl } = await new Promise(resolve => chrome.storage.local.get(['provider', 'apiKey', 'vercelUrl'], resolve));
      if (!vercelUrl) {
        qqaResponse.textContent = 'Please set the Vercel URL in the settings.';
        return;
      }
      const res = await fetch(`${vercelUrl}/api/answer`, {
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
