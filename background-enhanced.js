// Manages offscreen capture + streaming transcription via offscreen document
const OFFSCREEN_URL = 'offscreen.html';
let isRecording = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'toggle-recording',
    title: 'AI Assistant: Start/Stop Live Transcription',
    contexts: ['action']
  });
  // Enable side panel on click
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));
});

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'toggle-recording') toggleRecording();
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'toggle-recording') { toggleRecording(); sendResponse?.({ ok: true }); return true; }
  if (msg.type === 'get-state') { sendResponse?.({ isRecording }); return true; }
});

async function toggleRecording() {
  try {
    if (!isRecording) {
      // Get the active tab to capture its audio
      const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!tab) {
        chrome.runtime.sendMessage({ type: 'error', message: "No active tab found. Please click into a website first." });
        return;
      }

      // Get a stream ID for the tab's audio
      const streamId = await new Promise((resolve, reject) => {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, (id) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve(id);
        });
      });

      await ensureOffscreenDocument();
      const conf = await new Promise(r => chrome.storage.local.get(['vercelUrl'], r));
      chrome.runtime.sendMessage({ type: 'recording-started' });
      chrome.runtime.sendMessage({
        target: 'offscreen',
        action: 'start',
        streamId,
        apiBase: conf.vercelUrl || 'https://spatial-expanse.vercel.app'
      });
      isRecording = true;
    } else {
      chrome.runtime.sendMessage({ target: 'offscreen', action: 'stop' });
      chrome.runtime.sendMessage({ type: 'recording-stopped' });
      isRecording = false;
    }
  } catch (err) {
    console.error("Recording toggle failed:", err);
    chrome.runtime.sendMessage({ type: 'error', message: "Start failed: " + err.message + ". Try refreshing the page you're on." });
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
