let isTimerEnabled = false;

async function loadTimerState() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['timerEnabled'], (result) => {
      isTimerEnabled = result.timerEnabled ?? false;
      updateToggleButton();
      resolve(isTimerEnabled);
    });
  });
}

async function saveTimerState(enabled) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ timerEnabled: enabled }, () => {
      isTimerEnabled = enabled;
      updateToggleButton();
      resolve();
    });
  });
}

function updateToggleButton() {
  const toggleBtn = document.getElementById('toggleTimerBtn');
  const toggleIcon = document.getElementById('toggleIcon');
  const toggleText = document.getElementById('toggleText');
  
  if (!toggleBtn || !toggleIcon || !toggleText) return;
  
  if (isTimerEnabled) {
    toggleBtn.classList.add('enabled');
    toggleBtn.classList.remove('disabled');
    toggleText.textContent = 'Hide timer';
    toggleBtn.title = 'Timer shown - click to hide';
  } else {
    toggleBtn.classList.remove('enabled');
    toggleBtn.classList.add('disabled');
    toggleText.textContent = 'Show timer';
    toggleBtn.title = 'Timer hidden - click to show';
  }
}

async function toggleTimer() {
  const newState = !isTimerEnabled;
  await saveTimerState(newState);
  
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      chrome.tabs.sendMessage(tab.id, {
        action: 'toggleTimer',
        enabled: newState
      }).catch(() => {});
    });
  });
  
  const originalText = document.getElementById('toggleText').textContent;
  document.getElementById('toggleText').textContent = newState ? 'Enabled!' : 'Disabled!';
  setTimeout(() => {
    updateToggleButton();
  }, 1000);
}

function formatTime(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  const minutes = seconds / 60;
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    const remainingMinutes = Math.floor(minutes % 60);
    return `${hours}h ${remainingMinutes}min`;
  } else if (minutes >= 1) {
    return `${minutes.toFixed(1)} min`;
  } else {
    return `${seconds} sec`;
  }
}

function sortSitesByTime(sites) {
  const sitesOverTenSeconds = Object.entries(sites)
    .filter(([site, time]) => time >= 10000)
    .sort(([,a], [,b]) => b - a);
  
  const sitesOverMinute = sitesOverTenSeconds.filter(([site, time]) => time >= 60000);
  
  if (sitesOverMinute.length >= 5) {
    return sitesOverMinute;
  }
  
  return sitesOverTenSeconds;
}

function calculateTotalTime(sites) {
  return Object.values(sites).reduce((total, time) => total + time, 0);
}

function displayTimeData(data) {
  const loading = document.getElementById('loading');
  const noData = document.getElementById('noData');
  const sitesList = document.getElementById('sitesList');
  const totalTimeElement = document.getElementById('totalTime');
  
  loading.classList.remove('show');
  
  const sortedSites = sortSitesByTime(data);
  const totalTime = calculateTotalTime(data);
  
  totalTimeElement.textContent = formatTime(totalTime);
  
  if (sortedSites.length === 0) {
    noData.style.display = 'block';
    sitesList.style.display = 'none';
    return;
  }
  
  noData.style.display = 'none';
  sitesList.style.display = 'block';
  
  sitesList.innerHTML = '';
  
  sortedSites.forEach(([site, time], index) => {
    const percentage = totalTime > 0 ? (time / totalTime * 100).toFixed(1) : 0;
    
    const siteItem = document.createElement('div');
    siteItem.className = 'site-item';
    siteItem.style.animationDelay = `${index * 0.1}s`;
    
    siteItem.innerHTML = `
      <div class="site-header">
        <div class="site-name" title="${site}">${site}</div>
        <div class="site-time">${formatTime(time)}</div>
      </div>
      <div class="site-percentage">${percentage}% of total time</div>
      <div class="progress-bar">
        <div class="progress-fill" style="width: ${percentage}%"></div>
      </div>
    `;
    
    sitesList.appendChild(siteItem);
  });
}

function loadData() {
  const loading = document.getElementById('loading');
  const noData = document.getElementById('noData');
  const sitesList = document.getElementById('sitesList');
  
  loading.classList.add('show');
  noData.style.display = 'none';
  sitesList.style.display = 'none';
  
  chrome.runtime.sendMessage({ action: 'getTodayData' }, (response) => {
    if (chrome.runtime.lastError) {
      loading.classList.remove('show');
      noData.style.display = 'block';
      return;
    }
    
    displayTimeData(response || {});
  });
}

function clearData() {
  if (confirm('Are you sure you want to clear all time data? This action cannot be undone.')) {
    const loading = document.getElementById('loading');
    loading.classList.add('show');
    
    chrome.runtime.sendMessage({ action: 'clearData' }, (response) => {
      if (chrome.runtime.lastError) {
        alert('Error clearing data');
        loading.classList.remove('show');
        return;
      }
      
      if (response && response.success) {
        displayTimeData({});
        alert('Data cleared successfully!');
      } else {
        alert('Error clearing data');
        loading.classList.remove('show');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadTimerState();
  loadData();
  
  document.getElementById('toggleTimerBtn').addEventListener('click', () => {
    toggleTimer();
  });
  
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData();
  });
  
  document.getElementById('clearBtn').addEventListener('click', () => {
    clearData();
  });
  
  document.getElementById('progressBtn').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });
});

setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadData();
  }
}, 5000);