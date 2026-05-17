'use strict';

// Load browser scripts as CommonJS modules and expose their exports as globals,
// simulating what <script> tags do in a browser page.
const utils = require('../extension/lib/utils.js');
const ui = require('../extension/lib/ui.js');

beforeAll(() => {
  Object.assign(global, utils, ui);
});

// ── escapeHtml ────────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  test('escapes <, >, &, ", and \'', () => {
    expect(escapeHtml('<b>a & b</b>')).toBe('&lt;b&gt;a &amp; b&lt;/b&gt;');
    expect(escapeHtml('"quoted"')).toBe('&quot;quoted&quot;');
    expect(escapeHtml("it's")).toBe('it&#39;s');
  });

  test('coerces non-string values', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

// ── renderSites ───────────────────────────────────────────────────────────────

describe('renderSites', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="default-sites-list"></div>
      <div id="custom-sites-list"></div>
    `;
  });

  test('does not throw on null state', () => {
    expect(() => renderSites(null)).not.toThrow();
  });

  test('shows empty message when no sites', () => {
    renderSites({ sites: [] });
    expect(document.getElementById('default-sites-list').innerHTML).toContain('None added yet');
    expect(document.getElementById('custom-sites-list').innerHTML).toContain('None added yet');
  });

  test('renders default site with name, pattern, and toggle', () => {
    const state = {
      sites: [
        {
          id: 'yt',
          name: 'YouTube Shorts',
          patterns: ['youtube.com/shorts/*'],
          enabled: true,
          isDefault: true,
        },
      ],
    };
    renderSites(state);
    const list = document.getElementById('default-sites-list');
    expect(list.querySelector('.site-toggle-name').textContent).toBe('YouTube Shorts');
    expect(list.querySelector('.pattern-hint').textContent).toBe('youtube.com/shorts/*');
    expect(list.querySelector('.site-enabled-cb').checked).toBe(true);
  });

  test('does not render delete button for default sites', () => {
    const state = {
      sites: [
        { id: 'yt', name: 'YouTube', patterns: ['youtube.com/*'], enabled: true, isDefault: true },
      ],
    };
    renderSites(state);
    expect(document.getElementById('default-sites-list').querySelector('.delete-btn')).toBeNull();
  });

  test('renders custom sites with delete button', () => {
    const state = {
      sites: [
        {
          id: 'custom-1',
          name: 'My Site',
          patterns: ['mysite.com/*'],
          enabled: false,
          isDefault: false,
        },
      ],
    };
    renderSites(state);
    const list = document.getElementById('custom-sites-list');
    expect(list.querySelector('.delete-btn')).not.toBeNull();
    expect(list.querySelector('.site-enabled-cb').checked).toBe(false);
  });

  test('escapes HTML in site name and pattern', () => {
    const state = {
      sites: [
        {
          id: 'x',
          name: '<script>alert(1)</script>',
          patterns: ['<evil>.com/*'],
          enabled: true,
          isDefault: true,
        },
      ],
    };
    renderSites(state);
    const html = document.getElementById('default-sites-list').innerHTML;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});

// ── renderSettings ────────────────────────────────────────────────────────────

describe('renderSettings', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <input id="watch-limit-minutes" type="number" />
      <input id="cooldown-hours" type="number" />
    `;
  });

  test('does not throw on null state', () => {
    expect(() => renderSettings(null)).not.toThrow();
  });

  test('populates inputs from state', () => {
    renderSettings({ watchLimit: 15 * 60 * 1000, cooldownDuration: 3 * 60 * 60 * 1000 });
    expect(document.getElementById('watch-limit-minutes').value).toBe('15');
    expect(document.getElementById('cooldown-hours').value).toBe('3');
  });

  test('uses defaults when state values are missing', () => {
    renderSettings({});
    expect(document.getElementById('watch-limit-minutes').value).toBe('15');
    expect(document.getElementById('cooldown-hours').value).toBe('3');
  });

  test('handles missing elements gracefully', () => {
    document.body.innerHTML = '';
    expect(() => renderSettings({ watchLimit: 1000, cooldownDuration: 1000 })).not.toThrow();
  });
});

// ── onStorageChanged ──────────────────────────────────────────────────────────

describe('onStorageChanged', () => {
  beforeEach(() => {
    chrome.storage.local.clear();
  });

  test('invokes callback when a watched key changes', () => {
    const cb = jest.fn();
    onStorageChanged(['sites'], cb);
    const listener = chrome.storage.onChanged.addListener.mock.calls.at(-1)[0];
    listener({ sites: { newValue: [] } });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  test('does not invoke callback for unwatched keys', () => {
    const cb = jest.fn();
    onStorageChanged(['sites'], cb);
    const listener = chrome.storage.onChanged.addListener.mock.calls.at(-1)[0];
    listener({ cooldownDuration: { newValue: 1000 } });
    expect(cb).not.toHaveBeenCalled();
  });

  test('invokes callback when any of multiple watched keys changes', () => {
    const cb = jest.fn();
    onStorageChanged(['watchLimit', 'cooldownDuration'], cb);
    const listener = chrome.storage.onChanged.addListener.mock.calls.at(-1)[0];
    listener({ cooldownDuration: { newValue: 5000 } });
    expect(cb).toHaveBeenCalledTimes(1);
  });
});
