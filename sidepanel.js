document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const headerTitle = document.getElementById('header-title');
  const appContainer = document.querySelector('.app-container');
  const toggleTranscript = document.getElementById('toggle-transcript');
  const toggleCapture = document.getElementById('toggle-capture');

  const views = {
    ready: document.getElementById('ready-view'),
    recording: document.getElementById('recording-view'),
    captured: document.getElementById('captured-view'),
    result: document.getElementById('result-view')
  };

  const toolbars = {
    recording: document.getElementById('recording-tools'),
    captured: document.getElementById('captured-tools')
  };

  const transcriptEl = document.getElementById('live-transcript');
  const activeImage = document.getElementById('active-image');
  const aiResponseText = document.getElementById('ai-response-text');

  const startBtn = document.getElementById('start-recording-btn');
  const summarizeBtn = document.getElementById('summarize-btn');
  const tasksBtn = document.getElementById('tasks-btn');
  const analyzeBtn = document.getElementById('analyze-btn');
  const ocrBtn = document.getElementById('ocr-btn');
  const captureShortcut = document.getElementById('capture-shortcut');

  const askInput = document.getElementById('ask-input');
  const sendBtn = document.getElementById('send-btn');

  // State
  let isRecording = false;
  let aggregatedTranscript = '';
  let activeCaptureData = null;

  function setMode(mode) {
    // Reset
    Object.values(views).forEach(v => v.classList.add('hidden'));
    Object.values(toolbars).forEach(t => t.classList.add('hidden'));
    appContainer.classList.remove('recording');

    // Sync Toggle
    toggleTranscript.classList.remove('active');
    toggleCapture.classList.remove('active');

    if (mode === 'ready') {
      views.ready.classList.remove('hidden');
      headerTitle.textContent = 'Ready';
      toggleTranscript.classList.add('active');
    } else if (mode === 'recording') {
      views.recording.classList.remove('hidden');
      toolbars.recording.classList.remove('hidden');
      headerTitle.textContent = 'Recording';
      appContainer.classList.add('recording');
      toggleTranscript.classList.add('active');
    } else if (mode === 'captured') {
      views.captured.classList.remove('hidden');
      toolbars.captured.classList.remove('hidden');
      headerTitle.textContent = 'Captured Screen';
      toggleCapture.classList.add('active');
    } else if (mode === 'result') {
      views.result.classList.remove('hidden');
      headerTitle.textContent = 'AI Insight';
    }
  }

  toggleTranscript.onclick = () => {
    if (isRecording) setMode('recording');
    else setMode('ready');
  };

  toggleCapture.onclick = () => {
    if (activeCaptureData) setMode('captured');
    else captureScreen();
  };

  // --- Actions ---

  startBtn.onclick = () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  function startRecording() {
    isRecording = true;
    aggregatedTranscript = '';
    transcriptEl.textContent = '';
    setMode('recording');
    startBtn.textContent = 'Stop Recording';
    chrome.runtime.sendMessage({ type: 'toggle-recording' });
  }

  function stopRecording() {
    isRecording = false;
    startBtn.textContent = 'Start Recording';
    chrome.runtime.sendMessage({ type: 'toggle-recording' });
    // Keep transcript visible for a moment or jump to summarization? 
    // Staying in recording mode (viewing transcript) is fine until user clicks something else.
  }

  async function captureScreen() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 90 }, (dataUrl) => {
      activeCaptureData = dataUrl;
      activeImage.src = dataUrl;
      setMode('captured');
    });
  }

  captureShortcut.onclick = captureScreen;

  async function runAIAction(prompt, extra = {}) {
    setMode('result');
    aiResponseText.textContent = 'Thinking...';
    try {
      const payload = { transcript: prompt, ...extra };
      const { provider, vercelUrl, model } = await new Promise(r => chrome.storage.local.get(['provider', 'vercelUrl', 'model'], r));
      const url = vercelUrl || 'https://spatial-expanse.vercel.app';

      const res = await fetch(`${url}/api/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider || 'google', model, ...payload })
      });
      const data = await res.json();
      aiResponseText.innerHTML = (data.answer || 'No response').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    } catch (e) {
      aiResponseText.textContent = 'Error: ' + e.message;
    }
  }

  summarizeBtn.onclick = () => runAIAction(`Summarize this transcript:\n${aggregatedTranscript}`);
  tasksBtn.onclick = () => runAIAction(`Extract action items from:\n${aggregatedTranscript}`);
  analyzeBtn.onclick = () => runAIAction(`Analyze this screen capture:`, { imageBase64: activeCaptureData });
  ocrBtn.onclick = () => runAIAction(`Extract all text from this image:`, { imageBase64: activeCaptureData, transcript: 'OCR' });

  sendBtn.onclick = () => {
    const q = askInput.value.trim();
    if (!q) return;
    askInput.value = '';
    const extra = activeCaptureData ? { imageBase64: activeCaptureData } : {};
    runAIAction(q, extra);
  };

  // Messaging from Background
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'transcript-chunk') {
      aggregatedTranscript += msg.text + ' ';
      transcriptEl.textContent = aggregatedTranscript;
      transcriptEl.scrollTop = transcriptEl.scrollHeight;
      if (headerTitle.textContent !== 'Recording') setMode('recording');
    }
  });

  // Settings
  const modelSelect = document.getElementById('model-select');
  const urlInput = document.getElementById('vercel-url-input');
  document.getElementById('save-settings').onclick = () => {
    chrome.storage.local.set({ model: modelSelect.value, vercelUrl: urlInput.value });
  };
});
