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

## 🛠️ Backend Setup: Enhanced Python & Flask

The backend is an enhanced Flask application with **GPT-5 integration**, streaming capabilities, and advanced error handling. It acts as an intelligent proxy to various AI providers with built-in noise suppression and professional meeting analysis.

### **Prerequisites**
```bash
Python 3.8+
pip (Python package manager)
Git
```

### **Local Development Setup**
```bash
# 1. Clone the repository
git clone <your-repo-url>
cd ai-meeting-assistant

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Set up environment variables
echo "EMERGENT_LLM_KEY=sk-emergent-97c1bA4Dc3872D68eF" > .env

# 4. Run the development server
python api/index.py

# 5. Test the API
curl http://localhost:5000/api/health
```

## 🚀 Deployment Options

### **Option 1: Vercel (Recommended)**
**✅ Best for**: Free hosting, automatic deployments, global CDN

#### **Step 1: Prepare Repository**
```bash
# Ensure all files are committed
git add .
git commit -m "Enhanced AI Meeting Assistant v2.0"
git push origin main
```

#### **Step 2: Deploy to Vercel**
1. **Create Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **Import Project**: 
   - Click "New Project" 
   - Import from GitHub/GitLab
   - Select your repository
3. **Configure Environment**:
   - Add environment variable: `EMERGENT_LLM_KEY` = `sk-emergent-97c1bA4Dc3872D68eF`
4. **Deploy**: Click "Deploy" - Vercel auto-detects Flask configuration

#### **Step 3: Verify Deployment**
```bash
# Test health endpoint
curl https://your-app.vercel.app/api/health

# Expected response:
{
  "status": "healthy",
  "service": "AI Meeting Assistant Enhanced Backend",
  "version": "2.0.0", 
  "features": ["GPT-5", "Streaming", "Multi-Provider", "Enhanced Audio Processing"],
  "emergent_integration": "enabled"
}
```

### **Option 2: Railway**
**✅ Best for**: Easy database integration, persistent storage

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and deploy
railway login
railway init
railway up

# 3. Set environment variables
railway variables set EMERGENT_LLM_KEY=sk-emergent-97c1bA4Dc3872D68eF
```

### **Option 3: Google Cloud Run**
**✅ Best for**: Enterprise deployment, auto-scaling

```bash
# 1. Create Dockerfile (already included)
# 2. Build and deploy
gcloud run deploy ai-meeting-assistant \
  --source . \
  --platform managed \
  --region us-central1 \
  --set-env-vars EMERGENT_LLM_KEY=sk-emergent-97c1bA4Dc3872D68eF
```

### **Option 4: Heroku**
**✅ Best for**: Traditional deployment, add-ons

```bash
# 1. Create Heroku app
heroku create your-meeting-assistant

# 2. Set environment variables
heroku config:set EMERGENT_LLM_KEY=sk-emergent-97c1bA4Dc3872D68eF

# 3. Deploy
git push heroku main
```

## 🔐 Environment Configuration

### **Required Environment Variables**
```bash
# Emergent LLM Key (provided automatically)
EMERGENT_LLM_KEY=sk-emergent-97c1bA4Dc3872D68eF

# Optional: Custom API keys (if not using Emergent)
OPENAI_API_KEY=your_openai_key_here
GOOGLE_API_KEY=your_google_key_here
OPENROUTER_API_KEY=your_openrouter_key_here
```

### **Vercel Configuration (vercel.json)**
```json
{
  "functions": {
    "api/index.py": {
      "runtime": "@vercel/python"
    }
  },
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/api/index.py"
    }
  ]
}
```

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
