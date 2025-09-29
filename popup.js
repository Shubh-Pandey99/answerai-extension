document.addEventListener('DOMContentLoaded', () => {
  const toggleListen = document.getElementById('toggle-listen');
  const processingBtn = document.getElementById('processing-btn');
  const waveform = document.querySelector('.waveform');
  const statusText = document.getElementById('status-text');
  const liveDot = document.getElementById('live-dot');
  const transcriptPopup = document.getElementById('live-transcript-popup');
  const qqaResponse = document.getElementById('qqa-response');
  const summarizeBtn = document.getElementById('summarize');

  let recognition;
  let final_transcript = '';

  toggleListen.addEventListener('change', () => {
    if (toggleListen.checked) {
      startListening();
    } else {
      stopListening();
    }
  });

  function startListening() {
    recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
    recognition.lang = 'en-US';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      processingBtn.textContent = 'Listening...';
      waveform.style.display = 'flex';
      statusText.textContent = 'Status: Active & Listening...';
      liveDot.classList.remove('hidden');
      transcriptPopup.classList.remove('hidden');
      final_transcript = '';
    };

    recognition.onresult = (event) => {
      let interim_transcript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final_transcript += event.results[i][0].transcript;
        } else {
          interim_transcript += event.results[i][0].transcript;
        }
      }
      transcriptPopup.textContent = final_transcript + interim_transcript;
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      stopListening();
    };

    recognition.onend = () => {
      if (toggleListen.checked) {
        // If still supposed to be listening, restart
        recognition.start();
      }
    };

    recognition.start();
  }

  function stopListening() {
    if (recognition) {
      recognition.stop();
    }
    processingBtn.textContent = 'Processing transcript';
    waveform.style.display = 'none';
    statusText.textContent = 'Status: Inactive';
    liveDot.classList.add('hidden');
    transcriptPopup.classList.add('hidden');

    if (final_transcript) {
      getSummary(final_transcript);
    }
  }

  async function getSummary(transcript) {
    qqaResponse.textContent = 'Summarizing...';
    try {
      const res = await fetch('http://localhost:3000/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: `Summarize this: ${transcript}` })
      });
      const data = await res.json();
      qqaResponse.textContent = data.answer;
    } catch (error) {
      console.error('Error getting summary:', error);
      qqaResponse.textContent = 'Error summarizing transcript.';
    }
  }

  summarizeBtn.addEventListener('click', () => {
    if (final_transcript) {
      getSummary(final_transcript);
    } else {
      qqaResponse.textContent = 'Nothing to summarize yet.';
    }
  });

  // Screenshot functionality
  document.getElementById('capture-screen').addEventListener('click', () => {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (screenshotUrl) => {
      if (screenshotUrl) {
        getSummaryForImage(screenshotUrl);
      } else {
        console.error('Could not capture screenshot.');
        qqaResponse.textContent = 'Failed to capture screenshot.';
      }
    });
  });

  async function getSummaryForImage(imageUrl) {
    qqaResponse.textContent = 'Analyzing image...';
    try {
      const res = await fetch('http://localhost:3000/api/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl: imageUrl })
      });
      const data = await res.json();
      qqaResponse.textContent = data.answer;
    } catch (error) {
      console.error('Error getting image summary:', error);
      qqaResponse.textContent = 'Error analyzing image.';
    }
  }
});
