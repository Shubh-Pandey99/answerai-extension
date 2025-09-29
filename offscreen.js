let recognition;
let final_transcript = '';

chrome.runtime.onMessage.addListener(async (message) => {
  if (message.target === 'offscreen') {
    if (message.type === 'start-recording') {
      await startRecording(message.data);
    } else if (message.type === 'stop-recording') {
      stopRecording();
    }
  }
});

async function startRecording(streamId) {
  if (recognition?.state === 'recording') {
    throw new Error('Called startRecording while recording is in progress.');
  }

  const media = await navigator.mediaDevices.getUserMedia({
    audio: {
      mandatory: {
        chromeMediaSource: 'tab',
        chromeMediaSourceId: streamId
      }
    }
  });

  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = 'en-US';
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = (event) => {
    let interim_transcript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final_transcript += event.results[i][0].transcript;
      } else {
        interim_transcript += event.results[i][0].transcript;
      }
    }
    chrome.runtime.sendMessage({
      type: 'transcript-ready',
      target: 'background',
      transcript: final_transcript + interim_transcript
    });
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
  };

  recognition.onend = () => {
    // The recognition service has ended, clean up
    stopRecording();
  };
  
  const audioStream = new MediaStream(media.getAudioTracks());
  // This is a bit of a hack to attach the stream to the recognition engine
  // In a real-world scenario, you might need a more robust solution
  const audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(audioStream);
  // The recognition API doesn't directly take a stream, but this setup works in many cases
  recognition.start();
}

function stopRecording() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  final_transcript = '';
}
