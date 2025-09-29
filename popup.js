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
  let screenshotUrl = null;

  // Request initial state from background for tab recording
  chrome.runtime.sendMessage({ type: 'get-state' }, (response) => {
    if (response && response.isRecording) {
      updateUIRecording();
    } else {
      updateUIIdle();
    }
  });

  // Listener for tab recording state changes
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
    };
    recognition.onresult = (event) => {
      askInput.value = event.results[0][0].transcript;
    };
    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      askInput.placeholder = 'Error listening.';
    };
    recognition.onend = () => {
      askInput.placeholder = 'Ask anything...';
    };
    recognition.start();
  });

  // Screen capture functionality
  captureScreenBtn.addEventListener('click', () => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (url) => {
      if (url) {
        screenshotUrl = url;
        screenshotPreview.src = url;
        screenshotPreview.classList.remove('hidden');
        summarizeImageBtn.classList.remove('hidden');
        captureScreenBtn.classList.add('hidden');
      } else {
        console.error('Could not capture screenshot.');
        qqaResponse.textContent = 'Failed to capture screenshot.';
      }
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
    const transcript = transcriptPopup.textContent;
    if (transcript && transcript !== 'Nothing to summarize yet.') {
      getSummary(transcript);
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
      const res = await fetch('http://localhost:3000/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: `Summarize this: ${transcript}` })
      });
      const data = await res.json();
      qqaResponse.textContent = data.answer;
    } catch (error) {
      console.error('Error getting summary:', error);
      qqaResponse.textContent = 'Error summarizing transcript. Is the server running?';
    }
  }

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
      qqaResponse.textContent = 'Error analyzing image. Is the server running?';
    }
  }
});
