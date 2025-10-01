let audioContext = null;
let mediaStream = null;
let workletNode = null;
let recognition = null;

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target !== 'offscreen') return;

  if (message.type === 'start-recording') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: message.data } }
      });

      mediaStream = stream;
      audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);

      await audioContext.audioWorklet.addModule('audio-processor.js');
      workletNode = new AudioWorkletNode(audioContext, 'audio-processor');

      source.connect(workletNode).connect(audioContext.destination);

      workletNode.port.onmessage = (event) => {
        const audioData = event.data;
        
        // Send enhanced audio data with additional metrics
        chrome.runtime.sendMessage({ 
          type: 'audio-data', 
          target: 'background', 
          data: audioData.audio || audioData,
          rms: audioData.rms || 0,
          timestamp: audioData.timestamp || Date.now(),
          enhanced: true
        });
      };

      // Initialize speech recognition for transcription
      if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              transcript += event.results[i][0].transcript + ' ';
            }
          }
          
          if (transcript.trim()) {
            chrome.runtime.sendMessage({
              type: 'transcript-update',
              transcript: transcript.trim()
            });
          }
        };

        recognition.onerror = (event) => {
          console.error('Speech recognition error:', event.error);
        };

        recognition.start();
      }

    } catch (error) {
      console.error('Failed to start recording:', error);
    }
  } else if (message.type === 'stop-recording') {
    // Clean up resources
    if (recognition) {
      recognition.stop();
      recognition = null;
    }
    
    if (workletNode) {
      workletNode.disconnect();
      workletNode = null;
    }
    
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
  }
});
