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
    result: document.getElementById('result-view')
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

  // ====== RECORDING STATE (managed entirely in sidepanel now) ======
  let isRecording = false;
  let aggregatedTranscript = '';
  let activeCaptureData = null;
  let currentMode = 'recording';

  // Audio recording objects (live in sidepanel, NOT offscreen)
  let mediaStream = null;
  let mediaRecorder = null;
  let audioContext = null;
  let volumeRaf = null;
  let sessionId = crypto.randomUUID();

  function logStatus(text) {
    if (!statusLog) return;
    const item = document.createElement('div');
    item.className = 'status-item';
    item.textContent = `● ${text}`;
    statusLog.prepend(item);
    if (statusLog.children.length > 6) statusLog.lastElementChild.remove();
  }

  function setMode(mode) {
    currentMode = mode;
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[mode].classList.remove('hidden');

    const isVisionResult = (mode === 'result' && activeCaptureData);
    const isTransResult = (mode === 'result' && !activeCaptureData);

    toggleTranscript.classList.toggle('active', mode === 'recording' || isTransResult);
    toggleCapture.classList.toggle('active', mode === 'captured' || isVisionResult);

    if (mode === 'recording') {
      processBtnText.textContent = 'Summarize Transcription';
      cardActionBar.classList.remove('hidden');
    } else if (mode === 'captured') {
      processBtnText.textContent = 'Analyze Snapshot';
      cardActionBar.classList.remove('hidden');
    } else {
      cardActionBar.classList.add('hidden');
    }

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
    if (activeCaptureData && (currentMode === 'captured' || (currentMode === 'result' && activeCaptureData))) {
      askInput.placeholder = "Ask about this capture...";
      appContainer.classList.add('has-attachment');
    } else {
      askInput.placeholder = "Ask anything about this meeting...";
      appContainer.classList.remove('has-attachment');
    }
  }

  function blobToDataURL(blob) {
    return new Promise(resolve => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.readAsDataURL(blob);
    });
  }

  // ====== CORE: Start/Stop Recording using getDisplayMedia ======
  async function startRecording() {
    try {
      logStatus("Requesting screen share...");

      // Use getDisplayMedia — this is a STANDARD WEB API that works reliably.
      // Chrome will show a picker. User selects their YouTube tab.
      // Audio from that tab will be captured.
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: true,           // Required by Chrome, but we only use audio
        preferCurrentTab: true // Hint to pre-select the current tab
      });

      // We only care about audio, but we keep the video track alive
      // (Chrome requires it for tab audio capture via getDisplayMedia)
      const audioTracks = mediaStream.getAudioTracks();
      if (audioTracks.length === 0) {
        showError("No audio track found. Make sure to check 'Share tab audio' in the picker.");
        mediaStream.getTracks().forEach(t => t.stop());
        return;
      }

      logStatus("Audio stream acquired!");
      isRecording = true;
      appContainer.classList.add('recording');
      recordBtnText.textContent = "Stop Recording";

      // Setup volume meter
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

      // Setup MediaRecorder — CRITICAL: use an audio-only stream!
      // getDisplayMedia returns video+audio, but MediaRecorder with audio mimeType
      // crashes if video tracks are present. Extract audio tracks only.
      const audioOnlyStream = new MediaStream(audioTracks);

      // Find a supported mimeType
      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = 'audio/webm';
      }
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = ''; // Let browser pick default
      }

      const recorderOptions = mimeType
        ? { mimeType, audioBitsPerSecond: 32000 }
        : { audioBitsPerSecond: 32000 };

      mediaRecorder = new MediaRecorder(audioOnlyStream, recorderOptions);
      logStatus(`Recorder: ${mediaRecorder.mimeType}`);

      const apiBase = await getApiBase();
      logStatus("Sending audio to " + new URL(apiBase).hostname + "...");

      mediaRecorder.ondataavailable = async (e) => {
        if (!e.data || e.data.size < 100) return; // Skip tiny/empty chunks
        logStatus(`Chunk: ${(e.data.size / 1024).toFixed(1)}KB`);
        const b64 = await blobToDataURL(e.data);
        try {
          const res = await fetch(`${apiBase}/api/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ audioBase64: b64, mimeType: e.data.type || 'audio/webm', sessionId })
          });
          if (res.ok) {
            const data = await res.json();
            if (data?.text && data.text.trim()) {
              appendTranscript(data.text);
            } else {
              logStatus("No speech detected.");
            }
          } else {
            const t = await res.text();
            logStatus(`API ${res.status}: ${t.substring(0, 80)}`);
            console.error('STT Error:', res.status, t);
          }
        } catch (err) {
          logStatus("Network: " + err.message);
          console.error('STT fetch error:', err);
        }
      };

      mediaRecorder.start(3000); // 3-second chunks
      logStatus("Recording started. Listening...");

      // Handle stream ending (user clicks "Stop sharing" in Chrome's bar)
      mediaStream.getVideoTracks()[0]?.addEventListener('ended', () => {
        stopRecording();
      });

    } catch (err) {
      if (err.name === 'NotAllowedError') {
        logStatus("Screen share cancelled by user.");
      } else {
        showError("Recording failed: " + err.message);
        logStatus("Error: " + err.message);
      }
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
  }

  function appendTranscript(text) {
    const chunk = text + ' ';
    aggregatedTranscript += chunk;
    const textNode = document.createTextNode(chunk);
    transcriptEl.appendChild(textNode);
    transcriptEl.scrollTop = transcriptEl.scrollHeight;
    logStatus("Text received.");
  }

  async function getApiBase() {
    return new Promise(resolve => {
      chrome.storage.local.get(['vercelUrl'], res => {
        resolve(res.vercelUrl || 'https://spatial-expanse.vercel.app');
      });
    });
  }

  // ====== UI Event Handlers ======
  recordBtn.onclick = () => {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  };

  async function captureScreen() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) return;
      chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 90 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          showError("Snap failed: " + chrome.runtime.lastError.message);
          return;
        }
        activeCaptureData = dataUrl;
        activeImage.src = dataUrl;
        setMode('captured');
      });
    } catch (e) {
      showError("Snap error: " + e.message);
    }
  }

  async function runAIAction(prompt, extra = {}) {
    if (!extra.imageBase64) activeCaptureData = null;
    setMode('result');
    aiResponseText.innerHTML = '<span style="color:#8b949e">Thinking...</span>';

    try {
      const settings = await new Promise(r => chrome.storage.local.get(['vercelUrl', 'model'], r));
      const url = settings.vercelUrl || 'https://spatial-expanse.vercel.app';
      const payload = {
        provider: 'google',
        model: settings.model || 'gemini-2.0-flash',
        transcript: prompt,
        ...extra
      };

      const res = await fetch(`${url}/api/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
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
      showError(`API Error: ${e.message}`);
      aiResponseText.textContent = 'Error processing request.';
    }
  }

  processBtn.onclick = () => {
    if (currentMode === 'recording') {
      const text = transcriptEl.innerText || aggregatedTranscript;
      runAIAction(`Summarize this meeting transcript concisely:\n${text}`);
    } else if (currentMode === 'captured') {
      runAIAction(`Analyze this screen context and explain what is shown.`, { imageBase64: activeCaptureData });
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
  dashboardBtn.onclick = () => { chrome.tabs.create({ url: 'https://spatial-expanse.vercel.app/dashboard' }); };

  // --- Message Bus (still listens for background messages) ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'error') { showError(msg.message); logStatus("Error: " + msg.message); }
    if (msg.type === 'trigger-capture') captureScreen();
  });

  logStatus("System ready.");

  // Load Settings
  const modelSelect = document.getElementById('model-select');
  const urlInput = document.getElementById('vercel-url-input');

  document.getElementById('save-settings').onclick = () => {
    chrome.storage.local.set({
      model: modelSelect.value,
      vercelUrl: urlInput.value
    }, () => alert('Settings saved!'));
  };

  chrome.storage.local.get(['model', 'vercelUrl'], (res) => {
    if (res.model) modelSelect.value = res.model;
    if (res.vercelUrl) urlInput.value = res.vercelUrl;
  });
});
