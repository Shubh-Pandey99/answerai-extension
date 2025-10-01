chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.data } }
    });

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);

    await audioCtx.audioWorklet.addModule('audio-processor.js');
    const workletNode = new AudioWorkletNode(audioCtx, 'audio-processor');

    source.connect(workletNode).connect(audioCtx.destination);

    workletNode.port.onmessage = (event) => {
      const audioData = event.data;
      
      // Send enhanced audio data with additional metrics
      chrome.runtime.sendMessage({ 
        type: 'audio-data', 
        target: 'background', 
        data: audioData.audio || audioData, // Backward compatibility
        rms: audioData.rms || 0,
        timestamp: audioData.timestamp || Date.now(),
        enhanced: true
      });
    };
  } else if (message.type === 'stop-recording') {
    // This is a bit of a hack, as there's no direct way to stop the worklet.
    // Instead, we just close the offscreen document, which will terminate the script.
    // In a more complex scenario, you might want to send a message to the worklet
    // to tell it to stop processing.
  }
});
