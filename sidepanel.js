document.addEventListener('DOMContentLoaded', () => {
  // --- UI References ---
  const mainRecordBtn = document.getElementById('main-record-toggle');
  const recordText = document.getElementById('record-text');
  const liveIndicator = document.getElementById('live-indicator');

  const transcriptBox = document.getElementById('live-transcript');
  const copyTranscriptBtn = document.getElementById('copy-transcript');
  const clearTranscriptBtn = document.getElementById('clear-transcript');
  const regenerateSummaryBtn = document.getElementById('regenerate-summary');

  const captureBtn = document.getElementById('capture-screen');
  const summarizeBtn = document.getElementById('summarize-transcript');
  const analyzeVisionBtn = document.getElementById('analyze-vision');

  const capturePanel = document.getElementById('capture-panel');
  const captureGrid = document.getElementById('capture-grid');
  const captureCountBadge = document.getElementById('capture-count');
  const captureItemTemplate = document.getElementById('capture-item-template');

  const aiSection = document.getElementById('ai-response-section');
  const qqaResponse = document.getElementById('qqa-response');
  const clearAiBtn = document.getElementById('clear-ai-chat');

  const askInput = document.getElementById('ask-input');
  const sendAskBtn = document.getElementById('send-ask');

  const modelSelect = document.getElementById('model-select');
  const urlInput = document.getElementById('vercel-url-input');
  const saveSettingsBtn = document.getElementById('save-settings');
  const dashboardLink = document.getElementById('dashboard-link');

  // --- State ---
  let isRecording = false;
  let captures = []; // Array of capture data URLs
  let aggregatedTranscript = '';
  let sessionId = crypto.randomUUID();

  // --- Initial Load ---
  chrome.storage.local.get(['provider', 'model', 'vercelUrl', 'isRecording'], (s) => {
    if (s.model) modelSelect.value = s.model;
    if (s.vercelUrl) urlInput.value = s.vercelUrl;

    // Resume state if background is already recording
    chrome.runtime.sendMessage({ type: 'get-state' }, (res) => {
      if (res && res.isRecording) {
        updateUIStarted();
      }
    });
  });

  // --- Rendering Functions ---
  function renderCaptures() {
    captureGrid.innerHTML = '';
    captureCountBadge.textContent = captures.length;

    if (captures.length === 0) {
      capturePanel.classList.add('hidden');
      analyzeVisionBtn.classList.add('hidden');
      return;
    }

    capturePanel.classList.remove('hidden');
    analyzeVisionBtn.classList.remove('hidden');

    captures.forEach((dataUrl, index) => {
      const clone = captureItemTemplate.content.cloneNode(true);
      const img = clone.querySelector('.capture-img');
      const deleteBtn = clone.querySelector('.delete-capture');
      const expandBtn = clone.querySelector('.expand-capture');

      img.src = dataUrl;

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        captures.splice(index, 1);
        renderCaptures();
      });

      expandBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const win = window.open();
        win.document.write(`<img src="${dataUrl}" style="width:100%">`);
      });

      captureGrid.appendChild(clone);
    });

    // Refresh Lucide icons for injected content
    if (window.lucide) lucide.createIcons();
  }

  function showLoading(text) {
    aiSection.classList.remove('hidden');
    qqaResponse.innerHTML = `
      <div class="loading-state">
        ${text} <span class="typing-dots"><span></span><span></span><span></span></span>
      </div>
    `;
    qqaResponse.scrollIntoView({ behavior: 'smooth' });
  }

  // --- Core Logic ---

  async function askAI(prompt, useVision = false) {
    showLoading(useVision ? "AI is analyzing screen..." : "AI is thinking...");

    try {
      const payload = {};

      // Context from transcript
      const transcript = transcriptBox.innerText.trim();
      if (transcript) {
        payload.transcript = `Context Transcript:\n${transcript}\n\nUser Question: ${prompt}`;
      } else {
        payload.transcript = prompt;
      }

      // Context from last image if vision is enabled
      if (useVision && captures.length > 0) {
        payload.imageBase64 = captures[captures.length - 1];
      }

      const data = await apiCall(payload);
      qqaResponse.innerHTML = formatAIResponse(data.answer || "No response received.");
    } catch (e) {
      qqaResponse.innerHTML = `<span style="color:var(--danger-color)">Error: ${e.message}</span>`;
    }
  }

  // --- Event Listeners ---

  // Recording
  mainRecordBtn.addEventListener('click', () => {
    if (!isRecording) {
      sessionId = crypto.randomUUID();
      transcriptBox.innerHTML = '';
      chrome.runtime.sendMessage({ type: 'toggle-recording' }, (res) => {
        if (chrome.runtime.lastError) return toast('Error: ' + chrome.runtime.lastError.message);
        updateUIStarted();
      });
    } else {
      chrome.runtime.sendMessage({ type: 'toggle-recording' });
      updateUIStopped();
      saveSessionToDashboard();
    }
  });

  function updateUIStarted() {
    isRecording = true;
    mainRecordBtn.classList.add('recording');
    recordText.textContent = 'Stop Recording';
    liveIndicator.classList.remove('hidden');
  }

  function updateUIStopped() {
    isRecording = false;
    mainRecordBtn.classList.remove('recording');
    recordText.textContent = 'Start Recording';
    liveIndicator.classList.add('hidden');
  }

  // Transcript Actions
  copyTranscriptBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(transcriptBox.innerText);
    toast('Transcript copied to clipboard');
  });

  clearTranscriptBtn.addEventListener('click', () => {
    if (confirm('Clear transcript?')) transcriptBox.innerHTML = '';
  });

  regenerateSummaryBtn.addEventListener('click', () => {
    const text = transcriptBox.innerText.trim();
    if (!text) return toast('Transcript is empty');
    askAI("Summarize this transcript concisely.");
  });

  // Tools
  captureBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Flash effect
    document.body.style.opacity = '0.5';
    setTimeout(() => document.body.style.opacity = '1', 100);

    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      if (chrome.runtime.lastError) return toast("Capture Error: " + chrome.runtime.lastError.message);
      captures.push(dataUrl);
      renderCaptures();
      toast("Screen captured");
    });
  });

  summarizeBtn.addEventListener('click', () => {
    const text = transcriptBox.innerText.trim();
    if (!text) return toast('Transcript is empty');
    askAI("Provide a detailed meeting summary with key action items.");
  });

  analyzeVisionBtn.addEventListener('click', () => {
    if (captures.length === 0) return toast('No captures to analyze');
    askAI("Analyze this screen in the context of our meeting.", true);
  });

  // Unified Input
  const handleSend = () => {
    const prompt = askInput.value.trim();
    if (!prompt) return;
    askInput.value = '';

    // If we have an image, default to vision analysis if requested or just context
    askAI(prompt, captures.length > 0);
  };

  sendAskBtn.addEventListener('click', handleSend);
  askInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
  });

  clearAiBtn.addEventListener('click', () => {
    aiSection.classList.add('hidden');
    qqaResponse.innerHTML = '';
  });

  // Settings
  saveSettingsBtn.addEventListener('click', () => {
    chrome.storage.local.set({
      model: modelSelect.value,
      vercelUrl: urlInput.value
    }, () => toast('Settings saved'));
  });

  dashboardLink.onclick = () => {
    chrome.storage.local.get(['vercelUrl'], s => {
      chrome.tabs.create({ url: s.vercelUrl || 'https://spatial-expanse.vercel.app' });
    });
  };

  // Keyboard Shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl + E to edit transcript
    if (e.ctrlKey && e.key === 'e') {
      e.preventDefault();
      transcriptBox.focus();
    }
    // Delete key to remove last capture if focused on grid or panel
    if (e.key === 'Delete' && captures.length > 0) {
      if (document.activeElement.closest('.capture-section') || document.activeElement === document.body) {
        captures.pop();
        renderCaptures();
        toast('Last capture removed');
      }
    }
  });

  // --- Background Messages ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'trigger-capture') captureBtn.click();
    if (msg.type === 'recording-started') updateUIStarted();
    if (msg.type === 'recording-stopped') updateUIStopped();

    if (msg.type === 'transcript-chunk') {
      const text = msg.text || '';
      const div = document.createElement('div');
      div.textContent = text;
      transcriptBox.appendChild(div);
      transcriptBox.scrollTop = transcriptBox.scrollHeight;
    }

    if (msg.type === 'error') toast(msg.message);
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
            transcript: transcriptBox.innerText,
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
    const t = document.createElement('div');
    t.style = 'position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:rgba(33,38,45,0.9);color:#fff;padding:8px 16px;border-radius:20px;font-size:12px;z-index:10000;border:1px solid #30363d;backdrop-filter:blur(10px);box-shadow:var(--shadow-lg);';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }
});
