'use strict';

const {
  getSiteState,
  handleHeartbeat,
  checkStatus,
  reset,
  resetAll,
  flushStats,
  pruneOldStats,
  todayKey,
  pendingStats,
  DEFAULT_WATCH_LIMIT_MS,
  DEFAULT_COOLDOWN_MS,
} = require('../extension/background');

function promisify(fn, ...args) {
  return new Promise((resolve) => fn(...args, resolve));
}

beforeEach(() => {
  chrome.storage.local.clear();
  chrome.storage.local.set({
    siteStates: {},
    watchLimit: DEFAULT_WATCH_LIMIT_MS,
    cooldownDuration: DEFAULT_COOLDOWN_MS,
  });
});

// ── getSiteState ──────────────────────────────────────────────────────────────

describe('getSiteState', () => {
  test('returns defaults for unknown siteId', () => {
    expect(getSiteState({}, 'unknown')).toEqual({ watchedTime: 0, blockStartTime: null });
  });

  test('returns stored state for known siteId', () => {
    const stored = { watchedTime: 5000, blockStartTime: null };
    expect(getSiteState({ 'site-a': stored }, 'site-a')).toEqual(stored);
  });
});

// ── handleHeartbeat ───────────────────────────────────────────────────────────

describe('handleHeartbeat', () => {
  test('increments watchedTime by 1000ms', async () => {
    const res = await promisify(handleHeartbeat, 'site-a');
    expect(res.blocked).toBe(false);
    expect(res.watchedTime).toBe(1000);
  });

  test('accumulates across multiple heartbeats', async () => {
    await promisify(handleHeartbeat, 'site-a');
    await promisify(handleHeartbeat, 'site-a');
    const res = await promisify(handleHeartbeat, 'site-a');
    expect(res.watchedTime).toBe(3000);
  });

  test('tracks sites independently', async () => {
    await promisify(handleHeartbeat, 'site-a');
    await promisify(handleHeartbeat, 'site-a');
    const resB = await promisify(handleHeartbeat, 'site-b');
    expect(resB.watchedTime).toBe(1000);
  });

  test('triggers block when limit is reached', async () => {
    chrome.storage.local.set({
      siteStates: {
        'site-a': { watchedTime: DEFAULT_WATCH_LIMIT_MS - 1000, blockStartTime: null },
      },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });
    const res = await promisify(handleHeartbeat, 'site-a');
    expect(res.blocked).toBe(true);
    expect(res.timeUntilUnblock).toBe(DEFAULT_COOLDOWN_MS);
  });

  test('returns blocked during cooldown', async () => {
    chrome.storage.local.set({
      siteStates: { 'site-a': { watchedTime: DEFAULT_WATCH_LIMIT_MS, blockStartTime: Date.now() } },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });
    const res = await promisify(handleHeartbeat, 'site-a');
    expect(res.blocked).toBe(true);
    expect(res.timeUntilUnblock).toBeGreaterThan(0);
  });

  test('unblocks after cooldown expires', async () => {
    chrome.storage.local.set({
      siteStates: {
        'site-a': {
          watchedTime: DEFAULT_WATCH_LIMIT_MS,
          blockStartTime: Date.now() - DEFAULT_COOLDOWN_MS - 1000,
        },
      },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });
    const res = await promisify(handleHeartbeat, 'site-a');
    expect(res.blocked).toBe(false);
  });
});

// ── checkStatus ───────────────────────────────────────────────────────────────

describe('checkStatus', () => {
  test('returns unblocked with 0 time for new site', async () => {
    const res = await promisify(checkStatus, 'site-a');
    expect(res.blocked).toBe(false);
    expect(res.watchedTime).toBe(0);
  });

  test('returns current watchedTime when not blocked', async () => {
    chrome.storage.local.set({
      siteStates: { 'site-a': { watchedTime: 30000, blockStartTime: null } },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });
    const res = await promisify(checkStatus, 'site-a');
    expect(res.blocked).toBe(false);
    expect(res.watchedTime).toBe(30000);
  });

  test('returns blocked with remaining time during cooldown', async () => {
    chrome.storage.local.set({
      siteStates: { 'site-a': { watchedTime: DEFAULT_WATCH_LIMIT_MS, blockStartTime: Date.now() } },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });
    const res = await promisify(checkStatus, 'site-a');
    expect(res.blocked).toBe(true);
    expect(res.timeUntilUnblock).toBeGreaterThan(0);
  });

  test('auto-resets when cooldown has expired', async () => {
    chrome.storage.local.set({
      siteStates: {
        'site-a': {
          watchedTime: DEFAULT_WATCH_LIMIT_MS,
          blockStartTime: Date.now() - DEFAULT_COOLDOWN_MS - 5000,
        },
      },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });
    const res = await promisify(checkStatus, 'site-a');
    expect(res.blocked).toBe(false);
    expect(res.watchedTime).toBe(0);
  });
});

