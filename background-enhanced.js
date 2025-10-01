let isRecording = false;

// Handle extension installation
chrome.runtime.onInstalled.addListener(() => {
  // Request notification permission
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'AI Meeting Assistant',
    message: 'Extension installed successfully!'
  });
});

// Enhanced message handling
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
  try {
    if (message.target === 'background') {
      if (message.type === 'toggle-recording') {
        isRecording ? await stopRecording() : await startRecording();
      }
    } else if (message.type === 'get-state') {
      sendResponse({ isRecording });
    } else if (message.type === 'show-notification') {
      showDesktopNotification(message.title, message.body);
    }
  } catch (error) {
    console.error('Background script error:', error);
  }
  return true;
});

// Enhanced recording functions
async function startRecording() {
  try {
    isRecording = true;
    
    // Notify all tabs and popup
    chrome.runtime.sendMessage({ type: 'recording-started' });
    broadcastToAllTabs({ type: 'recording-started' });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id });

    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Required to capture tab audio for transcription.'
    });

    chrome.runtime.sendMessage({ type: 'start-recording', target: 'offscreen', data: streamId });
    
    // Show desktop notification
    showDesktopNotification('AI Meeting Assistant', 'Recording started');
    
  } catch (error) {
    console.error('Failed to start recording:', error);
    isRecording = false;
    showDesktopNotification('AI Meeting Assistant', 'Failed to start recording');
  }
}

async function stopRecording() {
  try {
    isRecording = false;
    
    // Notify all tabs and popup
    chrome.runtime.sendMessage({ type: 'recording-stopped' });
    broadcastToAllTabs({ type: 'recording-stopped' });
    
    chrome.runtime.sendMessage({ type: 'stop-recording', target: 'offscreen' });
    await chrome.offscreen.closeDocument();
    
    // Show desktop notification
    showDesktopNotification('AI Meeting Assistant', 'Recording stopped');
    
  } catch (error) {
    console.error('Failed to stop recording:', error);
  }
}

// Broadcast message to all tabs
function broadcastToAllTabs(message) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Ignore errors for tabs without content script
      });
    });
  });
}

// Enhanced desktop notifications
function showDesktopNotification(title, body, iconUrl = 'icon.png') {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: iconUrl,
    title: title,
    message: body
  });
}

// Handle notification clicks
chrome.notifications.onClicked.addListener((notificationId) => {
  // Open extension popup when notification is clicked
  chrome.action.openPopup();
});

// Tab update listener to inject content script
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content-script.js']
    }).catch(() => {
      // Ignore errors for pages that don't allow content scripts
    });
  }
});

// Handle audio data from offscreen document
chrome.runtime.onMessage.addListener((message, sender) => {
  if (message.type === 'audio-data') {
    // Forward audio data to popup and content scripts
    chrome.runtime.sendMessage({ type: 'audio-data', data: message.data });
    broadcastToAllTabs({ type: 'audio-data', data: message.data });
  }
  
  if (message.type === 'transcript-update') {
    // Forward transcript updates
    chrome.runtime.sendMessage({ type: 'transcript-update', transcript: message.transcript });
    broadcastToAllTabs({ type: 'transcript-update', transcript: message.transcript });
  }
});

// Context menu setup
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'ai-assistant-capture',
    title: 'Capture and Analyze with AI',
    contexts: ['page']
  });
  
  chrome.contextMenus.create({
    id: 'ai-assistant-start-recording',
    title: 'Start Audio Recording',
    contexts: ['page']
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'ai-assistant-capture') {
    chrome.tabs.captureVisibleTab({ format: 'png' }, (url) => {
      if (url) {
        broadcastToAllTabs({ type: 'screenshot-captured', url: url });
      }
    });
  } else if (info.menuItemId === 'ai-assistant-start-recording') {
    if (!isRecording) {
      startRecording();
    } else {
      stopRecording();
    }
  }
});