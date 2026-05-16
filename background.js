const DEFAULT_WATCH_LIMIT_MS = 15 * 60 * 1000; // 15 minutes
const DEFAULT_COOLDOWN_MS = 3 * 60 * 60 * 1000; // 3 hours

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    watchedTime: 0,
    blockStartTime: null,
    watchLimit: DEFAULT_WATCH_LIMIT_MS,
    cooldownDuration: DEFAULT_COOLDOWN_MS,
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'HEARTBEAT':
      handleHeartbeat(sendResponse);
      return true;
    case 'CHECK_STATUS':
      checkStatus(sendResponse);
      return true;
    case 'GET_STATE':
      getState(sendResponse);
      return true;
    case 'UPDATE_SETTINGS':
      updateSettings(message.settings, sendResponse);
      return true;
    case 'RESET':
      reset(sendResponse);
      return true;
  }
});

async function getStorageData() {
  return chrome.storage.local.get(['watchedTime', 'blockStartTime', 'watchLimit', 'cooldownDuration']);
}

async function handleHeartbeat(sendResponse) {
  const data = await getStorageData();
  const now = Date.now();

  if (data.blockStartTime) {
    const elapsed = now - data.blockStartTime;
    if (elapsed >= data.cooldownDuration) {
      await chrome.storage.local.set({ watchedTime: 0, blockStartTime: null });
      sendResponse({ blocked: false });
    } else {
      sendResponse({ blocked: true, timeUntilUnblock: data.cooldownDuration - elapsed });
    }
    return;
  }

  const watchLimit = data.watchLimit || DEFAULT_WATCH_LIMIT_MS;
  const newWatchedTime = (data.watchedTime || 0) + 1000;

  if (newWatchedTime >= watchLimit) {
    await chrome.storage.local.set({ watchedTime: watchLimit, blockStartTime: now });
    sendResponse({ blocked: true, timeUntilUnblock: data.cooldownDuration });
  } else {
    await chrome.storage.local.set({ watchedTime: newWatchedTime });
    sendResponse({ blocked: false, watchedTime: newWatchedTime });
  }
}

async function checkStatus(sendResponse) {
  const data = await getStorageData();
  const now = Date.now();

  if (data.blockStartTime) {
    const elapsed = now - data.blockStartTime;
    if (elapsed >= data.cooldownDuration) {
      await chrome.storage.local.set({ watchedTime: 0, blockStartTime: null });
      sendResponse({ blocked: false, watchedTime: 0 });
    } else {
      sendResponse({ blocked: true, timeUntilUnblock: data.cooldownDuration - elapsed });
    }
  } else {
    sendResponse({ blocked: false, watchedTime: data.watchedTime || 0 });
  }
}

async function getState(sendResponse) {
  const data = await getStorageData();
  sendResponse({ ...data, watchLimit: data.watchLimit || DEFAULT_WATCH_LIMIT_MS });
}

async function updateSettings(settings, sendResponse) {
  await chrome.storage.local.set(settings);
  sendResponse({ success: true });
}

async function reset(sendResponse) {
  await chrome.storage.local.set({ watchedTime: 0, blockStartTime: null });
  sendResponse({ success: true });
}
