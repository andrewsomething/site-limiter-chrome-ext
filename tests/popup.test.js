'use strict';

// Tests for popup.js init logic.
// utils.js and ui.js are loaded via require() and assigned to global (simulating <script> tags).
// popup.js is loaded fresh per test via new Function() to get a clean closure
// (fresh `state` variable + new { once: true } DOMContentLoaded listener).

const fs = require('fs');
const path = require('path');
const utils = require('../extension/lib/utils.js');
const ui = require('../extension/lib/ui.js');

const popupCode = fs.readFileSync(path.join(__dirname, '../extension/popup.js'), 'utf8');

// Assign shared lib exports to global (as <script> tags would do)
beforeAll(() => {
  Object.assign(global, utils, ui);
});

// Minimal popup HTML covering all elements popup.js references
const POPUP_HTML = `
  <div id="status-list"></div>
  <div id="default-sites-list"></div>
  <div id="custom-sites-list"></div>
  <input id="watch-limit-minutes" type="number" />
  <input id="cooldown-hours" type="number" />
  <button id="pause-btn">⏸</button>
  <button id="pause-toggle-btn">Pause</button>
  <button id="save-btn">Save</button>
  <button id="reset-all-btn">Reset all</button>
  <button id="stats-link">Stats</button>
  <button id="settings-link">Settings</button>
  <button id="manage-sites-link">Manage</button>
  <div class="tab-btn" data-tab="status"></div>
  <div class="tab-btn" data-tab="sites"></div>
  <div class="tab-btn" data-tab="settings"></div>
  <div id="tab-status" class="tab-panel"></div>
  <div id="tab-sites" class="tab-panel"></div>
  <div id="tab-settings" class="tab-panel"></div>
`;

const DEFAULT_STATE = {
  sites: [
    {
      id: 'yt-shorts',
      name: 'YouTube Shorts',
      patterns: ['youtube.com/shorts/*'],
      enabled: true,
      isDefault: true,
    },
  ],
  siteStates: {},
  watchLimit: 15 * 60 * 1000,
  cooldownDuration: 3 * 60 * 60 * 1000,
};

beforeEach(() => {
  jest.useFakeTimers();
  document.body.innerHTML = POPUP_HTML;
  jest.clearAllMocks();
  // Load popup.js fresh — new Function() creates a new scope so `let state`
  // and all inner functions are fresh, and a new { once: true } listener is registered.

  new Function(popupCode)();
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

// Dispatches DOMContentLoaded and drains the microtask queue so the async
// handler (which awaits loadState()) fully completes before assertions.
async function triggerInit() {
  document.dispatchEvent(new Event('DOMContentLoaded'));
  // The sendMessage mock calls cb synchronously, so loadState() resolves as
  // a microtask. Flush the queue with multiple Promise.resolve() rounds
  // (avoids setTimeout which would hang under fake timers).
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

// ── Null state guard ──────────────────────────────────────────────────────────

test('does not throw when loadState returns null (background not ready)', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(null));
  await expect(triggerInit()).resolves.not.toThrow();
});

test('does not throw when loadState returns undefined', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(undefined));
  await expect(triggerInit()).resolves.not.toThrow();
});

// ── Normal init ───────────────────────────────────────────────────────────────

test('renders site names in status list when state is valid', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(DEFAULT_STATE));
  await triggerInit();
  expect(document.getElementById('status-list').innerHTML).toContain('YouTube Shorts');
});

test('renders enabled site with Active badge', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(DEFAULT_STATE));
  await triggerInit();
  expect(document.querySelector('.badge.ok')).not.toBeNull();
});

test('shows blocked badge when site is in cooldown', async () => {
  const state = {
    ...DEFAULT_STATE,
    siteStates: {
      'yt-shorts': { watchedTime: 15 * 60 * 1000, blockStartTime: Date.now() - 1000 },
    },
  };
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(state));
  await triggerInit();
  expect(document.querySelector('.badge.blocked')).not.toBeNull();
});

test('shows empty state message when no sites are enabled', async () => {
  const state = {
    ...DEFAULT_STATE,
    sites: DEFAULT_STATE.sites.map((s) => ({ ...s, enabled: false })),
  };
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(state));
  await triggerInit();
  expect(document.getElementById('status-list').innerHTML).toContain('No sites enabled');
});

test('populates settings inputs from state', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(DEFAULT_STATE));
  await triggerInit();
  expect(document.getElementById('watch-limit-minutes').value).toBe('15');
  expect(document.getElementById('cooldown-hours').value).toBe('3');
});

test('progress bar is 0% when watchedTime is 0 (no NaN)', async () => {
  const state = {
    ...DEFAULT_STATE,
    siteStates: { 'yt-shorts': { watchedTime: 0, blockStartTime: null } },
  };
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(state));
  await triggerInit();
  const fill = document.querySelector('.progress-fill');
  expect(fill).not.toBeNull();
  expect(fill.style.width).toBe('0%');
});

// ── Tab switching ─────────────────────────────────────────────────────────────

test('clicking a tab button activates that tab panel', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) => cb(DEFAULT_STATE));
  await triggerInit();

  const sitesBtn = document.querySelector('.tab-btn[data-tab="sites"]');
  sitesBtn.click();

  expect(sitesBtn.classList.contains('active')).toBe(true);
  expect(document.getElementById('tab-sites').classList.contains('active')).toBe(true);
  expect(document.getElementById('tab-status').classList.contains('active')).toBe(false);
});

// ── Pause controls ────────────────────────────────────────────────────────────

test('header pause button shows ⏸ when not paused', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) =>
    cb({ ...DEFAULT_STATE, isPaused: false })
  );
  await triggerInit();
  expect(document.getElementById('pause-btn').textContent).toBe('⏸');
});

test('header pause button shows ▶ when paused', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) =>
    cb({ ...DEFAULT_STATE, isPaused: true })
  );
  await triggerInit();
  expect(document.getElementById('pause-btn').textContent).toBe('▶');
});

test('status tab shows Paused badge when isPaused', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) =>
    cb({ ...DEFAULT_STATE, isPaused: true })
  );
  await triggerInit();
  expect(document.querySelector('.badge.paused')).not.toBeNull();
  expect(document.querySelector('.badge.ok')).toBeNull();
});

test('status tab shows Active badge when not paused', async () => {
  chrome.runtime.sendMessage.mockImplementation((_msg, cb) =>
    cb({ ...DEFAULT_STATE, isPaused: false })
  );
  await triggerInit();
  expect(document.querySelector('.badge.ok')).not.toBeNull();
  expect(document.querySelector('.badge.paused')).toBeNull();
});
