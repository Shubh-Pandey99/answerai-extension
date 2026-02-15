// Manages offscreen capture + streaming transcription via offscreen document
const OFFSCREEN_URL = 'offscreen.html';
let isRecording = false;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'start-recording-context',
    title: 'Start AI Assistant Recording',
    contexts: ['page']
  });
  chrome.contextMenus.create({
    id: 'capture-screen-context',
    title: 'Capture Screen for AI Analysis',
    contexts: ['page']
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'start-recording-context') toggleRecording();
  if (info.menuItemId === 'capture-screen-context') {
    chrome.runtime.sendMessage({ type: 'trigger-capture' });
  }
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
    let msg = err.message;
    if (msg.includes('invoked')) msg = "Please click the Extension Icon in the toolbar once to grant permission.";
    chrome.runtime.sendMessage({ type: 'error', message: "Start failed: " + msg });
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
