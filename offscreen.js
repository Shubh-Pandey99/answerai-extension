let recorder;
let data = [];

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'tab',
          chromeMediaSourceId: message.data,
        },
      },
    });

    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const source = audioCtx.createMediaStreamSource(stream);

    // Use a worklet for audio processing
    await audioCtx.audioWorklet.addModule('audio-processor.js');
    const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');

    source.connect(workletNode).connect(audioCtx.destination);

    workletNode.port.onmessage = (event) => {
      // Send audio data to background for transcription
      chrome.runtime.sendMessage({
        type: 'audio-data',
        target: 'background',
        data: event.data
      });
    };

  } else if (message.type === 'stop-recording') {
    // Stop recording logic...
  }
});
