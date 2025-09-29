let recording = false;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === 'background') {
    if (message.type === 'toggle-recording') {
      if (recording) {
        stopRecording();
      } else {
        startRecording();
      }
      recording = !recording;
    }
  }
});

async function startRecording() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const streamId = await chrome.tabCapture.getMediaStreamId({
    targetTabId: tab.id
  });

  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['USER_MEDIA'],
    justification: 'Required to capture tab audio for transcription.'
  });

  chrome.runtime.sendMessage({
    type: 'start-recording',
    target: 'offscreen',
    data: streamId
  });
}

async function stopRecording() {
  chrome.runtime.sendMessage({
    type: 'stop-recording',
    target: 'offscreen'
  });
  await chrome.offscreen.closeDocument();
}
