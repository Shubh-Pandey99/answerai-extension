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
  const speakBtn = document.getElementById('speak-response');

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

  // Load settings
  chrome.storage.local.get(['provider','model','vercelUrl','notifications','tts'], (s) => {
    providerSelect.value = s.provider || 'google';
    modelSelect.value = s.model || (s.provider === 'openai' ? 'gpt-4o' : 'gemini-2.5-pro');
    urlInput.value = s.vercelUrl || 'http://127.0.0.1:5055';
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
    if (notificationsEnabled && Notification.permission === 'default') Notification.requestPermission();
    toast('Notifications ' + (notificationsEnabled ? 'on' : 'off'));
  });
  ttsToggle.addEventListener('click', () => {
    ttsEnabled = !ttsEnabled;
    toast('TTS ' + (ttsEnabled ? 'on' : 'off'));
  });

  // Listen mode (tab audio capture)
  listenMode.addEventListener('change', () => {
    chrome.runtime.sendMessage({ type: 'toggle-recording' });
  });

  // Mic dictation (for building the transcript inside popup)
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

      // Draw into canvas for annotation prep
      const img = new Image();
      img.onload = () => {
        const ctx = annotationCanvas.getContext('2d');
        const scale = Math.min(1, 800 / img.width);
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
    ctx.lineWidth = 3; ctx.strokeStyle = '#ff5b5b'; ctx.lineCap = 'round';
    annotationCanvas.onmousedown = e => { drawing = true; [lx, ly] = [e.offsetX, e.offsetY]; };
    annotationCanvas.onmousemove = e => {
      if (!drawing) return; ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(e.offsetX, e.offsetY); ctx.stroke(); [lx, ly] = [e.offsetX, e.offsetY];
    };
    annotationCanvas.onmouseup = () => drawing = false;
    annotationCanvas.onmouseleave = () => drawing = false;
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
    qqaResponse.textContent = 'Analyzing image...';
    try {
      const data = await apiCall({ imageBase64: screenshotDataUrl });
      const text = data.answer || 'No analysis received.';
      qqaResponse.innerHTML = format(text);
      if (ttsEnabled) speak('Image analysis ready. ' + text.slice(0, 120));
      notify('Image analysis ready');
    } catch (e) {
      qqaResponse.textContent = 'Error: ' + e.message;
    }
  });

  // Summarize transcript
  summarizeBtn.addEventListener('click', async () => {
    const text = transcriptEl.textContent.trim() || aggregatedTranscript.trim();
    if (!text) return toast('Nothing to summarize');
    qqaResponse.textContent = 'Summarizing...';
    try {
      const data = await apiCall({
        transcript: `Summarize key points and action items from this meeting:\n\n${text}`
      });
      const out = data.answer || 'No summary received.';
      qqaResponse.innerHTML = format(out);
      if (ttsEnabled) speak('Summary ready. ' + out.slice(0, 120));
      notify('Summary ready');
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
    qqaResponse.textContent = 'Thinking...';
    try {
      const ctx = transcriptEl.textContent ? `Context:\n${transcriptEl.textContent}\n\n` : '';
      const data = await apiCall({ transcript: ctx + 'Question: ' + question });
      qqaResponse.innerHTML = format(data.answer || 'No response.');
      speak(data.answer || '');
      notify('Answer ready');
    } catch (err) {
      qqaResponse.textContent = 'Error: ' + err.message;
    }
  });

  // TALK to background: live transcription state & volume
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'recording-started') {
      statusText.textContent = 'Status: Activating...';
      liveDot.classList.remove('hidden');
    }
    if (msg.type === 'recording-stopped') {
      statusText.textContent = 'Status: Inactive';
      liveDot.classList.add('hidden');
      bars.forEach(b => { b.style.height = '6px'; b.style.opacity = .35; });
    }
    if (msg.type === 'volume') {
      const v = Math.min(1, msg.value || 0);
      bars.forEach((b,i) => {
        const scale = Math.max(0.08, v * (0.5 + i*0.12));
        b.style.height = `${6 + scale*26}px`;
        b.style.opacity = 0.3 + scale*0.6;
      });
      statusText.textContent = 'Status: Live';
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
  function toast(t){ console.log('[AI Assistant]', t); }
  function speak(t){ if (!t || !ttsEnabled) return; const u = new SpeechSynthesisUtterance(t); u.rate=.95; speechSynthesis.speak(u); }
  function notify(msg){
    if (!notificationsEnabled) return;
    if (Notification.permission === 'granted') new Notification('AI Meeting Assistant', { body: msg, icon: chrome.runtime.getURL('icon.png') });
  }
  function format(t){ return t.replace(/\*\*(.*?)\*\*/g,'<b>$1</b>').replace(/\*(.*?)\*/g,'<i>$1</i>').replace(/\n/g,'<br>'); }

  async function apiCall(payload){
    const { provider, vercelUrl, model } = await new Promise(r => chrome.storage.local.get(['provider','vercelUrl','model'], r));
    if (!vercelUrl) throw new Error('Set API URL in Settings');
    return fetch(`${vercelUrl}/api/answer`, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        provider: (provider||'google'),
        model,
        ...payload
      })
    }).then(async res => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    });
  }
});
