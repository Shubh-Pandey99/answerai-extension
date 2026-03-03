// Background service worker - handles extension lifecycle only
// Audio capture is now handled directly in sidepanel.js via getDisplayMedia

const OFFSCREEN_URL = 'offscreen.html';

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'capture-screen-context',
    title: 'Capture Screen for AI Analysis',
    contexts: ['page']
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'capture-screen-context') {
    chrome.runtime.sendMessage({ type: 'trigger-capture' });
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'get-state') {
    sendResponse?.({ ok: true });
    return true;
  }
});
