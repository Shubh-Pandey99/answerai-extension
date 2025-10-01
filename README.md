# AI Meeting Assistant Extension (Enhanced with GPT-5)

This repository contains the source code for the AI Meeting Assistant browser extension and its enhanced Python backend service. The extension is designed to help you transcribe, summarize, and ask questions about live audio, screen captures, and more, using cutting-edge AI providers including **GPT-5**.

## 🚀 Enhanced Features (v2.0.0)

### **🤖 AI-Powered Core**
- **🔥 GPT-5 Integration**: Zero-setup access via Emergent LLM key - no API key required!
- **Multi-Provider Support**: GPT-5 (Emergent), OpenAI, Google Gemini 2.0, OpenRouter
- **Smart Model Selection**: Choose between GPT-5, GPT-4o, and GPT-4o-mini
- **Enhanced Responses**: Professional meeting analysis with structured outputs

### **🎵 Advanced Audio Processing**
- **Live Transcription**: Real-time audio capture from browser tabs with enhanced accuracy
- **Noise Suppression**: Built-in audio enhancement with volume normalization
- **Dual Audio Sources**: Tab audio capture + microphone input support
- **Enhanced Waveform**: Real-time visual feedback with audio quality metrics

### **📸 Smart Screen Capture**
- **Intelligent Analysis**: GPT-5 powered screenshot interpretation 
- **Visual Content Understanding**: Analyze whiteboards, diagrams, code snippets, presentations
- **Instant OCR**: Extract and analyze text from captured images
- **Meeting Screenshot Intelligence**: Identify key visual elements and action items

### **💬 Real-time Intelligence**
- **Context-Aware Q&A**: Ask questions with full meeting context
- **Auto-Summarization**: Generate structured meeting notes with key points and action items
- **Enhanced Error Handling**: Auto-retry with exponential backoff (3 attempts)
- **Professional Formatting**: Bold/italic text rendering in responses

### **⚡ Reliability & Performance**
- **Network Resilience**: Automatic reconnection on failures
- **Streaming Responses**: Real-time AI response delivery
- **Health Monitoring**: System status and diagnostics endpoint
- **Enhanced Logging**: Comprehensive error tracking and debugging

## Backend Setup: Python & Flask

The backend is a lightweight Flask application that acts as a proxy to the various AI provider APIs. It receives requests from the extension, forwards them to the selected provider with the user's API key, and returns the response.

## Deployment to Vercel

Follow these steps to deploy the Python backend to Vercel.

### 1. Push to GitHub

Ensure all the latest changes, including `api/index.py`, `requirements.txt`, and `vercel.json`, are pushed to your GitHub repository.

### 2. Deploy to Vercel

1.  **Create a New Vercel Project**:
    - Log in to your Vercel account and create a new project linked to your GitHub repository.

2.  **Configure the Project**:
    - Vercel should automatically detect the project settings from your `vercel.json` file. No special configuration is needed.

3.  **Deploy**:
    - Click the "Deploy" button. Vercel will install the Python packages from `requirements.txt` and deploy your Flask application.

### 3. Verify Deployment

Once the deployment is complete, open the production URL provided by Vercel. You should see the message:
`AI Meeting Assistant Python backend is running successfully!`

## How to Use the Extension in Chrome

### 1. Load the Extension

1.  Open Chrome and navigate to `chrome://extensions`.
2.  Enable "Developer mode" using the toggle in the top-right corner.
3.  Click "Load unpacked" and select the folder containing the extension's source code (this entire repository).

### 2. Configure the Extension

1.  **Pin the Extension**: Click the puzzle piece icon in the Chrome toolbar and pin the "AI Meeting Assistant" for easy access.
2.  **Open the Popup**: Click the extension's icon to open the main interface.
3.  **Set Your Vercel URL, Provider, and API Key**:
    - In the extension popup, go to the "Settings" section.
    - **Vercel URL**: Enter the full URL of your Vercel deployment (e.g., `https://your-project.vercel.app`).
    - **Provider**: Choose your desired AI provider from the dropdown (OpenAI, Google, OpenRouter, or Mock).
    - **API Key**: Enter your API key for the selected provider.
    - **Save**: Click "Save Settings". Your settings are stored locally and securely.

### 3. Using the Features

-   **Live Audio Transcription**:
    - Toggle on "Tab Audio" to start listening to and transcribing the audio from the current tab. The live transcript will appear below.
-   **Screen Capture**:
    - Click "Capture Screen" to take a screenshot of the visible part of the page.
    - Click "Summarize Image" to send the screenshot for analysis.
-   **Real-time Q&A**:
    - Type a question into the "Ask anything..." input box and press Enter, or click the microphone to use voice-to-text.
    - The AI's response will appear in the box below.
-   **Summarize**:
    - After a transcript has been generated, click "Summarize the key points" to get a summary of the conversation.
