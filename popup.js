let listening = false;
let recognition;

document.getElementById("toggle-listen").addEventListener("change", (event) => {
  if (event.target.checked) {
    startListening();
  } else {
    stopListening();
  }
});

function startListening() {
  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.interimResults = true;

  recognition.onresult = async (event) => {
    let interim_transcript = "";
    let final_transcript = "";

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        final_transcript += event.results[i][0].transcript;
      } else {
        interim_transcript += event.results[i][0].transcript;
      }
    }

    document.getElementById("transcript").innerText = final_transcript + interim_transcript;

    if (final_transcript) {
      document.getElementById("response").innerText = "Thinking...";
      const res = await fetch("http://localhost:3000/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: final_transcript })
      });

      const data = await res.json();
      document.getElementById("response").innerText = data.answer;
    }
  };

  recognition.start();
  listening = true;
}

function stopListening() {
  if (recognition) {
    recognition.stop();
  }
  listening = false;
}

// Screenshot
document.getElementById("screenshot").addEventListener("click", () => {
  chrome.tabs.captureVisibleTab(null, {}, function (screenshotUrl) {
    document.getElementById("response").innerHTML =
      `<img src="${screenshotUrl}" style="max-width: 100%; border-radius: 4px;"/>`;
  });
});
