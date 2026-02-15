document.addEventListener('DOMContentLoaded', () => {
  // UI References
  const mainRecordBtn = document.getElementById('main-record-toggle');
  const listenMode = document.getElementById('listen-mode');
  const transcriptEl = document.getElementById('live-transcript');
  const statusText = document.getElementById('status-text');
  const liveDot = document.getElementById('live-dot');
  const waveform = document.getElementById('waveform');
  const bars = waveform.querySelectorAll('.bar');

  const captureBtn = document.getElementById('capture-screen');
  const previewArea = document.getElementById('capture-preview-area');
  const screenshotPreview = document.getElementById('screenshot-preview');
  const annotationCanvas = document.getElementById('annotation-canvas');
  const annotateBtn = document.getElementById('annotate-image');
  const saveEditsBtn = document.getElementById('save-annotation');
  const summarizeImageBtn = document.getElementById('summarize-image');

  const askInput = document.getElementById('ask-input');
  const sendAskBtn = document.getElementById('send-ask');
  const qqaResponse = document.getElementById('qqa-response');
  const summarizeBtn = document.getElementById('summarize');
  const dashboardLink = document.getElementById('dashboard-link');

  const providerSelect = document.getElementById('provider-select');
  const modelSelect = document.getElementById('model-select');
  const urlInput = document.getElementById('vercel-url-input');
  const saveSettingsBtn = document.getElementById('save-settings');

  // State
  let isRecording = false;
  let screenshotDataUrl = null;
  let aggregatedTranscript = '';
  let sessionId = crypto.randomUUID();
  let ttsEnabled = true;

  // Initial Load
  chrome.storage.local.get(['provider', 'model', 'vercelUrl', 'tts', 'isRecording'], (s) => {
    providerSelect.value = s.provider || 'google';
    modelSelect.value = s.model || (s.provider === 'openai' ? 'gpt-4o' : 'gemini-1.5-flash');
    urlInput.value = s.vercelUrl || 'https://spatial-expanse.vercel.app';
    ttsEnabled = s.tts !== false;

    // Resume state if background is already recording
    chrome.runtime.sendMessage({ type: 'get-state' }, (res) => {
      if (res && res.isRecording) {
        updateUIStarted();
      }
    });
  });

  // Settings
  saveSettingsBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      provider: providerSelect.value,
      model: modelSelect.value,
      vercelUrl: urlInput.value
    }, () => toast('Configuration updated'));
  });

  // Recording Logic
  mainRecordBtn.addEventListener('click', () => {
    if (!isRecording) {
      startSession();
    } else {
      stopSession();
    }
  });

  function startSession() {
    sessionId = crypto.randomUUID();
    aggregatedTranscript = '';
    transcriptEl.innerHTML = '<div class="transcribing">Connecting to audio stream...</div>';

    chrome.runtime.sendMessage({ type: 'toggle-recording' }, (response) => {
      if (chrome.runtime.lastError) {
        toast('Extension Sync Error: ' + chrome.runtime.lastError.message);
        updateUIStopped();
        return;
      }
      updateUIStarted();
    });
  }

  function stopSession() {
    chrome.runtime.sendMessage({ type: 'toggle-recording' });
    updateUIStopped();
    saveSessionToDashboard();
  }

  function updateUIStarted() {
    isRecording = true;
    mainRecordBtn.innerHTML = '<span class="icon">⏹️</span> Stop Recording';
    mainRecordBtn.classList.add('recording');
    statusText.textContent = 'Recording Live';
    liveDot.classList.remove('hidden');
  }

  function updateUIStopped() {
    isRecording = false;
    mainRecordBtn.innerHTML = '<span class="icon">🔴</span> Start Recording';
    mainRecordBtn.classList.remove('recording');
    statusText.textContent = 'Inactive';
    liveDot.classList.add('hidden');
    bars.forEach(b => { b.style.height = '4px'; b.style.opacity = '0.2'; });
  }

  // Capture Screen
  captureBtn.addEventListener('click', async () => {
    // Check if we have host permissions for the current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }, (dataUrl) => {
      if (chrome.runtime.lastError) {
        const err = chrome.runtime.lastError.message;
        if (err.includes('permission')) {
          toast('🔒 Access Denied: Right-click the extension icon -> "This can read and change site data" -> "On all sites"');
        } else {
          toast('Capture Error: ' + err);
        }
        return;
      }
      if (!dataUrl) { toast('Capture failed'); return; }

      screenshotDataUrl = dataUrl;
      screenshotPreview.src = dataUrl;
      previewArea.classList.remove('hidden');
      screenshotPreview.classList.remove('hidden');
      annotationCanvas.classList.add('hidden');
      annotateBtn.classList.remove('hidden');
      saveEditsBtn.classList.add('hidden');

      previewArea.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Annotation Logic
  let drawing = false, lx = 0, ly = 0;
  annotateBtn.addEventListener('click', () => {
    const img = new Image();
    img.onload = () => {
      screenshotPreview.classList.add('hidden');
      annotationCanvas.classList.remove('hidden');
      const ctx = annotationCanvas.getContext('2d');
      const scale = Math.min(1, 400 / img.width);
      annotationCanvas.width = img.width * scale;
      annotationCanvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, annotationCanvas.width, annotationCanvas.height);
      ctx.lineWidth = 4; ctx.strokeStyle = '#58a6ff'; ctx.lineCap = 'round';

      annotationCanvas.onmousedown = e => { drawing = true;[lx, ly] = [e.offsetX, e.offsetY]; };
      annotationCanvas.onmousemove = e => {
        if (!drawing) return;
        ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(e.offsetX, e.offsetY);
        ctx.stroke();[lx, ly] = [e.offsetX, e.offsetY];
      };
      annotationCanvas.onmouseup = () => drawing = false;

      annotateBtn.classList.add('hidden');
      saveEditsBtn.classList.remove('hidden');
    };
    img.src = screenshotDataUrl;
  });

  saveEditsBtn.addEventListener('click', () => {
    screenshotDataUrl = annotationCanvas.toDataURL('image/png');
    annotationCanvas.classList.add('hidden');
    screenshotPreview.src = screenshotDataUrl;
    screenshotPreview.classList.remove('hidden');
    saveEditsBtn.classList.add('hidden');
    annotateBtn.classList.remove('hidden');
  });

  // AI Logic
  summarizeImageBtn.addEventListener('click', async () => {
    if (!screenshotDataUrl) return;
    qqaResponse.classList.remove('hidden');
    qqaResponse.textContent = 'AI is observing screen...';
    try {
      const data = await apiCall({ imageBase64: screenshotDataUrl });
      qqaResponse.innerHTML = formatAIResponse(data.answer || 'No analysis available.');
    } catch (e) {
      qqaResponse.innerHTML = `<span style="color:var(--danger)">Analysis Error: ${e.message}</span>`;
    }
  });

  summarizeBtn.addEventListener('click', async () => {
    if (!aggregatedTranscript.trim()) return toast('No transcript to summarize');
    qqaResponse.classList.remove('hidden');
    qqaResponse.textContent = 'Deep-summarizing meeting points...';
    try {
      const data = await apiCall({
        transcript: `Provide a detailed meeting summary with action items from this transcript:\n\n${aggregatedTranscript}`
      });
      qqaResponse.innerHTML = formatAIResponse(data.answer);
    } catch (e) {
      qqaResponse.textContent = 'Summary failed: ' + e.message;
    }
  });

  const sendQuestion = async () => {
    const q = askInput.value.trim();
    if (!q) return;
    askInput.value = '';
    qqaResponse.classList.remove('hidden');
    qqaResponse.textContent = 'Reasoning...';
    try {
      const ctx = aggregatedTranscript ? `Transcript Context:\n${aggregatedTranscript}\n\n` : '';
      const data = await apiCall({ transcript: ctx + 'User Question: ' + q });
      qqaResponse.innerHTML = formatAIResponse(data.answer);
    } catch (e) {
      qqaResponse.textContent = 'Error: ' + e.message;
    }
  };

  askInput.addEventListener('keypress', e => e.key === 'Enter' && sendQuestion());
  sendAskBtn.addEventListener('click', sendQuestion);

  // Background Messages
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'recording-started') updateUIStarted();
    if (msg.type === 'recording-stopped') updateUIStopped();

    if (msg.type === 'volume') {
      const v = Math.min(1, msg.value || 0);
      bars.forEach((b, i) => {
        const scale = Math.max(0.1, v * (0.6 + i * 0.15));
        b.style.height = `${4 + scale * 20}px`;
        b.style.opacity = 0.2 + scale * 0.8;
      });
    }

    if (msg.type === 'transcript-chunk') {
      const text = msg.text || '';
      aggregatedTranscript += text + ' ';
      transcriptEl.innerHTML = aggregatedTranscript.trim();
      if (transcriptEl.querySelectorAll('.empty-state').length) transcriptEl.innerHTML = text;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
    }

    if (msg.type === 'error') toast(msg.message);
  });

  // Local Helpers
  async function apiCall(payload) {
    const { provider, vercelUrl, model } = await new Promise(r => chrome.storage.local.get(['provider', 'vercelUrl', 'model'], r));
    const url = vercelUrl || 'https://spatial-expanse.vercel.app';
    const res = await fetch(`${url}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider || 'google', model, ...payload })
    });
    if (!res.ok) throw new Error(`Server returned ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function saveSessionToDashboard() {
    chrome.storage.local.get(['vercelUrl'], async (s) => {
      const url = s.vercelUrl || 'https://spatial-expanse.vercel.app';
      try {
        await fetch(`${url}/api/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: sessionId,
            timestamp: new Date().toISOString(),
            transcript: aggregatedTranscript,
            title: 'Meeting ' + new Date().toLocaleTimeString()
          })
        });
      } catch (e) { console.error('Dashboard sync failed', e); }
    });
  }

  function formatAIResponse(t) {
    if (!t) return 'No response.';
    return t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
      .replace(/\*(.*?)\*/g, '<i>$1</i>')
      .replace(/\n/g, '<br>');
  }

  function toast(msg) {
    console.log('[AI Assistant]', msg);
    // Simple UI feedback if possible, or just console
    const t = document.createElement('div');
    t.style = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#21262d;color:#fff;padding:8px 16px;border-radius:20px;font-size:12px;z-index:9999;border:1px solid #30363d;box-shadow:0 8px 24px rgba(0,0,0,0.5);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  dashboardLink.onclick = () => {
    chrome.storage.local.get(['vercelUrl'], s => {
      chrome.tabs.create({ url: s.vercelUrl || 'https://spatial-expanse.vercel.app' });
    });
  };
});