// ── reset ─────────────────────────────────────────────────────────────────────

describe('reset', () => {
  test('resets only the specified site', async () => {
    chrome.storage.local.set({
      siteStates: {
        'site-a': { watchedTime: 50000, blockStartTime: Date.now() },
        'site-b': { watchedTime: 20000, blockStartTime: null },
      },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });

    const res = await promisify(reset, 'site-a');
    expect(res.success).toBe(true);

    const statusA = await promisify(checkStatus, 'site-a');
    expect(statusA.watchedTime).toBe(0);
    expect(statusA.blocked).toBe(false);

    const statusB = await promisify(checkStatus, 'site-b');
    expect(statusB.watchedTime).toBe(20000);
  });
});

// ── resetAll ──────────────────────────────────────────────────────────────────

describe('resetAll', () => {
  test('clears all site states', async () => {
    chrome.storage.local.set({
      siteStates: {
        'site-a': { watchedTime: 50000, blockStartTime: Date.now() },
        'site-b': { watchedTime: 20000, blockStartTime: null },
      },
      watchLimit: DEFAULT_WATCH_LIMIT_MS,
      cooldownDuration: DEFAULT_COOLDOWN_MS,
    });

    const res = await promisify(resetAll);
    expect(res.success).toBe(true);

    const statusA = await promisify(checkStatus, 'site-a');
    expect(statusA.watchedTime).toBe(0);

    const statusB = await promisify(checkStatus, 'site-b');
    expect(statusB.watchedTime).toBe(0);
  });
});

// ── todayKey ──────────────────────────────────────────────────────────────────

describe('todayKey', () => {
  test('returns a YYYY-MM-DD string', () => {
    const key = todayKey();
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('matches current local date', () => {
    const d = new Date();
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    expect(todayKey()).toBe(expected);
  });
});

// ── pruneOldStats ─────────────────────────────────────────────────────────────

describe('pruneOldStats', () => {
  test('removes entries older than 30 days', () => {
    const old = new Date();
    old.setDate(old.getDate() - 31);
    const oldKey = `${old.getFullYear()}-${String(old.getMonth() + 1).padStart(2, '0')}-${String(old.getDate()).padStart(2, '0')}`;

    const stats = {
      [oldKey]: { site: { watchedMs: 1000, blocks: 1 } },
      [todayKey()]: { site: { watchedMs: 2000, blocks: 0 } },
    };

    const result = pruneOldStats(stats);
    expect(result[oldKey]).toBeUndefined();
    expect(result[todayKey()]).toBeDefined();
  });

  test('keeps entries within 30 days', () => {
    const recent = new Date();
    recent.setDate(recent.getDate() - 29);
    const recentKey = `${recent.getFullYear()}-${String(recent.getMonth() + 1).padStart(2, '0')}-${String(recent.getDate()).padStart(2, '0')}`;

    const stats = { [recentKey]: { site: { watchedMs: 1000, blocks: 1 } } };
    const result = pruneOldStats(stats);
    expect(result[recentKey]).toBeDefined();
  });
});

// ── flushStats ────────────────────────────────────────────────────────────────

describe('flushStats', () => {
  beforeEach(() => {
    // Clear pendingStats between tests
    for (const key of Object.keys(pendingStats)) delete pendingStats[key];
    chrome.storage.local.set({ dailyStats: {} });
  });

  test('merges pendingStats into dailyStats in storage', async () => {
    pendingStats['youtube-shorts'] = { watchedMs: 5000, blocks: 1 };
    await flushStats();

    const data = await chrome.storage.local.get(null);
    const today = todayKey();
    expect(data.dailyStats[today]['youtube-shorts'].watchedMs).toBe(5000);
    expect(data.dailyStats[today]['youtube-shorts'].blocks).toBe(1);
  });

  test('accumulates on top of existing dailyStats', async () => {
    const today = todayKey();
    chrome.storage.local.set({
      dailyStats: { [today]: { 'youtube-shorts': { watchedMs: 10000, blocks: 2 } } },
    });

    pendingStats['youtube-shorts'] = { watchedMs: 3000, blocks: 1 };
    await flushStats();

    const data = await chrome.storage.local.get(null);
    expect(data.dailyStats[today]['youtube-shorts'].watchedMs).toBe(13000);
    expect(data.dailyStats[today]['youtube-shorts'].blocks).toBe(3);
  });

  test('clears pendingStats after flush', async () => {
    pendingStats['youtube-shorts'] = { watchedMs: 1000, blocks: 0 };
    await flushStats();
    expect(pendingStats['youtube-shorts']).toBeUndefined();
  });

  test('does nothing when pendingStats is empty', async () => {
    await flushStats();
    const data = await chrome.storage.local.get(null);
    expect(data.dailyStats).toEqual({});
  });
});
