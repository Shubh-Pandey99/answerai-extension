let isRecording = false;

chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  if (message.target === 'background') {
    if (message.type === 'toggle-recording') {
      isRecording ? stopRecording() : startRecording();
    }
  } else if (message.type === 'get-state') {
    sendResponse({ isRecording });
  }
  return true;
});

async function startRecording() {
  isRecording = true;
  chrome.runtime.sendMessage({ type: 'recording-started' });

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Required to capture tab audio for transcription.'
  });

  chrome.runtime.sendMessage({ type: 'start-recording', target: 'offscreen', data: streamId });
}

async function stopRecording() {
  isRecording = false;
  chrome.runtime.sendMessage({ type: 'recording-stopped' });
  chrome.runtime.sendMessage({ type: 'stop-recording', target: 'offscreen' });
  await chrome.offscreen.closeDocument();
}
