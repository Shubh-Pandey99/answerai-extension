# Scribe

> AI-powered live transcription, screen capture analysis, and real-time Q&A — right in your browser sidepanel.

## What it does

- **GitHub**: [github.com/Shubh-Pandey99/scribe](https://github.com/Shubh-Pandey99/scribe)
- **Vercel**: [scribe-extension.vercel.app](https://scribe-extension.vercel.app)

- 🎙️ **Live Transcription** — Captures audio from any browser tab (YouTube, meetings, podcasts) and transcribes it in real-time using OpenAI Whisper or Google Gemini
- 📷 **Screen Capture** — Takes a screenshot of the active tab and sends it to Gemini for visual analysis
- 🤖 **AI Q&A** — Ask anything about the transcript or capture using Gemini
- ✨ **Summarize** — One-click meeting/video summaries in bullet points
- 🕐 **Session History** — Every recording is saved locally and synced to the cloud

## Architecture

```
Chrome Extension (MV3)          Vercel Backend
─────────────────────           ──────────────
sidepanel.html/js/css    ──►   /api/transcribe  (Whisper → Gemini STT)
background-enhanced.js   ──►   /api/answer      (Gemini text/vision)
manifest.json            ──►   /api/sessions    (MongoDB persistence)
```

## Setup

### Extension
1. Clone this repo
2. Go to `chrome://extensions/` → Enable Developer Mode → Load Unpacked → select this folder
3. Open any tab, click the Extensions puzzle icon → **Scribe** → Open sidepanel

### Backend (Vercel)
1. Deploy to Vercel: `vercel deploy`
2. Set environment variables in Vercel dashboard:
   - `OPENAI_API_KEY` — for Whisper STT (optional, Gemini fallback available)
   - `GOOGLE_API_KEY` — for Gemini STT + AI responses
   - `MONGODB_URI` — for session cloud sync (optional)

### Using Live Transcription
1. Open a YouTube video or any tab with audio
2. Click **Start Recording** in the sidepanel
3. Chrome will show a screen/tab share picker — select your tab and **check "Share tab audio"**
4. Transcription appears live as audio is processed in 5-second chunks

## Tech Stack

- **Extension**: Vanilla JS, MV3, `getDisplayMedia` for audio capture
- **Backend**: Python Flask on Vercel
- **STT**: OpenAI Whisper-1 with Google Gemini multimodal fallback
- **AI**: Google Gemini 2.0 Flash
- **Storage**: `chrome.storage.local` + MongoDB Atlas