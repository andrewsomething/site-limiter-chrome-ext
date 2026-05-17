// Keep in sync with DEFAULT_WATCH_LIMIT_MS and DEFAULT_COOLDOWN_MS in lib/utils.js
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
    id: 'instagram',
    name: 'Instagram',
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
  if (!data.siteStates) defaults.siteStates = {};
  if (!data.watchLimit) defaults.watchLimit = DEFAULT_WATCH_LIMIT_MS;
  if (!data.cooldownDuration) defaults.cooldownDuration = DEFAULT_COOLDOWN_MS;

  // Sync default sites: add new defaults, remove removed defaults, update
  // names/patterns — while preserving custom sites and enabled state.
  // If a default that was enabled gets removed, demote it to a custom site
  // so the user can decide whether to keep tracking it.
  const defaultIds = new Set(DEFAULT_SITES.map((s) => s.id));
  const existing = (data.sites || []).filter((s) => s.isDefault);
  const custom = (data.sites || []).filter((s) => !s.isDefault);
  const enabledById = Object.fromEntries(existing.map((s) => [s.id, s.enabled]));
  const mergedDefaults = DEFAULT_SITES.map((s) => ({
    ...s,
    enabled: s.id in enabledById ? enabledById[s.id] : s.enabled,
  }));
  const demoted = existing
    .filter((s) => !defaultIds.has(s.id) && s.enabled)
    .map((s) => ({ ...s, isDefault: false }));
  const staleRemoved = existing.some((s) => !defaultIds.has(s.id));
  const changed =
    staleRemoved ||
    !data.sites ||
    mergedDefaults.some((s) => {
      const old = existing.find((e) => e.id === s.id);
      return (
        !old || old.name !== s.name || JSON.stringify(old.patterns) !== JSON.stringify(s.patterns)
      );
    });
  if (changed) {
    defaults.sites = [...mergedDefaults, ...demoted, ...custom];
  }

  if (Object.keys(defaults).length > 0) {
    await storageSet(defaults);
  }

  // Re-inject content scripts into all already-open tabs. Chrome does not
  // do this automatically when an extension is reloaded or updated.
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    if (!tab.url || !tab.url.startsWith('http')) continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['lib/utils.js', 'content.js'],
      });
    } catch (_) {
      // Tab may not be injectable (e.g. chrome:// pages) — silently skip
    }
  }
});

// In-memory stats accumulator — flushed to storage every 10s and on SW suspend.
// Avoids a storage write on every 1s heartbeat tick.
const pendingStats = {}; // { [siteId]: { watchedMs: number, blocks: number } }

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pruneOldStats(dailyStats) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  for (const dateKey of Object.keys(dailyStats)) {
    if (dateKey < cutoffKey) {
      delete dailyStats[dateKey];
    }
  }
  return dailyStats;
}

async function flushStats() {
  const siteIds = Object.keys(pendingStats);
  if (siteIds.length === 0) return;

  const snapshot = {};
  for (const id of siteIds) {
    snapshot[id] = { ...pendingStats[id] };
    delete pendingStats[id];
  }

  const data = await storageGet();
  const dailyStats = pruneOldStats(data.dailyStats || {});
  const today = todayKey();
  if (!dailyStats[today]) dailyStats[today] = {};

  for (const [siteId, delta] of Object.entries(snapshot)) {
    const existing = dailyStats[today][siteId] || { watchedMs: 0, blocks: 0 };
    dailyStats[today][siteId] = {
      watchedMs: existing.watchedMs + delta.watchedMs,
      blocks: existing.blocks + delta.blocks,
    };
  }

  await storageSet({ dailyStats });
}

setInterval(flushStats, 10_000);
if (chrome.runtime.onSuspend) {
  chrome.runtime.onSuspend.addListener(flushStats);
}

// Per-site promise chain — serializes concurrent heartbeats from multiple tabs
// so read-modify-write on siteStates is never interleaved for the same siteId.
const heartbeatQueues = new Map();

function enqueueHeartbeat(siteId, sendResponse) {
  const prev = heartbeatQueues.get(siteId) ?? Promise.resolve();
  const next = prev.then(() => handleHeartbeat(siteId, sendResponse)).catch(() => {}); // swallow — response already sent
  heartbeatQueues.set(siteId, next);
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  switch (message.type) {
    case 'HEARTBEAT':
      enqueueHeartbeat(message.siteId, sendResponse);
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
    case 'GET_STATS':
      getStats(sendResponse);
      return true;
    case 'TOGGLE_PAUSE':
      togglePause(sendResponse);
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

function getSiteState(siteStates, siteId) {
  return siteStates[siteId] || { watchedTime: 0, blockStartTime: null };
}

async function handleHeartbeat(siteId, sendResponse) {
  const data = await storageGet();
  const now = Date.now();

  // If tracking is paused, skip time accumulation entirely
  if (data.isPaused) {
    sendResponse({ blocked: false, paused: true });
    return;
  }

  const sites = data.sites || DEFAULT_SITES;
  const site = sites.find((s) => s.id === siteId);
  const cooldownDuration =
    (site && site.cooldownDuration) || data.cooldownDuration || DEFAULT_COOLDOWN_MS;
  const watchLimit = (site && site.watchLimit) || data.watchLimit || DEFAULT_WATCH_LIMIT_MS;
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

  // Accumulate watch time in memory — flushed to dailyStats every 10s
  if (!pendingStats[siteId]) pendingStats[siteId] = { watchedMs: 0, blocks: 0 };
  pendingStats[siteId].watchedMs += 1000;

  if (newWatchedTime >= watchLimit) {
    siteStates[siteId] = { watchedTime: watchLimit, blockStartTime: now };
    pendingStats[siteId].blocks += 1;
    await storageSet({ siteStates });
    sendResponse({ blocked: true, timeUntilUnblock: cooldownDuration });
  } else {
    siteStates[siteId] = { ...state, watchedTime: newWatchedTime };
    await storageSet({ siteStates });
    sendResponse({ blocked: false, watchedTime: newWatchedTime });
  }
}

async function checkStatus(siteId, sendResponse) {
  const data = await storageGet();
  const now = Date.now();
  const sites = data.sites || DEFAULT_SITES;
  const site = sites.find((s) => s.id === siteId);
  const cooldownDuration =
    (site && site.cooldownDuration) || data.cooldownDuration || DEFAULT_COOLDOWN_MS;
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
  const data = await storageGet();
  sendResponse({
    sites: data.sites || DEFAULT_SITES,
    siteStates: data.siteStates || {},
    watchLimit: data.watchLimit || DEFAULT_WATCH_LIMIT_MS,
    cooldownDuration: data.cooldownDuration || DEFAULT_COOLDOWN_MS,
    isPaused: data.isPaused || false,
  });
}

async function togglePause(sendResponse) {
  const data = await storageGet();
  const isPaused = !data.isPaused;
  await storageSet({ isPaused });
  sendResponse({ isPaused });
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

async function getStats(sendResponse) {
  await flushStats();
  const data = await storageGet();
  sendResponse({ dailyStats: data.dailyStats || {} });
}

// Export for tests — no-op in browser (chrome.storage is not a CommonJS module)
if (typeof module !== 'undefined') {
  module.exports = {
    getSiteState,
    handleHeartbeat,
    checkStatus,
    getState,
    togglePause,
    reset,
    resetAll,
    getStats,
    flushStats,
    pruneOldStats,
    todayKey,
    pendingStats,
    DEFAULT_WATCH_LIMIT_MS,
    DEFAULT_COOLDOWN_MS,
  };
}
