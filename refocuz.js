let showingToday = true;
let widgetEnabled = true;

function initializeTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      button.classList.add('active');
      document.getElementById(`${targetTab}-tab`).classList.add('active');
    });
  });
}

function loadTimerState() {
  chrome.storage.local.get(['timerEnabled'], (result) => {
    widgetEnabled = result.timerEnabled ?? true;
    const timerToggle = document.getElementById('timerEnabled');
    if (timerToggle) {
      timerToggle.checked = widgetEnabled;
    }
  });
}

function saveTimerState(enabled) {
  widgetEnabled = enabled;
  chrome.storage.local.set({ timerEnabled: enabled });
  
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        chrome.tabs.sendMessage(tab.id, { 
          action: 'toggleTimer', 
          enabled: enabled 
        }).catch(() => {});
      }
    });
  });
}

function clearAllHistory() {
  if (confirm('Are you sure you want to clear all time tracking data? This action cannot be undone.')) {
    chrome.storage.local.clear(() => {
      alert('All history has been cleared.');
      loadData();
      saveTimerState(widgetEnabled);
    });
  }
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
  
  loading.style.display = 'none';
  
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
  const titleElement = document.getElementById('timeTypeTitle');
  const toggleBtn = document.getElementById('toggleViewBtn');
  
  loading.style.display = 'block';
  noData.style.display = 'none';
  sitesList.style.display = 'none';
  
  const action = showingToday ? 'getTodayData' : 'getTimeData';
  
  if (titleElement) {
    titleElement.textContent = showingToday ? 'Total Time Today' : 'Total Time (All Time)';
  }
  
  if (toggleBtn) {
    toggleBtn.textContent = showingToday ? 'Show All Time' : 'Show Today Only';
  }
  
  chrome.runtime.sendMessage({ action: action }, (response) => {
    if (chrome.runtime.lastError) {
      loading.style.display = 'none';
      noData.style.display = 'block';
      return;
    }
    
    displayTimeData(response || {});
  });
}

function closeWindow() {
  window.close();
}

function toggleView() {
  showingToday = !showingToday;
  loadData();
}

function clearAllData() {
  if (confirm('Are you sure you want to clear all tracking data? This action cannot be undone.')) {
    chrome.runtime.sendMessage({ action: 'clearData' }, (response) => {
      if (chrome.runtime.lastError) {
        alert('Error clearing data. Please try again.');
        return;
      }
      
      if (response && response.success) {
        loadData();
        alert('All data cleared successfully!');
      } else {
        alert('Error clearing data. Please try again.');
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeTabs();
  loadTimerState();
  loadData();
  
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData();
  });
  
  document.getElementById('toggleViewBtn').addEventListener('click', () => {
    toggleView();
  });
  
  const timerToggle = document.getElementById('timerEnabled');
  if (timerToggle) {
    timerToggle.addEventListener('change', (e) => {
      saveTimerState(e.target.checked);
    });
  }
  
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', () => {
      clearAllHistory();
    });
  }
});

setInterval(() => {
  if (document.visibilityState === 'visible') {
    loadData();
  }
}, 30000);