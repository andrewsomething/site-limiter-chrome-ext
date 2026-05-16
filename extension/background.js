const DEFAULT_WATCH_LIMIT_MS = 15 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 3 * 60 * 60 * 1000;

const DEFAULT_SITES = [
  {
    id: 'youtube-shorts',
    name: 'YouTube Shorts',
    patterns: ['youtube.com/shorts/*'],
    enabled: true,
    isDefault: true,
  },
  {
    id: 'youtube',
    name: 'YouTube (all)',
    patterns: ['youtube.com/*'],
    enabled: false,
    isDefault: true,
  },
  { id: 'reddit', name: 'Reddit', patterns: ['reddit.com/*'], enabled: false, isDefault: true },
  {
    id: 'twitter',
    name: 'X / Twitter',
    patterns: ['twitter.com/*', 'x.com/*'],
    enabled: false,
    isDefault: true,
  },
  { id: 'tiktok', name: 'TikTok', patterns: ['tiktok.com/*'], enabled: false, isDefault: true },
  {
    id: 'instagram-reels',
    name: 'Instagram Reels',
    patterns: ['instagram.com/reels/*'],
    enabled: false,
    isDefault: true,
  },
  {
    id: 'instagram',
    name: 'Instagram (all)',
    patterns: ['instagram.com/*'],
    enabled: false,
    isDefault: true,
  },
  {
    id: 'facebook',
    name: 'Facebook',
    patterns: ['facebook.com/*'],
    enabled: false,
    isDefault: true,
  },
];

chrome.runtime.onInstalled.addListener(async () => {
  const data = await storageGet();
  const defaults = {};
  if (!data.sites) defaults.sites = DEFAULT_SITES;
  if (!data.siteStates) defaults.siteStates = {};
  if (!data.watchLimit) defaults.watchLimit = DEFAULT_WATCH_LIMIT_MS;
  if (!data.cooldownDuration) defaults.cooldownDuration = DEFAULT_COOLDOWN_MS;
  if (Object.keys(defaults).length > 0) {
    await storageSet(defaults);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'HEARTBEAT':
      handleHeartbeat(message.siteId, sendResponse);
      return true;
    case 'CHECK_STATUS':
      checkStatus(message.siteId, sendResponse);
      return true;
    case 'GET_STATE':
      getState(sendResponse);
      return true;
    case 'GET_SITES':
      getSites(sendResponse);
      return true;
    case 'UPDATE_SETTINGS':
      updateSettings(message.settings, sendResponse);
      return true;
    case 'UPDATE_SITES':
      updateSites(message.sites, sendResponse);
      return true;
    case 'RESET':
      reset(message.siteId, sendResponse);
      return true;
    case 'RESET_ALL':
      resetAll(sendResponse);
      return true;
  }
});

function storageGet() {
  // get(null) returns the full store — works in both Chrome MV3 and jest-webextension-mock
  return chrome.storage.local.get(null);
}

function storageSet(items) {
  return chrome.storage.local.set(items);
}

async function getStorageData() {
  return storageGet();
}

function getSiteState(siteStates, siteId) {
  return siteStates[siteId] || { watchedTime: 0, blockStartTime: null };
}

async function handleHeartbeat(siteId, sendResponse) {
  const data = await getStorageData();
  const now = Date.now();
  const cooldownDuration = data.cooldownDuration || DEFAULT_COOLDOWN_MS;
  const watchLimit = data.watchLimit || DEFAULT_WATCH_LIMIT_MS;
  const siteStates = data.siteStates || {};
  const state = getSiteState(siteStates, siteId);

  if (state.blockStartTime) {
    const elapsed = now - state.blockStartTime;
    if (elapsed >= cooldownDuration) {
      siteStates[siteId] = { watchedTime: 0, blockStartTime: null };
      await storageSet({ siteStates });
      sendResponse({ blocked: false });
    } else {
      sendResponse({ blocked: true, timeUntilUnblock: cooldownDuration - elapsed });
    }
    return;
  }

  const newWatchedTime = (state.watchedTime || 0) + 1000;

  if (newWatchedTime >= watchLimit) {
    siteStates[siteId] = { watchedTime: watchLimit, blockStartTime: now };
    await storageSet({ siteStates });
    sendResponse({ blocked: true, timeUntilUnblock: cooldownDuration });
  } else {
    siteStates[siteId] = { ...state, watchedTime: newWatchedTime };
    await storageSet({ siteStates });
    sendResponse({ blocked: false, watchedTime: newWatchedTime });
  }
}

async function checkStatus(siteId, sendResponse) {
  const data = await getStorageData();
  const now = Date.now();
  const cooldownDuration = data.cooldownDuration || DEFAULT_COOLDOWN_MS;
  const siteStates = data.siteStates || {};
  const state = getSiteState(siteStates, siteId);

  if (state.blockStartTime) {
    const elapsed = now - state.blockStartTime;
    if (elapsed >= cooldownDuration) {
      siteStates[siteId] = { watchedTime: 0, blockStartTime: null };
      await storageSet({ siteStates });
      sendResponse({ blocked: false, watchedTime: 0 });
    } else {
      sendResponse({ blocked: true, timeUntilUnblock: cooldownDuration - elapsed });
    }
  } else {
    sendResponse({ blocked: false, watchedTime: state.watchedTime || 0 });
  }
}

async function getState(sendResponse) {
  const data = await getStorageData();
  sendResponse({
    sites: data.sites || DEFAULT_SITES,
    siteStates: data.siteStates || {},
    watchLimit: data.watchLimit || DEFAULT_WATCH_LIMIT_MS,
    cooldownDuration: data.cooldownDuration || DEFAULT_COOLDOWN_MS,
  });
}

async function getSites(sendResponse) {
  const data = await storageGet();
  sendResponse({ sites: data.sites || DEFAULT_SITES });
}

async function updateSettings(settings, sendResponse) {
  await storageSet(settings);
  sendResponse({ success: true });
}

async function updateSites(sites, sendResponse) {
  await storageSet({ sites });
  sendResponse({ success: true });
}

async function reset(siteId, sendResponse) {
  const data = await storageGet();
  const siteStates = data.siteStates || {};
  siteStates[siteId] = { watchedTime: 0, blockStartTime: null };
  await storageSet({ siteStates });
  sendResponse({ success: true });
}

async function resetAll(sendResponse) {
  await storageSet({ siteStates: {} });
  sendResponse({ success: true });
}

// Export for tests — no-op in browser (chrome.storage is not a CommonJS module)
if (typeof module !== 'undefined') {
  module.exports = {
    getSiteState,
    handleHeartbeat,
    checkStatus,
    getState,
    reset,
    resetAll,
    DEFAULT_WATCH_LIMIT_MS: 15 * 60 * 1000,
    DEFAULT_COOLDOWN_MS: 3 * 60 * 60 * 1000,
  };
}
