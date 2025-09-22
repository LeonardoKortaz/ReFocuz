let currentTabId = null;
let currentUrl = null;
let startTime = null;
let isTracking = false;
let activeTimeMs = 0;

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  handleTabChange(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.active) {
    handleTabChange(tabId);
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    saveCurrentTime();
    stopTracking();
  } else {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      handleTabChange(tabs[0].id);
    }
  }
});

async function handleTabChange(tabId) {
  try {
    saveCurrentTime();
    
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return;
    
    if (shouldTrackUrl(tab.url)) {
      startTracking(tabId, tab.url);
    } else {
      stopTracking();
    }
  } catch (error) {
    console.error('Tab change error:', error);
  }
}

function shouldTrackUrl(url) {
  return url && 
         !url.startsWith('chrome://') && 
         !url.startsWith('chrome-extension://') &&
         !url.startsWith('edge://') &&
         !url.startsWith('about:') &&
         !url.startsWith('moz-extension://');
}

function startTracking(tabId, url) {
  currentTabId = tabId;
  currentUrl = url;
  startTime = Date.now();
  isTracking = true;
  activeTimeMs = 0;
}

function stopTracking() {
  currentTabId = null;
  currentUrl = null;
  startTime = null;
  isTracking = false;
  activeTimeMs = 0;
}

function saveCurrentTime() {
  if (!isTracking || !startTime || !currentUrl) return;
  
  const elapsed = Date.now() - startTime;
  if (elapsed < 1000) return;
  
  const domain = getDomainFromUrl(currentUrl);
  if (!domain) return;
  
  const today = new Date().toDateString();
  const totalKey = domain;
  const todayKey = `${domain}_today_${today}`;
  
  chrome.storage.local.get([totalKey, todayKey], (result) => {
    if (chrome.runtime.lastError) return;
    
    const currentTotalTime = result[totalKey] || 0;
    const currentTodayTime = result[todayKey] || 0;
    
    const newTotalTime = currentTotalTime + elapsed;
    const newTodayTime = currentTodayTime + elapsed;
    
    chrome.storage.local.set({ 
      [totalKey]: newTotalTime,
      [todayKey]: newTodayTime
    }, () => {
      if (!chrome.runtime.lastError) {
        activeTimeMs += elapsed;
      }
    });
  });
}

function getDomainFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTimeData') {
    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({});
        return;
      }
      
      const filteredResult = {};
      for (const [key, value] of Object.entries(result)) {
        if (key !== 'timerEnabled' && typeof value === 'number' && !key.includes('_today_')) {
          filteredResult[key] = value;
        }
      }
      
      sendResponse(filteredResult);
    });
    return true;
  }
  
  if (request.action === 'getTodayData') {
    const today = new Date().toDateString();
    chrome.storage.local.get(null, (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({});
        return;
      }
      
      const todayData = {};
      for (const [key, value] of Object.entries(result)) {
        if (key.includes(`_today_${today}`) && typeof value === 'number') {
          const domain = key.replace(`_today_${today}`, '');
          todayData[domain] = value;
        }
      }
      
      sendResponse(todayData);
    });
    return true;
  }
  
  if (request.action === 'clearData') {
    chrome.storage.local.clear(() => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false });
      } else {
        sendResponse({ success: true });
      }
    });
    return true;
  }
  
  if (request.action === 'incrementTime') {
    const { domain, timeSpent } = request;
    if (!domain || !timeSpent || timeSpent < 0) {
      sendResponse({ success: false });
      return;
    }
    
    const today = new Date().toDateString();
    const totalKey = domain;
    const todayKey = `${domain}_today_${today}`;
    
    chrome.storage.local.get([totalKey, todayKey], (result) => {
      if (chrome.runtime.lastError) {
        sendResponse({ success: false });
        return;
      }
      
      const currentTotalTime = result[totalKey] || 0;
      const currentTodayTime = result[todayKey] || 0;
      
      const newTotalTime = currentTotalTime + timeSpent;
      const newTodayTime = currentTodayTime + timeSpent;
      
      chrome.storage.local.set({ 
        [totalKey]: newTotalTime,
        [todayKey]: newTodayTime
      }, () => {
        if (chrome.runtime.lastError) {
          sendResponse({ success: false });
        } else {
          sendResponse({ success: true });
        }
      });
    });
    return true;
  }
  
  if (request.action === 'timerStarted') {
    const { domain, timestamp } = request;
    startTime = timestamp;
    currentUrl = `https://${domain}`;
    isTracking = true;
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'timerResumed') {
    const { domain, timestamp } = request;
    startTime = timestamp;
    sendResponse({ success: true });
    return true;
  }
  
  if (request.action === 'getDebugInfo') {
    sendResponse({
      trackingActive: isTracking,
      currentTabId: currentTabId,
      currentUrl: currentUrl,
      startTime: startTime ? new Date(startTime).toLocaleTimeString() : null,
      activeTimeMs: activeTimeMs
    });
    return true;
  }
  
  return false;
});