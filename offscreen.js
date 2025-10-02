let mediaStream = null;
let mediaRecorder = null;
let apiBase = 'http://127.0.0.1:5055';
let sessionId = crypto.randomUUID();

// listen for commands from background
chrome.runtime.onMessage.addListener(async (msg) => {
  if (msg?.target !== 'offscreen') return;
  if (msg.action === 'start') {
    apiBase = msg.apiBase || apiBase;
    await startCapture();
  }
  if (msg.action === 'stop') {
    await stopCapture();
  }
});

async function startCapture() {
  try {
    // Prefer tab audio; if fails, fall back to mic
    mediaStream = await chrome.tabCapture.capture({ audio: true, video: false });
    if (!mediaStream) {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    }

    const audioCtx = new AudioContext();
    const src = audioCtx.createMediaStreamSource(mediaStream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 512;
    src.connect(analyser);

    // volume feedback
    const dataArr = new Uint8Array(analyser.frequencyBinCount);
    const volumeTick = () => {
      analyser.getByteFrequencyData(dataArr);
      const avg = dataArr.reduce((a, b) => a + b, 0) / dataArr.length / 255;
      chrome.runtime.sendMessage({ type: 'volume', value: avg });
      raf = requestAnimationFrame(volumeTick);
    };
    let raf = requestAnimationFrame(volumeTick);

    // chunk recorder
    mediaRecorder = new MediaRecorder(mediaStream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
    mediaRecorder.ondataavailable = async (e) => {
      if (!e.data || !e.data.size) return;
      const b64 = await blobToDataURL(e.data);
      // send to backend for Whisper transcription
      try {
        const res = await fetch(`${apiBase}/api/transcribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ audioBase64: b64, mimeType: e.data.type, sessionId })
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.text) {
            chrome.runtime.sendMessage({ type: 'transcript-chunk', text: data.text });
          }
        } else {
          const t = await res.text();
          chrome.runtime.sendMessage({ type: 'error', message: `STT HTTP ${res.status}: ${t}` });
        }
      } catch (err) {
        chrome.runtime.sendMessage({ type: 'error', message: 'STT send failed' });
      }
    };
    mediaRecorder.start(2500); // 2.5s chunks
  } catch (e) {
    chrome.runtime.sendMessage({ type: 'error', message: 'Capture failed: ' + e.message });
  }
}

async function stopCapture() {
  try {
    mediaRecorder?.stop();
  } catch {}
  try {
    mediaStream?.getTracks().forEach(t => t.stop());
  } catch {}
}

function blobToDataURL(blob) {
  return new Promise((resolve) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.readAsDataURL(blob);
  });
}
