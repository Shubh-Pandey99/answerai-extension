document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons();

  // Elements
  const appContainer = document.getElementById('app');
  const recordBtn = document.getElementById('main-record-btn');
  const recordBtnText = document.getElementById('record-btn-text');
  const toggleTranscript = document.getElementById('toggle-transcript');
  const toggleCapture = document.getElementById('toggle-capture');
  const backToTranscriptBtn = document.getElementById('back-to-transcript-btn');

  const views = {
    recording: document.getElementById('recording-view'),
    captured: document.getElementById('captured-view'),
    result: document.getElementById('result-view'),
    history: document.getElementById('history-view')
  };

  const cardActionBar = document.getElementById('card-action-bar');
  const processBtn = document.getElementById('process-content-btn');
  const processBtnText = processBtn.querySelector('span');

  const transcriptEl = document.getElementById('live-transcript');
  const meterFill = document.getElementById('meter-fill');
  const statusLog = document.getElementById('status-log');
  const activeImage = document.getElementById('active-image');
  const aiResponseText = document.getElementById('ai-response-text');
  const errorDisplay = document.getElementById('error-display');

  const askInput = document.getElementById('ask-input');
  const sendBtn = document.getElementById('send-btn');
  const dashboardBtn = document.getElementById('dashboard-btn');
  const settingsBtn = document.getElementById('settings-btn');
  const settingsOverlay = document.getElementById('settings-overlay');
  const settingsCloseBtn = document.getElementById('settings-close-btn');
  const retakeBtn = document.getElementById('retake-btn');

  // ====== STATE ======
  let isRecording = false;
  let aggregatedTranscript = '';
  let activeCaptureData = null;
  let currentMode = 'recording';
  let mediaStream = null;
  let mediaRecorder = null;
  let audioContext = null;
  let volumeRaf = null;
  let sessionId = crypto.randomUUID();
  let sessionStart = null;

  function logStatus(text) {
    if (!statusLog) return;
    const item = document.createElement('div');
    item.className = 'status-item';
    item.textContent = '\u25cf ' + text;
    statusLog.prepend(item);
    if (statusLog.children.length > 6) statusLog.lastElementChild.remove();
  }

  function setMode(mode) {
    currentMode = mode;
    Object.values(views).forEach(v => v && v.classList.add('hidden'));
    if (views[mode]) views[mode].classList.remove('hidden');

    const isVisionResult = (mode === 'result' && activeCaptureData);
    const isTransResult = (mode === 'result' && !activeCaptureData);

    toggleTranscript.classList.toggle('active', mode === 'recording' || isTransResult);
    toggleCapture.classList.toggle('active', mode === 'captured' || isVisionResult);

    // Show/hide the bottom action bar
    const showBar = mode === 'recording' || mode === 'captured';
    cardActionBar.classList.toggle('hidden', !showBar);

    if (mode === 'recording') processBtnText.textContent = 'Summarize Transcription';
    else if (mode === 'captured') processBtnText.textContent = 'Analyze Snapshot';

    if (window.lucide) lucide.createIcons();
    updateInputContext();
  }

  function showError(msg) {
    if (!msg) { errorDisplay.classList.add('hidden'); return; }
    errorDisplay.textContent = msg;
    errorDisplay.classList.remove('hidden');
    setTimeout(() => errorDisplay.classList.add('hidden'), 8000);
  }

  function updateInputContext() {
    const hasCapture = activeCaptureData && (currentMode === 'captured' || (currentMode === 'result' && activeCaptureData));
    askInput.placeholder = hasCapture ? "Ask about this capture..." : "Ask anything about this meeting...";
    appContainer.classList.toggle('has-attachment', !!hasCapture);
  }

  function blobToDataURL(blob) {
    return new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  async function getApiBase() {
    return new Promise(resolve => {
      chrome.storage.local.get(['vercelUrl'], res => {
        resolve(res.vercelUrl || 'https://scribe-extension.vercel.app');
      });
    });
  }

  // ====== SESSION SAVE ======
  async function saveSession() {
    if (!aggregatedTranscript.trim()) return;
    const apiBase = await getApiBase();
    const payload = {
      id: sessionId,
      transcript: aggregatedTranscript,
      started_at: sessionStart,
      ended_at: new Date().toISOString(),
      title: aggregatedTranscript.split(' ').slice(0, 8).join(' ') + '...'
    };
    // Save locally
    const key = 'session_' + sessionId;
    chrome.storage.local.set({ [key]: payload });
    // Save index
    chrome.storage.local.get(['session_index'], r => {
      const idx = r.session_index || [];
      if (!idx.includes(sessionId)) idx.unshift(sessionId);
      if (idx.length > 30) idx.pop(); // keep last 30
      chrome.storage.local.set({ session_index: idx });
    });
    // Try cloud sync
    try {
      fetch(apiBase + '/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } catch { }
  }

  // ====== CORE RECORDING ======
  async function startRecording() {
    try {
      logStatus("Requesting screen share...");

      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,
        preferCurrentTab: true
      });

      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) {
        showError("No audio track. Check 'Share tab audio' in the picker.");
        mediaStream.getTracks().forEach(t => t.stop());
        return;
      }

      await new Promise(r => setTimeout(r, 300));

      if (audioTracks[0].readyState !== 'live') {
        showError("Audio track ended. Try again.");
        mediaStream.getTracks().forEach(t => t.stop());
        return;
      }

      isRecording = true;
      sessionStart = new Date().toISOString();
      sessionId = crypto.randomUUID(); // new session per recording
      appContainer.classList.add('recording');
      recordBtnText.textContent = "Stop Recording";

      // Volume meter
      audioContext = new AudioContext();
      const src = audioContext.createMediaStreamSource(new MediaStream(audioTracks));
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      const dataArr = new Uint8Array(analyser.frequencyBinCount);
      const volumeTick = () => {
        analyser.getByteFrequencyData(dataArr);
        const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length / 255;
        if (meterFill) meterFill.style.width = Math.min(100, Math.floor(avg * 300)) + '%';
        volumeRaf = requestAnimationFrame(volumeTick);
      };
      volumeRaf = requestAnimationFrame(volumeTick);
      logStatus("Audio acquired!");

      // Try multiple MediaRecorder configs
      const audioOnlyStream = new MediaStream(audioTracks);
      const configs = [
        [audioOnlyStream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 64000 }],
        [audioOnlyStream, { mimeType: 'audio/webm', audioBitsPerSecond: 64000 }],
        [audioOnlyStream, { audioBitsPerSecond: 64000 }],
        [audioOnlyStream, {}],
        [mediaStream, { mimeType: 'video/webm;codecs=vp8,opus' }],
        [mediaStream, {}],
      ];

      let recorder = null;
      for (const [stream, opts] of configs) {
        try {
          recorder = new MediaRecorder(stream, opts);
          recorder.start(5000);
          logStatus("Recorder: " + recorder.mimeType);
          break;
        } catch { recorder = null; }
      }

      if (!recorder) {
        showError("No working recorder on this device.");
        stopRecording();
        return;
      }

      mediaRecorder = recorder;
      mediaRecorder.onerror = (ev) => logStatus("Rec err: " + (ev.error?.message || "?"));

      const apiBase = await getApiBase();
      logStatus("API: " + new URL(apiBase).hostname);

      mediaRecorder.ondataavailable = async (e) => {
        if (!e.data || e.data.size < 100) return;
        const curVol = meterFill ? parseInt(meterFill.style.width) || 0 : -1;
        logStatus("Chunk: " + (e.data.size / 1024).toFixed(1) + "KB vol:" + curVol + "%");
        const b64 = await blobToDataURL(e.data);
        try {
          const res = await fetch(apiBase + '/api/transcribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: b64, mimeType: e.data.type || 'audio/webm', sessionId })
          });
          if (res.ok) {
            const data = await res.json();
            if (data && data.text && data.text.trim() && data.text.trim().length > 1 && !['SILENT','MUSIC','.'].includes(data.text.trim())) {
              appendTranscript(data.text);
              logStatus("[" + (data.method || "?") + "] transcribed");
            } else {
              const method = data.method || "skip";
              logStatus("● " + method + ": no speech detected");
            }
          } else {
            const t = await res.text();
            logStatus("API " + res.status + ": " + t.substring(0, 50));
          }
        } catch (err) {
          logStatus("Net: " + err.message);
        }
      };

      logStatus("Recording started!");
      mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => stopRecording());
      mediaStream.getAudioTracks()[0]?.addEventListener('ended', () => stopRecording());

    } catch (err) {
      if (err.name === 'NotAllowedError') logStatus("Share cancelled.");
      else { showError("Recording failed: " + err.message); logStatus("Error: " + err.message); }
    }
  }

  function stopRecording() {
    try { mediaRecorder?.stop(); } catch { }
    try { mediaStream?.getTracks().forEach(t => t.stop()); } catch { }
    try { if (volumeRaf) cancelAnimationFrame(volumeRaf); } catch { }
    try { audioContext?.close(); } catch { }
    mediaRecorder = null;
    mediaStream = null;
    audioContext = null;
    volumeRaf = null;
    isRecording = false;
    appContainer.classList.remove('recording');
    recordBtnText.textContent = "Start Recording";
    if (meterFill) meterFill.style.width = '0%';
    logStatus("Recording stopped.");
    saveSession();
  }

  function appendTranscript(text) {
    const chunk = text + ' ';
    aggregatedTranscript += chunk;
    const textNode = document.createTextNode(chunk);
    transcriptEl.appendChild(textNode);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
  }

  // ====== HISTORY VIEW ======
  async function showHistory() {
    setModeRaw('history');
    const histList = document.getElementById('hist-list');
    histList.innerHTML = '<div class="hist-loading">Loading...</div>';

    chrome.storage.local.get(['session_index'], async (r) => {
      const idx = r.session_index || [];
      if (idx.length === 0) {
        histList.innerHTML = '<div class="hist-empty">No sessions yet.<br>Start recording to create your first one.</div>';
        return;
      }
      const keys = idx.map(id => 'session_' + id);
      chrome.storage.local.get(keys, (sessions) => {
        histList.innerHTML = '';
        idx.forEach(id => {
          const s = sessions['session_' + id];
          if (!s) return;
          const card = document.createElement('div');
          card.className = 'hist-card';
          const date = s.started_at ? new Date(s.started_at).toLocaleDateString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
          card.innerHTML = `
            <div class="hist-date">${date}</div>
            <div class="hist-title">${s.title || 'Untitled session'}</div>
            <div class="hist-preview">${(s.transcript || '').substring(0, 80)}...</div>
          `;
          card.onclick = () => {
            aggregatedTranscript = s.transcript || '';
            transcriptEl.textContent = aggregatedTranscript;
            setMode('recording');
          };
          histList.appendChild(card);
        });
      });
    });
  }

  // Raw mode set without toggling action bar logic for history
  function setModeRaw(mode) {
    currentMode = mode;
    Object.values(views).forEach(v => v && v.classList.add('hidden'));
    if (views[mode]) views[mode].classList.remove('hidden');
    toggleTranscript.classList.remove('active');
    toggleCapture.classList.remove('active');
    cardActionBar.classList.add('hidden');
    if (window.lucide) lucide.createIcons();
  }

  // ====== UI HANDLERS ======
  recordBtn.onclick = () => {
    if (!isRecording) startRecording();
    else stopRecording();
  };

  async function captureScreen() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 90 }, (dataUrl) => {
        if (chrome.runtime.lastError) { showError("Snap failed: " + chrome.runtime.lastError.message); return; }
        activeCaptureData = dataUrl;
        activeImage.src = dataUrl;
        setMode('captured');
      });
    } catch (e) { showError("Snap error: " + e.message); }
  }

  async function runAIAction(prompt, extra = {}) {
    if (!extra.imageBase64) activeCaptureData = null;
    setMode('result');
    aiResponseText.innerHTML = '<span class="thinking-text">Thinking...</span>';
    try {
      const settings = await new Promise(r => chrome.storage.local.get(['vercelUrl', 'model'], r));
      const url = settings.vercelUrl || 'https://scribe-extension.vercel.app';
      const res = await fetch(url + '/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'google', model: settings.model || 'gemini-2.0-flash', transcript: prompt, ...extra })
      });
      const data = await res.json();
      if (data.answer) {
        aiResponseText.innerHTML = data.answer
          .replace(/\n\n/g, '<br><br>')
          .replace(/\n/g, '<br>')
          .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
      } else {
        aiResponseText.textContent = data.error || 'No response from AI.';
      }
    } catch (e) {
      showError('API Error: ' + e.message);
      aiResponseText.textContent = 'Error contacting AI.';
    }
  }

  processBtn.onclick = () => {
    if (currentMode === 'recording') {
      const text = transcriptEl.innerText || aggregatedTranscript;
      if (!text.trim()) { showError('No transcript to summarize yet.'); return; }
      runAIAction('Summarize this meeting transcript concisely in bullet points:\n' + text);
    } else if (currentMode === 'captured') {
      runAIAction('Analyze this screen capture and explain what is shown, highlight any key info.', { imageBase64: activeCaptureData });
    }
  };

  toggleTranscript.onclick = () => { activeCaptureData = null; setMode('recording'); };
  toggleCapture.onclick = () => {
    if (activeCaptureData && currentMode !== 'captured') setMode('captured');
    else captureScreen();
  };
  backToTranscriptBtn.onclick = () => { activeCaptureData = null; setMode('recording'); };

  sendBtn.onclick = () => {
    const q = askInput.value.trim();
    if (!q) return;
    const extra = activeCaptureData ? { imageBase64: activeCaptureData } : {};
    askInput.value = '';
    runAIAction(q, extra);
  };
  askInput.onkeypress = (e) => { if (e.key === 'Enter') sendBtn.click(); };

  // History button — show local sessions panel
  dashboardBtn.onclick = () => showHistory();
  document.getElementById('hist-back-btn')?.addEventListener('click', () => setMode('recording'));

  // Settings modal
  const modelSelect = document.getElementById('model-select');
  const urlInput = document.getElementById('vercel-url-input');
  settingsBtn.onclick = () => { settingsOverlay.classList.remove('hidden'); if (window.lucide) lucide.createIcons(); };
  settingsCloseBtn.onclick = () => settingsOverlay.classList.add('hidden');
  settingsOverlay.onclick = (e) => { if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden'); };
  document.getElementById('save-settings').onclick = () => {
    chrome.storage.local.set({ model: modelSelect.value, vercelUrl: urlInput.value }, () => {
      logStatus('Settings saved.');
      settingsOverlay.classList.add('hidden');
    });
  };
  chrome.storage.local.get(['model', 'vercelUrl'], (res) => {
    if (res.model) modelSelect.value = res.model;
    if (res.vercelUrl) urlInput.value = res.vercelUrl;
  });

  if (retakeBtn) retakeBtn.onclick = () => captureScreen();

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'error') { showError(msg.message); logStatus('Error: ' + msg.message); }
    if (msg.type === 'trigger-capture') captureScreen();
  });

  logStatus('System ready.');
});
