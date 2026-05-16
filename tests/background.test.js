'use strict';

const {
  getSiteState,
  handleHeartbeat,
  checkStatus,
  reset,
  resetAll,
  DEFAULT_WATCH_LIMIT_MS,
  DEFAULT_COOLDOWN_MS,
} = require('../background');

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
