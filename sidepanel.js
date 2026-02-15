document.addEventListener('DOMContentLoaded', () => {
  // UI refs
  const listenMode = document.getElementById('listen-mode');
  const toggleMic = document.getElementById('toggle-mic');
  const micIcon = document.getElementById('mic-icon');
  const waveform = document.getElementById('waveform');
  const bars = waveform.querySelectorAll('.bar');
  const transcriptEl = document.getElementById('live-transcript');
  const statusText = document.getElementById('status-text');
  const liveDot = document.getElementById('live-dot');

  const captureBtn = document.getElementById('capture-screen');
  const summarizeImageBtn = document.getElementById('summarize-image');
  const annotateBtn = document.getElementById('annotate-image');
  const saveAnnotationBtn = document.getElementById('save-annotation');
  const screenshotPreview = document.getElementById('screenshot-preview');
  const annotationCanvas = document.getElementById('annotation-canvas');

  const askInput = document.getElementById('ask-input');
  const qqaResponse = document.getElementById('qqa-response');
  const summarizeBtn = document.getElementById('summarize');
  const dashboardLink = document.getElementById('dashboard-link');

  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const urlInput = document.getElementById('vercel-url-input');
  const saveSettingsBtn = document.getElementById('save-settings');
  const notifToggle = document.getElementById('notification-toggle');
  const ttsToggle = document.getElementById('tts-toggle');

  // State
  let screenshotDataUrl = null;
  let notificationsEnabled = true;
  let ttsEnabled = true;
  let micRecognition = null;
  let isMicDictating = false;
  let aggregatedTranscript = '';
  let sessionId = crypto.randomUUID();

  chrome.storage.local.get(['provider', 'model', 'vercelUrl', 'notifications', 'tts'], (s) => {
    providerSelect.value = s.provider || 'google';
    modelSelect.value = s.model || (s.provider === 'openai' ? 'gpt-4o' : 'gemini-1.5-flash');
    urlInput.value = s.vercelUrl || 'https://spatial-expanse.vercel.app'; // Pre-fill with cloud URL
    notificationsEnabled = s.notifications !== false;
    ttsEnabled = s.tts !== false;
  });

  // Save settings
  saveSettingsBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      provider: providerSelect.value,
      model: modelSelect.value,
      vercelUrl: urlInput.value,
      notifications: notificationsEnabled,
      tts: ttsEnabled
    }, () => {
      toast('Settings saved');
    });
  });

  // Notifications & TTS toggles
  notifToggle.addEventListener('click', () => {
    notificationsEnabled = !notificationsEnabled;
    if (notificationsEnabled) Notification.requestPermission();
    toast('Notifications ' + (notificationsEnabled ? 'on' : 'off'));
  });
  ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    toast('TTS ' + (ttsEnabled ? 'on' : 'off'));
  });

  // Open Dashboard
  dashboardLink.addEventListener('click', () => {
    chrome.storage.local.get(['vercelUrl'], (s) => {
      const dashboardUrl = s.vercelUrl || 'https://spatial-expanse.vercel.app';
      chrome.tabs.create({ url: dashboardUrl });
    });
  });

  // Listen mode (tab audio capture)
  listenMode.addEventListener('change', () => {
    if (listenMode.checked) {
      chrome.runtime.sendMessage({ type: 'toggle-recording' });
      sessionId = crypto.randomUUID();
      aggregatedTranscript = '';
      transcriptEl.textContent = 'Recording started...';
    } else {
      chrome.runtime.sendMessage({ type: 'toggle-recording' });
      saveSessionToDashboard();
    }
  });

  // Mic dictation
  toggleMic.addEventListener('click', () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast('Speech recognition not supported'); return; }
    if (!micRecognition) {
      micRecognition = new SR();
      micRecognition.lang = 'en-US';
      micRecognition.continuous = true;
      micRecognition.interimResults = true;
      micRecognition.onstart = () => { isMicDictating = true; micIcon.textContent = '🔴'; };
      micRecognition.onend = () => { isMicDictating = false; micIcon.textContent = '🎤'; };
      micRecognition.onerror = () => { isMicDictating = false; micIcon.textContent = '🎤'; };
      micRecognition.onresult = (e) => {
        let s = '';
        for (let i = e.resultIndex; i < e.results.length; i++) s += e.results[i][0].transcript;
        aggregatedTranscript += s + ' ';
        transcriptEl.textContent = aggregatedTranscript;
        transcriptEl.scrollTop = transcriptEl.scrollHeight;
      };
    }
    if (isMicDictating) micRecognition.stop(); else micRecognition.start();
  });

  // Screen capture
  captureBtn.addEventListener('click', () => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (dataUrl) => {
      if (!dataUrl) { toast('Capture failed'); return; }
      screenshotDataUrl = dataUrl;
      screenshotPreview.src = dataUrl;
      screenshotPreview.classList.remove('hidden');

      const img = new Image();
      img.onload = () => {
        const ctx = annotationCanvas.getContext('2d');
        const scale = Math.min(1, 400 / img.width);
        annotationCanvas.width = img.width * scale;
        annotationCanvas.height = img.height * scale;
        ctx.drawImage(img, 0, 0, annotationCanvas.width, annotationCanvas.height);
        annotateBtn.classList.remove('hidden');
        saveAnnotationBtn.classList.add('hidden');
        summarizeImageBtn.classList.remove('hidden');
      };
      img.src = dataUrl;
    });
  });

  // Annotate
  let drawing = false, lx = 0, ly = 0;
  annotateBtn.addEventListener('click', () => {
    screenshotPreview.classList.add('hidden');
    annotationCanvas.classList.remove('hidden');
    const ctx = annotationCanvas.getContext('2d');
    ctx.lineWidth = 3; ctx.strokeStyle = '#4b8bff'; ctx.lineCap = 'round';
    annotationCanvas.onmousedown = e => { drawing = true;[lx, ly] = [e.offsetX, e.offsetY]; };
    annotationCanvas.onmousemove = e => {
      if (!drawing) return; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke();[lx, ly] = [e.offsetX, e.offsetY];
    };
    annotationCanvas.onmouseup = () => drawing = false;
    saveAnnotationBtn.classList.remove('hidden');
  });

  saveAnnotationBtn.addEventListener('click', () => {
    screenshotDataUrl = annotationCanvas.toDataURL('image/png');
    annotationCanvas.classList.add('hidden');
    screenshotPreview.src = screenshotDataUrl;
    screenshotPreview.classList.remove('hidden');
    saveAnnotationBtn.classList.add('hidden');
  });

  // Summarize image
  summarizeImageBtn.addEventListener('click', async () => {
    if (!screenshotDataUrl) return toast('No screenshot captured');
    qqaResponse.classList.remove('hidden');
    qqaResponse.textContent = 'AI is analyzing...';
    try {
      const data = await apiCall({ imageBase64: screenshotDataUrl });
      const text = data.answer || 'No analysis received.';
      qqaResponse.innerHTML = format(text);
      if (ttsEnabled) speak('Image analysis ready.');
      notify('Image analysis ready');
    } catch (e) {
      qqaResponse.textContent = 'Error: ' + e.message;
    }
  });

  // Summarize transcript
  summarizeBtn.addEventListener('click', async () => {
    const text = aggregatedTranscript.trim();
    if (!text) return toast('Nothing to summarize');
    qqaResponse.classList.remove('hidden');
    qqaResponse.textContent = 'Generating summary...';
    try {
      const data = await apiCall({
        transcript: `Provide a professional summary with key takeaways and action items:\n\n${text}`
      });
      const out = data.answer || 'No summary received.';
      qqaResponse.innerHTML = format(out);
      if (ttsEnabled) speak('Summary ready.');
    } catch (e) {
      qqaResponse.textContent = 'Error: ' + e.message;
    }
  });

  // Ask box
  askInput.addEventListener('keypress', async (e) => {
    if (e.key !== 'Enter') return;
    const question = askInput.value.trim();
    if (!question) return;
    askInput.value = '';
    qqaResponse.classList.remove('hidden');
    qqaResponse.textContent = 'Thinking...';
    try {
      const ctx = aggregatedTranscript ? `Context:\n${aggregatedTranscript}\n\n` : '';
      const data = await apiCall({ transcript: ctx + 'Question: ' + question });
      qqaResponse.innerHTML = format(data.answer || 'No response.');
      speak(data.answer || '');
    } catch (err) {
      qqaResponse.textContent = 'Error: ' + err.message;
    }
  });

  // Listen for messages from background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'recording-started') {
      statusText.textContent = 'Status: Live';
      liveDot.classList.remove('hidden');
      listenMode.checked = true;
    }
    if (msg.type === 'recording-stopped') {
      statusText.textContent = 'Status: Inactive';
      liveDot.classList.add('hidden');
      listenMode.checked = false;
      bars.forEach(b => { b.style.height = '4px'; b.style.opacity = .35; });
    }
    if (msg.type === 'volume') {
      const v = Math.min(1, msg.value || 0);
      bars.forEach((b, i) => {
        const scale = Math.max(0.1, v * (0.6 + i * 0.1));
        b.style.height = `${4 + scale * 26}px`;
        b.style.opacity = 0.3 + scale * 0.7;
      });
    }
    if (msg.type === 'transcript-chunk') {
      aggregatedTranscript += (msg.text || '') + ' ';
      transcriptEl.textContent = aggregatedTranscript;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }
    if (msg.type === 'error') {
      toast(msg.message || 'Error');
    }
  });

  // Utils
  function toast(t) { console.log('[AI Assistant]', t); }
  function speak(t) { if (!t || !ttsEnabled) return; const u = new SpeechSynthesisUtterance(t); u.rate = .95; speechSynthesis.speak(u); }
  function notify(msg) {
    if (!notificationsEnabled) return;
    if (Notification.permission === 'granted') new Notification('AI Assistant', { body: msg, icon: 'icon.png' });
  }
  function format(t) { return t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\*(.*?)\*/g, '<i>$1</i>').replace(/\n/g, '<br>'); }

  async function apiCall(payload) {
    const { provider, vercelUrl, model } = await new Promise(r => chrome.storage.local.get(['provider', 'vercelUrl', 'model'], r));
    const url = vercelUrl || 'https://spatial-expanse.vercel.app';
    return fetch(`${url}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: (provider || 'google'), model, ...payload })
    }).then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    });
  }

  async function saveSessionToDashboard() {
    const { vercelUrl } = await new Promise(r => chrome.storage.local.get(['vercelUrl'], r));
    const url = vercelUrl || 'https://spatial-expanse.vercel.app';
    fetch(`${url}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sessionId,
        timestamp: new Date().toISOString(),
        transcript: aggregatedTranscript,
        title: 'Meeting ' + new Date().toLocaleTimeString()
      })
    }).catch(e => console.error('Failed to sync session', e));
  }
});
