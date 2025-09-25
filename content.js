let timerWidget = null;
let startTime = null;
let currentDomain = null;
let isActive = false;
let updateInterval = null;
let saveInterval = null;
let lastSavedTime = 0;
let isPaused = false;
let timerEnabled = true;

if (!window.timeTrackerLoaded) {
  window.timeTrackerLoaded = true;

let runtimeWarningShown = false;

function safeSendMessage(message, callback) {
  try {
    if (chrome.runtime && chrome.runtime.id) {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          if (!runtimeWarningShown) {
            runtimeWarningShown = true;
          }
          if (callback) callback(null);
          return;
        }
        if (callback) callback(response);
      });
    } else {
      if (!runtimeWarningShown) {
        runtimeWarningShown = true;
      }
      if (callback) callback(null);
    }
  } catch (error) {
    if (!runtimeWarningShown) {
      runtimeWarningShown = true;
    }
    if (callback) callback(null);
  }
}

async function checkTimerEnabled() {
  return new Promise((resolve) => {
    try {
      if (chrome.storage && chrome.storage.local) {
        chrome.storage.local.get(['timerEnabled'], (result) => {
          if (chrome.runtime.lastError) {
            timerEnabled = false;
            resolve(false);
            return;
          }
          timerEnabled = result.timerEnabled ?? true;
          resolve(timerEnabled);
        });
      } else {
        timerEnabled = false;
        resolve(false);
      }
    } catch (error) {
      timerEnabled = false;
      resolve(false);
    }
  });
}

function toggleTimerVisibility(show) {
  if (!timerWidget) return;
  
  if (show && timerEnabled) {
    timerWidget.style.display = 'block';
  } else {
    timerWidget.style.display = 'none';
  }
}

function autoSaveTime() {
  try {
    if (!checkRuntimeAndCleanup()) {
      return;
    }
    
    if (!isActive || !startTime || !currentDomain || document.hidden || isPaused) return;
    
    const currentElapsed = Date.now() - startTime;
    const timeToSave = currentElapsed - lastSavedTime;
    
    if (timeToSave >= 5000) {
      safeSendMessage({
        action: 'incrementTime',
        domain: currentDomain,
        timeSpent: timeToSave
      });
      
      lastSavedTime = currentElapsed;
    }
  } catch (error) {
  }
}

function checkRuntimeAndCleanup() {
  if (!chrome.runtime || !chrome.runtime.id) {
    if (updateInterval) {
      clearInterval(updateInterval);
      updateInterval = null;
    }
    if (saveInterval) {
      clearInterval(saveInterval);
      saveInterval = null;
    }
    return false;
  }
  return true;
}

function formatTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const totalMinutes = milliseconds / 60000;
  const hours = Math.floor(totalMinutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = Math.floor(totalMinutes % 60);
    const remainingSeconds = totalSeconds % 60;
    return `${hours}:${remainingMinutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  } else if (totalMinutes >= 1) {
    const minutes = Math.floor(totalMinutes);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  } else {
    return `${totalSeconds}s`;
  }
}

function getCurrentDomain() {
  try {
    return window.location.hostname;
  } catch (e) {
    return 'unknown';
  }
}

function pauseTimerOnHidden() {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }
    
    if (!isActive || isPaused || !startTime) return;
    
    const elapsed = Date.now() - startTime;
    const remainingTime = elapsed - lastSavedTime;
    
    if (remainingTime > 1000) {
      safeSendMessage({
        action: 'incrementTime',
        domain: currentDomain,
        timeSpent: remainingTime
      });
      lastSavedTime = elapsed;
    }
    
    isPaused = true;
    
    if (timerWidget) {
      timerWidget.classList.remove('active');
      timerWidget.classList.add('paused');
      const iconElement = timerWidget.querySelector('.time-tracker-icon');
      if (iconElement) {
        iconElement.textContent = 'PAUSED';
      }
      timerWidget.title = 'Timer paused - page inactive';
    }
  } catch (error) {
  }
}

function resumeTimerOnVisible() {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }
    
    if (!isActive || !isPaused || !startTime) return;
    
    const previousElapsed = lastSavedTime;
    startTime = Date.now() - previousElapsed;
    isPaused = false;
    
    if (timerWidget) {
      timerWidget.classList.add('active');
      timerWidget.classList.remove('paused');
      const iconElement = timerWidget.querySelector('.time-tracker-icon');
      if (iconElement) {
        iconElement.textContent = 'ACTIVE';
      }
      timerWidget.title = 'Time spent on this page';
    }
  } catch (error) {
  }
}

function shouldTrackPage() {
  const url = window.location.href;
  return !url.startsWith('chrome://') && 
         !url.startsWith('chrome-extension://') && 
         !url.startsWith('edge://') && 
         !url.startsWith('about:') &&
         !url.startsWith('moz-extension://');
}

async function createTimerWidget() {
  if (timerWidget || !shouldTrackPage()) {
    return;
  }

  await checkTimerEnabled();
  
  timerWidget = document.createElement('div');
  timerWidget.id = 'time-tracker-widget';
  timerWidget.innerHTML = `
    <span class="time-tracker-icon">Session: </span>
    <span class="time-tracker-time">0s</span>
  `;
  
  timerWidget.title = 'Time spent on this page';
  
  if (!timerEnabled) {
    timerWidget.style.display = 'none';
  }
  
  document.body.appendChild(timerWidget);
}

async function startTimer() {
  if (!shouldTrackPage()) return;
  
  await checkTimerEnabled();
  
  currentDomain = getCurrentDomain();
  startTime = Date.now();
  lastSavedTime = 0;
  isActive = true;
  isPaused = false;
  
  if (document.hidden) {
    isPaused = true;
  }
  
  if (timerWidget) {
    if (isPaused) {
      timerWidget.classList.add('paused');
      timerWidget.classList.remove('active');
      const iconElement = timerWidget.querySelector('.time-tracker-icon');
      if (iconElement) {
        iconElement.textContent = 'PAUSED';
      }
      timerWidget.title = 'Timer paused - page inactive';
    } else {
      timerWidget.classList.add('active');
      timerWidget.classList.remove('paused');
    }
  }
  
  if (updateInterval) {
    clearInterval(updateInterval);
  }
  updateInterval = setInterval(updateTimer, 1000);
  
  if (saveInterval) {
    clearInterval(saveInterval);
  }
  saveInterval = setInterval(autoSaveTime, 10000);
  
  safeSendMessage({
    action: 'timerStarted',
    domain: currentDomain,
    timestamp: startTime
  });
}

function updateTimer() {
  try {
    if (!checkRuntimeAndCleanup()) {
      return;
    }
    
    if (!isActive || !startTime || !timerWidget) return;
    
    let elapsed;
    if (isPaused) {
      elapsed = lastSavedTime;
    } else {
      elapsed = Date.now() - startTime;
    }
    
    const timeString = formatTime(elapsed);
    
    const timeElement = timerWidget.querySelector('.time-tracker-time');
    if (timeElement) {
      timeElement.textContent = timeString;
    }
    
    if (timerEnabled) {
      timerWidget.style.display = 'block';
    } else {
      timerWidget.style.display = 'none';
    }
  } catch (error) {
  }
}

function stopTimer() {
  if (!isActive || !startTime) return;
  
  const elapsed = Date.now() - startTime;
  const remainingTime = elapsed - lastSavedTime;
  
  if (remainingTime > 1000) {
    safeSendMessage({
      action: 'incrementTime',
      domain: currentDomain,
      timeSpent: remainingTime
    });
  }
  
  isActive = false;
  startTime = null;
  lastSavedTime = 0;
  
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  
  isActive = false;
  startTime = null;
  lastSavedTime = 0;
}

function removeTimer() {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      if (saveInterval) {
        clearInterval(saveInterval);
        saveInterval = null;
      }
      if (timerWidget && timerWidget.parentNode) {
        timerWidget.parentNode.removeChild(timerWidget);
        timerWidget = null;
      }
      return;
    }
    
    if (isActive && startTime) {
      const elapsed = Date.now() - startTime;
      const remainingTime = elapsed - lastSavedTime;
      
      if (remainingTime > 1000) {
        safeSendMessage({
        action: 'incrementTime',
        domain: currentDomain,
        timeSpent: remainingTime
      });
    }
  }
  
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  
  if (saveInterval) {
    clearInterval(saveInterval);
    saveInterval = null;
  }
  
  if (timerWidget && timerWidget.parentNode) {
    timerWidget.parentNode.removeChild(timerWidget);
    timerWidget = null;
  }
  
  isActive = false;
  startTime = null;
  lastSavedTime = 0;
  } catch (error) {
    try {
      if (updateInterval) {
        clearInterval(updateInterval);
        updateInterval = null;
      }
      if (saveInterval) {
        clearInterval(saveInterval);
        saveInterval = null;
      }
      if (timerWidget && timerWidget.parentNode) {
        timerWidget.parentNode.removeChild(timerWidget);
        timerWidget = null;
      }
    } catch (cleanupError) {
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(async () => {
    await createTimerWidget();
    await startTimer();
  }, 1000);
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await createTimerWidget();
    await startTimer();
  });
} else {
  setTimeout(async () => {
    await createTimerWidget();
    await startTimer();
  }, 500);
}

document.addEventListener('visibilitychange', () => {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }
    
    if (document.hidden) {
      pauseTimerOnHidden();
    } else {
      resumeTimerOnVisible();
    }
  } catch (error) {
  }
});

window.addEventListener('focus', () => {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }
    
    if (!document.hidden && isPaused) {
      resumeTimerOnVisible();
    }
  } catch (error) {
  }
});

window.addEventListener('blur', () => {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }
    
    if (!isPaused) {
      pauseTimerOnHidden();
    }
  } catch (error) {
  }
});

window.addEventListener('beforeunload', () => {
  try {
    if (!chrome.runtime || !chrome.runtime.id) {
      return;
    }
    removeTimer();
  } catch (error) {
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'updateTime') {
    if (currentDomain && request.domain === currentDomain) {
      sendResponse({success: true});
    }
  }
  
  if (request.action === 'toggleTimer') {
    timerEnabled = request.enabled;
    
    if (timerEnabled) {
      toggleTimerVisibility(true);
      if (!isActive && shouldTrackPage()) {
        startTimer();
      }
    } else {
      toggleTimerVisibility(false);
    }
    
    sendResponse({success: true});
  }
  
  if (request.action === 'getTimerState') {
    sendResponse({
      isActive,
      domain: currentDomain,
      startTime,
      elapsed: isActive && startTime ? Date.now() - startTime : 0,
      enabled: timerEnabled
    });
  }
  
  return true;
});

}