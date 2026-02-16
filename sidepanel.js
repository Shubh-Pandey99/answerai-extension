document.addEventListener('DOMContentLoaded', () => {
  // --- UI References ---
  const body = document.body;
  const mainRecordBtn = document.getElementById('main-record-toggle');
  const recordText = document.getElementById('record-text');

  const emptyView = document.getElementById('empty-state');
  const transcriptView = document.getElementById('transcript-view');
  const captureView = document.getElementById('capture-view');
  const transcriptEl = document.getElementById('live-transcript');
  const activeCaptureImg = document.getElementById('active-capture-img');

  const toolbar = document.getElementById('contextual-toolbar');
  const transcriptTools = document.getElementById('transcript-tools');
  const imageTools = document.getElementById('image-tools');

  const captureBtn = document.getElementById('capture-screen');
  const emptyCaptureBtn = document.getElementById('empty-capture-btn');
  const deleteCaptureBtn = document.getElementById('delete-capture');
  const summarizeTranscriptBtn = document.getElementById('summarize-transcript');
  const extractTasksBtn = document.getElementById('extract-tasks');
  const analyzeImageBtn = document.getElementById('analyze-image');
  const ocrImageBtn = document.getElementById('ocr-image');

  const aiDrawer = document.getElementById('ai-drawer');
  const aiDrawerHandle = document.getElementById('ai-drawer-handle');
  const qqaResponse = document.getElementById('qqa-response');

  const askInput = document.getElementById('ask-input');
  const sendAskBtn = document.getElementById('send-ask');
  const copyTranscriptBtn = document.getElementById('copy-transcript');
  const clearTranscriptBtn = document.getElementById('clear-transcript');

  const modelSelect = document.getElementById('model-select');
  const urlInput = document.getElementById('vercel-url-input');
  const saveSettingsBtn = document.getElementById('save-settings');
  const dashboardLink = document.getElementById('dashboard-link');

  // --- State ---
  let isRecording = false;
  let activeCapture = null;
  let aggregatedTranscript = '';
  let sessionId = crypto.randomUUID();

  // --- Initial Load ---
  chrome.storage.local.get(['model', 'vercelUrl'], (s) => {
    if (s.model) modelSelect.value = s.model;
    if (s.vercelUrl) urlInput.value = s.vercelUrl;

    chrome.runtime.sendMessage({ type: 'get-state' }, (res) => {
      if (res && res.isRecording) {
        updateUIStarted();
        setMode('recording');
      }
    });
  });

  // --- UI Logic: Modes ---
  function setMode(mode) {
    // Possible: recording, captured, empty
    [emptyView, transcriptView, captureView, toolbar, transcriptTools, imageTools].forEach(el => el.classList.add('hidden'));

    if (mode === 'recording') {
      transcriptView.classList.remove('hidden');
      toolbar.classList.remove('hidden');
      transcriptTools.classList.remove('hidden');
    } else if (mode === 'captured') {
      captureView.classList.remove('hidden');
      toolbar.classList.remove('hidden');
      imageTools.classList.remove('hidden');
    } else {
      emptyView.classList.remove('hidden');
    }
  }

  // --- AI Drawer Controls ---
  aiDrawerHandle.onclick = () => {
    aiDrawer.classList.toggle('collapsed');
    aiDrawer.classList.toggle('expanded');
  };

  function updateAIResult(html, expand = true) {
    aiDrawer.classList.remove('hidden');
    qqaResponse.innerHTML = html;
    if (expand) {
      aiDrawer.classList.remove('collapsed');
      aiDrawer.classList.add('expanded');
    }
  }

  function showAILoading(text) {
    updateAIResult(`<div class="loading-state">${text}...</div>`, true);
  }

  // --- Recording Control ---
  mainRecordBtn.onclick = () => {
    if (!isRecording) startSession();
    else stopSession();
  };

  function startSession() {
    sessionId = crypto.randomUUID();
    aggregatedTranscript = '';
    transcriptEl.innerHTML = '';
    chrome.runtime.sendMessage({ type: 'toggle-recording' }, (response) => {
      if (chrome.runtime.lastError) return toast('Error: ' + chrome.runtime.lastError.message);
      updateUIStarted();
      setMode('recording');
    });
  }

  function stopSession() {
    chrome.runtime.sendMessage({ type: 'toggle-recording' });
    updateUIStopped();
    saveSessionToDashboard();
  }

  function updateUIStarted() {
    isRecording = true;
    mainRecordBtn.classList.add('recording');
    recordText.textContent = 'Stop';
  }

  function updateUIStopped() {
    isRecording = false;
    mainRecordBtn.classList.remove('recording');
    recordText.textContent = 'Record';
  }

  // --- Capture Flow ---
  captureBtn.onclick = async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 100 }, (dataUrl) => {
      if (chrome.runtime.lastError) return toast('Capture Error: ' + chrome.runtime.lastError.message);

      activeCapture = dataUrl;
      activeCaptureImg.src = dataUrl;
      setMode('captured');

      // Flash effect
      body.style.opacity = '0.5';
      setTimeout(() => body.style.opacity = '1', 100);
    });
  };

  emptyCaptureBtn.onclick = () => captureBtn.click();

  deleteCaptureBtn.onclick = () => {
    activeCapture = null;
    setMode('empty');
  };

  // --- AI Actions ---
  summarizeTranscriptBtn.onclick = async () => {
    if (!aggregatedTranscript.trim()) return toast('Nothing to summarize');
    showAILoading('Synthesizing transcript');
    try {
      const data = await apiCall({
        transcript: `Highlight the key points and decisions from this transcript:\n\n${aggregatedTranscript}`
      });
      updateAIResult(formatAIResponse(data.answer));
    } catch (e) {
      updateAIResult(`<span style="color:var(--danger)">Error: ${e.message}</span>`);
    }
  };

  extractTasksBtn.onclick = async () => {
    if (!aggregatedTranscript.trim()) return toast('Nothing to extract');
    showAILoading('Extracting action items');
    try {
      const data = await apiCall({
        transcript: `List only the action items and owners from this meeting:\n\n${aggregatedTranscript}`
      });
      updateAIResult(formatAIResponse(data.answer));
    } catch (e) {
      updateAIResult(`<span style="color:var(--danger)">Error: ${e.message}</span>`);
    }
  };

  analyzeImageBtn.onclick = async () => {
    if (!activeCapture) return;
    showAILoading('Analyzing screen');
    try {
      const data = await apiCall({ imageBase64: activeCapture });
      updateAIResult(formatAIResponse(data.answer));
    } catch (e) {
      updateAIResult(`<span style="color:var(--danger)">Error: ${e.message}</span>`);
    }
  };

  ocrImageBtn.onclick = async () => {
    if (!activeCapture) return;
    showAILoading('Extracting text from image');
    try {
      const data = await apiCall({
        imageBase64: activeCapture,
        transcript: "Extract all visible text from this image exactly as it appears."
      });
      updateAIResult(formatAIResponse(data.answer));
    } catch (e) {
      updateAIResult(`<span style="color:var(--danger)">Error: ${e.message}</span>`);
    }
  };

  const askAI = async () => {
    const q = askInput.value.trim();
    if (!q) return;
    askInput.value = '';

    showAILoading('Thinking');
    try {
      const payload = { transcript: q };
      if (activeCapture) payload.imageBase64 = activeCapture;
      // Add context if available
      if (aggregatedTranscript) payload.transcript = `Context:\n${aggregatedTranscript}\n\nUser Question: ${q}`;

      const data = await apiCall(payload);
      updateAIResult(formatAIResponse(data.answer));
    } catch (e) {
      updateAIResult(`<span style="color:var(--danger)">Error: ${e.message}</span>`);
    }
  };

  sendAskBtn.onclick = askAI;
  askInput.onkeypress = (e) => e.key === 'Enter' && askAI();

  // --- Messages listener ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'recording-started') { updateUIStarted(); setMode('recording'); }
    if (msg.type === 'recording-stopped') updateUIStopped();
    if (msg.type === 'trigger-capture') captureBtn.click();

    if (msg.type === 'transcript-chunk') {
      const text = msg.text || '';
      aggregatedTranscript += text + ' ';
      transcriptEl.innerHTML = aggregatedTranscript.trim();
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
      if (isRecording && transcriptView.classList.contains('hidden')) setMode('recording');
    }
  });

  // --- Helpers ---
  async function apiCall(payload) {
    const { provider, vercelUrl, model } = await new Promise(r => chrome.storage.local.get(['provider', 'vercelUrl', 'model'], r));
    const url = vercelUrl || 'https://spatial-expanse.vercel.app';
    const res = await fetch(`${url}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: provider || 'google', model, ...payload })
    });
    if (!res.ok) throw new Error(`Server ${res.status}`);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function formatAIResponse(t) {
    if (!t) return 'No response.';
    return t.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>');
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.style = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);background:#ef4444;color:#fff;padding:8px 16px;border-radius:20px;font-size:12px;z-index:9999;box-shadow:0 8px 24px rgba(0,0,0,0.5);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  // --- Utilites ---
  copyTranscriptBtn.onclick = () => {
    navigator.clipboard.writeText(aggregatedTranscript);
    toast('Copied to clipboard');
  };
  clearTranscriptBtn.onclick = () => {
    aggregatedTranscript = '';
    transcriptEl.innerHTML = '';
  };
  saveSettingsBtn.onclick = () => {
    chrome.storage.local.set({
      model: modelSelect.value,
      vercelUrl: urlInput.value
    }, () => toast('Settings Saved'));
  };
  dashboardLink.onclick = () => {
    chrome.storage.local.get(['vercelUrl'], s => {
      chrome.tabs.create({ url: s.vercelUrl || 'https://spatial-expanse.vercel.app' });
    });
  };

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
      } catch (e) { console.error('Sync failed', e); }
    });
  }
});
