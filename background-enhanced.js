// Manages offscreen capture + streaming transcription via offscreen document
const OFFSCREEN_URL = 'offscreen.html';
let isRecording = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'toggle-recording',
    title: 'AI Assistant: Start/Stop Live Transcription',
    contexts: ['action']
  });
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'toggle-recording') toggleRecording();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'toggle-recording') { toggleRecording(); sendResponse?.({ ok: true }); return true; }
  if (msg.type === 'get-state') { sendResponse?.({ isRecording }); return true; }
});

async function toggleRecording() {
  if (!isRecording) {
    await ensureOffscreenDocument();
    const conf = await new Promise(r => chrome.storage.local.get(['vercelUrl'], r));
    chrome.runtime.sendMessage({ type: 'recording-started' });
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'start', apiBase: conf.vercelUrl || 'http://127.0.0.1:5055' });
    isRecording = true;
  } else {
    chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' });
    chrome.runtime.sendMessage({ type: 'recording-stopped' });
    isRecording = false;
  }
}

async function ensureOffscreenDocument() {
  const has = await chrome.offscreen.hasDocument?.();
  if (has) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: ['AUDIO_PLAYBACK', 'BLOBS'],
    justification: 'Process tab audio, compute volume, and stream chunks for STT.'
  });
}
