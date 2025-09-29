let listening = false;
let recognition;

document.getElementById("toggle").addEventListener("click", () => {
  if (!listening) startListening();
  else stopListening();
});

function startListening() {
  recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = false;

  recognition.onresult = async (event) => {
    const transcript = event.results[0][0].transcript;
    document.getElementById("response").innerText = "Thinking...";

    const res = await fetch("https://YOUR-VERCEL-APP.vercel.app/api/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript })
    });

    const data = await res.json();
    document.getElementById("response").innerText = data.answer;
  };

  recognition.start();
  listening = true;
}

function stopListening() {
  recognition.stop();
  listening = false;
}

// Screenshot
document.getElementById("screenshot").addEventListener("click", () => {
  chrome.tabs.captureVisibleTab(null, {}, function (screenshotUrl) {
    document.getElementById("response").innerHTML =
      `<img src="${screenshotUrl}" width="200"/>`;
  });
});
