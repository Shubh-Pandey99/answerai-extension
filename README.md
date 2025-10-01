# 🤖 AI Meeting Assistant Chrome Extension

A comprehensive real-time AI assistant for meetings and browser use that provides live transcription, screen analysis, and intelligent Q&A powered by GPT-5.

![AI Meeting Assistant](icon.png)

## ✨ Features

### 🎙️ Live Audio & Transcription
- **Browser Tab Audio Capture**: Listen directly to audio playing in the active browser tab (Google Meet, Zoom, YouTube, etc.)
- **Microphone Audio Capture**: Separate microphone recording for personal notes and questions
- **Real-time Transcription**: Live, on-screen transcription using advanced speech recognition
- **AI-Powered Analysis**: Automatic summaries and insights when recording stops

### 📸 Screen Capture & Analysis  
- **Screenshot Capture**: Capture images of the current browser tab with one click
- **Image Annotation**: Draw and annotate screenshots with built-in tools
- **AI Image Analysis**: OCR and multimodal AI analysis of screenshots, whiteboards, and diagrams
- **Context Understanding**: AI interprets visual content and provides detailed explanations

### 💬 Real-time Q&A
- **Contextual Questions**: Ask questions about the ongoing meeting or captured content
- **Voice Input**: Use microphone for hands-free questioning
- **Multi-Provider AI**: Support for GPT-5, GPT-4o, Gemini, and more
- **Intelligent Responses**: Context-aware answers based on transcripts and images

### 🔔 Smart Notifications & Accessibility
- **Desktop Notifications**: Get notified when recordings start/stop and AI responses are ready
- **Text-to-Speech**: Hear AI responses and summaries spoken aloud
- **On-Page Status**: Visual overlay showing extension status on any webpage
- **Voice Commands**: Full voice control for hands-free operation

## 🚀 Quick Start

### Installation
1. Clone this repository or download the ZIP file
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. Pin the extension to your toolbar for easy access

### Backend Setup
1. Deploy the backend API to Vercel or run locally:
   ```bash
   cd /app/api
   pip install -r ../requirements.txt
   python index.py
   ```

2. Set your backend URL in the extension settings
3. Set your `OPENAI_API_KEY` in the backend environment.

### Usage
1. **Start Recording**: Click the extension icon and toggle "Tab Audio" or "Microphone"  
2. **Capture Screens**: Use the "Capture Screen" button to take screenshots
3. **Ask Questions**: Type or speak questions in the Q&A section
4. **Get Summaries**: Click "Summarize key points" for AI-generated meeting summaries

## 🎯 Use Cases

### For Meetings
- **Live Note-Taking**: Automatic transcription of meetings with key point extraction
- **Action Items**: AI identifies and lists action items with owners and deadlines  
- **Meeting Summaries**: Instant summaries with decisions, topics, and next steps
- **Visual Analysis**: Analyze shared screens, whiteboards, and presentations

### For Learning
- **Lecture Notes**: Transcribe educational content from videos or live sessions
- **Code Analysis**: Capture and analyze code snippets or technical diagrams
- **Research Assistance**: Ask questions about content you're viewing or hearing

### For Productivity
- **Content Creation**: Generate summaries and insights from any audio/visual content
- **Documentation**: Create structured notes from unstructured meetings
- **Knowledge Management**: Build a searchable database of meeting insights

## 🔧 Configuration

### AI Providers
The extension supports multiple AI providers:

- **OpenAI (Default)**: GPT-4o with your own API key.
- **Google**: Use your Google AI API key for Gemini models
- **OpenRouter**: Access to various models through OpenRouter
- **Mock**: For testing without API costs

### Settings Options
- **Provider Selection**: Choose your preferred AI provider
- **Model Selection**: Pick from GPT-5, GPT-4o, GPT-4o-mini
- **Notifications**: Enable/disable desktop notifications
- **Text-to-Speech**: Toggle voice output for AI responses
- **Backend URL**: Configure your API endpoint

## 🛠️ Technical Details

### Architecture
- **Frontend**: Chrome Extension with Manifest V3
- **Backend**: Flask API with multi-provider AI support
- **Audio Processing**: WebAudio API with custom worklets for noise reduction
- **Speech Recognition**: Built-in browser speech-to-text capabilities
- **Image Processing**: Canvas API for annotations and OCR analysis

### APIs Used
- `chrome.tabCapture` - Browser tab audio capture
- `chrome.tabs.captureVisibleTab` - Screenshot functionality  
- `chrome.offscreen` - Background audio processing
- `chrome.notifications` - Desktop notifications
- `SpeechRecognition` - Speech-to-text conversion
- `SpeechSynthesis` - Text-to-speech output

### File Structure
```
├── manifest.json              # Extension configuration
├── popup-enhanced.html        # Main popup interface  
├── popup-enhanced.js          # Popup logic and controls
├── background-enhanced.js     # Background service worker
├── content-script.js          # On-page status and notifications
├── offscreen.html            # Audio processing document
├── offscreen.js              # Audio capture and transcription
├── audio-processor.js        # Audio enhancement worklet
├── popup.css                 # Styles and theming
├── api/
│   └── index.py              # Flask backend API
└── requirements.txt          # Python dependencies
```

## 🔐 Privacy & Security

- **Local Processing**: Audio processing happens locally in your browser
- **Secure API**: All API communications use HTTPS encryption
- **No Data Storage**: Transcripts and images are not stored on our servers
- **Permissions**: Extension only requests necessary Chrome permissions
- **Open Source**: Full source code available for security review

## 🤝 Contributing

We welcome contributions! Please feel free to:
- Report bugs and issues
- Suggest new features
- Submit pull requests
- Improve documentation

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Issues**: Report bugs on GitHub Issues
- **Documentation**: Check this README for common questions
- **Community**: Join discussions in GitHub Discussions

## 🔄 Version History

### v2.0.0 (Current)
- ✅ OpenAI GPT-4o as the default provider.
- ✅ Microphone audio capture alongside tab audio
- ✅ Image annotation and editing tools
- ✅ Desktop notifications and status overlays
- ✅ Text-to-speech for AI responses
- ✅ Context menus for quick actions
- ✅ Improved error handling and retry logic
- ✅ Multiple AI provider support

### v1.0.0
- ✅ Basic tab audio capture and transcription
- ✅ Screenshot capture and AI analysis
- ✅ Real-time Q&A functionality
- ✅ GPT-4 integration

---

**Made with ❤️ for better meetings and productivity**
