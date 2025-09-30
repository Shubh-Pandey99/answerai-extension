# AI Meeting Assistant Extension

This repository contains the source code for the AI Meeting Assistant browser extension and its Python backend service. The extension is designed to help you transcribe, summarize, and ask questions about live audio, screen captures, and more, using your preferred AI provider.

## Features

- **Multi-Provider Support**: Use API keys from OpenAI, Google, or OpenRouter.
- **Mock Provider**: Test the extension's functionality without needing a real API key.
- **Live Transcription**: Capture and transcribe audio directly from your current browser tab.
- **Screen Capture Analysis**: Take a screenshot of the current tab and get an AI-powered summary.
- **Real-time Q&A**: Ask questions about the transcribed text and get instant answers.
- **Summarization**: Get a concise summary of the entire conversation.

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
    - Vercel should automatically detect the project settings from your `vercel.json` file. No special configuration is needed. The API keys are now handled by the extension itself, so you do not need to set any environment variables on the server.

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
3.  **Update the Backend URL**:
    - Open the `popup.js` file in your code editor.
    - Find the line with `fetch('https://answerai-extension-twq4.vercel.app/api/answer', ...)`
    - Replace the URL with your new Vercel deployment URL.
    - Go back to `chrome://extensions` and click the "Reload" button for the extension.
4.  **Set Your Provider and API Key**:
    - In the extension popup, go to the "Settings" section.
    - **Provider**: Choose your desired AI provider from the dropdown (OpenAI, Google, OpenRouter, or Mock).
    - **API Key**: Enter your API key for the selected provider.
    - **Save**: Click "Save Settings". Your key is stored locally and securely.

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
