document.addEventListener('DOMContentLoaded', () => {
  const toggleTabAudio = document.getElementById('toggle-tab-audio');
  const toggleMicAudio = document.getElementById('toggle-mic-audio');
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
  const annotateImageBtn = document.getElementById('annotate-image');
  const saveAnnotationBtn = document.getElementById('save-annotation');
  const annotationCanvas = document.getElementById('annotation-canvas');
  const providerSelect = document.getElementById('provider-select');
  const saveSettingsBtn = document.getElementById('save-settings');
  const vercelUrlInput = document.getElementById('vercel-url-input');
  const notificationToggle = document.getElementById('notification-toggle');
  const ttsToggle = document.getElementById('tts-toggle');
  const speakResponseBtn = document.getElementById('speak-response');
  const micIcon = document.getElementById('mic-icon');

  let fullTranscript = '';
  let screenshotUrl = null;
  let isDrawing = false;
  let lastX = 0;
  let lastY = 0;
  let notificationsEnabled = true;
  let ttsEnabled = true;
  let isMicRecording = false;
  let micRecognition = null;

  const modelSelect = document.getElementById('model-select');
  const waveformBars = document.querySelectorAll('.waveform .bar');

  // Load settings
  chrome.storage.local.get(['provider', 'vercelUrl', 'model', 'notifications', 'tts'], (res) => {
    if (res.provider) providerSelect.value = res.provider;
    else providerSelect.value = 'openai';
    if (res.vercelUrl) vercelUrlInput.value = res.vercelUrl;
    if (res.model) modelSelect.value = res.model;
    else modelSelect.value = 'gpt-5';
    
    notificationsEnabled = res.notifications !== false;
    ttsEnabled = res.tts !== false;
    
    updateStatusIndicators();
  });

  // Request notification permission
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Update status indicators
  function updateStatusIndicators() {
    const notificationStatus = document.getElementById('notification-status');
    const ttsStatus = document.getElementById('tts-status');
    
    notificationStatus.style.opacity = notificationsEnabled ? '1' : '0.3';
    ttsStatus.style.opacity = ttsEnabled ? '1' : '0.3';
  }

  // Notification toggle
  notificationToggle.addEventListener('click', () => {
    notificationsEnabled = !notificationsEnabled;
    chrome.storage.local.set({ notifications: notificationsEnabled });
    updateStatusIndicators();
    
    if (notificationsEnabled && Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  });

  // TTS toggle
  ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    chrome.storage.local.set({ tts: ttsEnabled });
    updateStatusIndicators();
  });

  // Text-to-speech function
  function speakText(text) {
    if (!ttsEnabled) return;
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    utterance.volume = 0.8;
    speechSynthesis.speak(utterance);
  }

  // Speak response button
  speakResponseBtn.addEventListener('click', () => {
    const responseText = qqaResponse.textContent || qqaResponse.innerText;
    if (responseText && responseText.trim() !== '') {
      speakText(responseText);
    }
  });

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

  // Microphone recording for Q&A
  function initializeMicRecording() {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      micRecognition = new SpeechRecognition();
      micRecognition.continuous = true;
      micRecognition.interimResults = true;
      micRecognition.lang = 'en-US';
      
      micRecognition.onstart = () => {
        isMicRecording = true;
        micIcon.textContent = '🔴';
        toggleMicAudio.textContent = '🔴 Stop Microphone';
        statusText.textContent = 'Status: Microphone Active';
      };
      
      micRecognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        fullTranscript += transcript + ' ';
        transcriptPopup.textContent = fullTranscript;
        transcriptPopup.classList.remove('hidden');
      };
      
      micRecognition.onend = () => {
        isMicRecording = false;
        micIcon.textContent = '🎤';
        toggleMicAudio.textContent = '🎤 Microphone';
        statusText.textContent = 'Status: Inactive';
      };
      
      micRecognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        isMicRecording = false;
        micIcon.textContent = '🎤';
        toggleMicAudio.textContent = '🎤 Microphone';
      };
    }
  }

  // Initialize microphone recording
  initializeMicRecording();

  // Microphone toggle
  toggleMicAudio.addEventListener('click', () => {
    if (!micRecognition) {
      qqaResponse.textContent = 'Speech recognition not supported in this browser.';
      return;
    }
    
    if (isMicRecording) {
      micRecognition.stop();
    } else {
      micRecognition.start();
    }
  });

  // Canvas annotation setup
  function setupAnnotationCanvas() {
    const ctx = annotationCanvas.getContext('2d');
    ctx.strokeStyle = '#ff0000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    annotationCanvas.addEventListener('mousedown', (e) => {
      isDrawing = true;
      [lastX, lastY] = [e.offsetX, e.offsetY];
    });

    annotationCanvas.addEventListener('mousemove', (e) => {
      if (!isDrawing) return;
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      [lastX, lastY] = [e.offsetX, e.offsetY];
    });

    annotationCanvas.addEventListener('mouseup', () => isDrawing = false);
    annotationCanvas.addEventListener('mouseout', () => isDrawing = false);
  }

  setupAnnotationCanvas();

  // Listen to messages from background
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'recording-started') {
      updateUIRecording();
      if (notificationsEnabled) {
        chrome.runtime.sendMessage({ type: 'show-notification', title: 'AI Meeting Assistant', body: 'Recording started' });
      }
    }
    if (message.type === 'recording-stopped') {
      updateUIIdle();
      if (notificationsEnabled) {
        chrome.runtime.sendMessage({ type: 'show-notification', title: 'AI Meeting Assistant', body: 'Recording stopped' });
      }
    }
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
    const vercelUrl = vercelUrlInput.value;
    const model = modelSelect.value;
    chrome.storage.local.set({ provider, vercelUrl, model, notifications: notificationsEnabled, tts: ttsEnabled }, () => {
      saveSettingsBtn.textContent = 'Saved!';
      setTimeout(() => { saveSettingsBtn.textContent = 'Save Settings'; }, 1500);
    });
  });

  // Q&A Mic for voice input
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
          
          // Setup canvas with screenshot
          const ctx = annotationCanvas.getContext('2d');
          const img = new Image();
          img.onload = () => {
            annotationCanvas.width = img.width * 0.5;
            annotationCanvas.height = img.height * 0.5;
            ctx.drawImage(img, 0, 0, annotationCanvas.width, annotationCanvas.height);
          };
          img.src = url;
          
          summarizeImageBtn.classList.remove('hidden');
          annotateImageBtn.classList.remove('hidden');
          captureScreenBtn.classList.add('hidden');
        } else {
          qqaResponse.textContent = 'Failed to capture screenshot.';
        }
      });
    });
  });

  // Annotation functionality
  annotateImageBtn.addEventListener('click', () => {
    screenshotPreview.classList.add('hidden');
    annotationCanvas.classList.remove('hidden');
    saveAnnotationBtn.classList.remove('hidden');
    annotateImageBtn.textContent = '✏️ Annotating...';
  });

  saveAnnotationBtn.addEventListener('click', () => {
    screenshotUrl = annotationCanvas.toDataURL();
    screenshotPreview.src = screenshotUrl;
    annotationCanvas.classList.add('hidden');
    screenshotPreview.classList.remove('hidden');
    saveAnnotationBtn.classList.add('hidden');
    annotateImageBtn.textContent = '✏️ Annotate';
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

  // Enhanced API Call Functions
  async function makeApiCall(payload, retries = 3) {
    const { provider, vercelUrl, model } = await new Promise(resolve => 
      chrome.storage.local.get(['provider', 'vercelUrl', 'model'], resolve)
    );
    
    if (!vercelUrl) {
      throw new Error('Please set the Vercel URL in the settings.');
    }
    
    const useGPT5 = model === 'gpt-5';
    const requestPayload = {
      ...payload,
      provider: provider || 'openai',
      useGPT5: useGPT5
    };
    
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const res = await fetch(`${vercelUrl}/api/answer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestPayload)
        });
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        if (data.error) {
          throw new Error(data.error);
        }
        
        return data;
      } catch (error) {
        if (attempt === retries) {
          throw error;
        }
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }
  }
  
  async function getSummary(transcript) {
    qqaResponse.textContent = 'Analyzing with AI...';
    try {
      const data = await makeApiCall({
        transcript: `Please provide a concise summary with key points and action items from this meeting transcript: ${transcript}`
      });
      const response = data.answer || 'No summary received.';
      qqaResponse.innerHTML = formatResponse(response);
      
      if (ttsEnabled) {
        speakText("Summary ready. " + response.substring(0, 100) + "...");
      }
      
      if (notificationsEnabled) {
        chrome.runtime.sendMessage({ type: 'show-notification', title: 'AI Meeting Assistant', body: 'Summary ready' });
      }
    } catch (error) {
      qqaResponse.textContent = `Error: ${error.message}`;
      console.error('Summary error:', error);
    }
  }
  
  function formatResponse(text) {
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>');
  }

  async function getSummaryForImage(imageUrl) {
    qqaResponse.textContent = 'Analyzing image with AI...';
    try {
      const data = await makeApiCall({ imageUrl });
      const response = data.answer || 'No analysis received.';
      qqaResponse.innerHTML = formatResponse(response);
      
      if (ttsEnabled) {
        speakText("Image analysis ready. " + response.substring(0, 100) + "...");
      }
      
      if (notificationsEnabled) {
        chrome.runtime.sendMessage({ type: 'show-notification', title: 'AI Meeting Assistant', body: 'Image analysis ready' });
      }
    } catch (error) {
      qqaResponse.textContent = `Error: ${error.message}`;
      console.error('Image analysis error:', error);
    }
  }
  
  // Enhanced Q&A functionality
  askInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter' && askInput.value.trim()) {
      const question = askInput.value.trim();
      const context = fullTranscript ? `Context: ${fullTranscript}\n\nQuestion: ${question}` : question;
      
      qqaResponse.textContent = 'Getting AI response...';
      try {
        const data = await makeApiCall({ transcript: context });
        const response = data.answer || 'No response received.';
        qqaResponse.innerHTML = formatResponse(response);
        askInput.value = '';
        
        if (ttsEnabled) {
          speakText(response);
        }
        
        if (notificationsEnabled) {
          chrome.runtime.sendMessage({ type: 'show-notification', title: 'AI Meeting Assistant', body: 'AI response ready' });
        }
      } catch (error) {
        qqaResponse.textContent = `Error: ${error.message}`;
      }
    }
  });
});
