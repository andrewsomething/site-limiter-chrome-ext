// Shared UI utilities for popup, sites, and settings pages.
// lib/utils.js must be loaded before this file — it exposes:
//   formatCountdown, formatWatchTime, matchSite, DEFAULT_WATCH_LIMIT_MS, DEFAULT_COOLDOWN_MS

// ── Messaging ─────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function loadState() {
  return sendMessage({ type: 'GET_STATE' });
}

// ── Storage sync ──────────────────────────────────────────────────────────────

/**
 * Listen for storage changes on the given keys and invoke callback when any match.
 * Simplifies the boilerplate in sites.js and settings.js.
 */
function onStorageChanged(keys, callback) {
  chrome.storage.onChanged.addListener((changes) => {
    if (keys.some((k) => k in changes)) callback();
  });
}

// ── Sites rendering ───────────────────────────────────────────────────────────

function renderSiteGroup(containerId, sites, state, allowDelete = false) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (sites.length === 0) {
    container.innerHTML =
      '<div style="padding:8px 16px;color:#444;font-size:12px;">None added yet.</div>';
    return;
  }
  container.innerHTML = sites
    .map(
      (site) => `
    <div class="site-toggle-row" data-id="${site.id}">
      <label class="toggle">
        <input type="checkbox" class="site-enabled-cb" data-id="${site.id}" ${site.enabled ? 'checked' : ''} />
        <span class="toggle-slider"></span>
      </label>
      <div style="flex:1;min-width:0;">
        <div class="site-toggle-name">${escapeHtml(site.name)}</div>
        <div class="pattern-hint">${site.patterns.map(escapeHtml).join(', ')}</div>
      </div>
      ${allowDelete ? `<button class="delete-btn" data-id="${site.id}" title="Remove">✕</button>` : ''}
    </div>`
    )
    .join('');

  container.querySelectorAll('.site-toggle-row').forEach((row) => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.delete-btn')) return;
      const cb = row.querySelector('.site-enabled-cb');
      if (!e.target.closest('.toggle')) {
        cb.checked = !cb.checked;
      }
      const site = state.sites.find((s) => s.id === cb.dataset.id);
      if (site) site.enabled = cb.checked;
      await sendMessage({ type: 'UPDATE_SITES', sites: state.sites });
    });
  });

  if (allowDelete) {
    container.querySelectorAll('.delete-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const site = state.sites.find((s) => s.id === btn.dataset.id);
        if (!site) return;
        if (!confirm(`Remove "${site.name}"?`)) return;
        state.sites = state.sites.filter((s) => s.id !== btn.dataset.id);
        await sendMessage({ type: 'UPDATE_SITES', sites: state.sites });
        renderSites(state);
      });
    });
  }
}

function renderSites(state) {
  if (!state) return;
  const sites = state.sites || [];
  renderSiteGroup(
    'default-sites-list',
    sites.filter((s) => s.isDefault),
    state
  );
  renderSiteGroup(
    'custom-sites-list',
    sites.filter((s) => !s.isDefault),
    state,
    true
  );
}

function initAddSite(state) {
  const btn = document.getElementById('add-site-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const nameEl = document.getElementById('new-site-name');
    const patternEl = document.getElementById('new-site-pattern');
    const name = nameEl.value.trim();
    const pattern = patternEl.value.trim();
    if (!name) {
      nameEl.focus();
      return;
    }
    if (!pattern) {
      patternEl.focus();
      return;
    }
    const id = 'custom-' + Date.now();
    state.sites.push({ id, name, patterns: [pattern], enabled: true, isDefault: false });
    await sendMessage({ type: 'UPDATE_SITES', sites: state.sites });
    nameEl.value = '';
    patternEl.value = '';
    renderSites(state);
  });
}

// ── Settings rendering ────────────────────────────────────────────────────────

function renderSettings(state) {
  if (!state) return;
  const minutes = (state.watchLimit || DEFAULT_WATCH_LIMIT_MS) / (60 * 1000);
  const hours = (state.cooldownDuration || DEFAULT_COOLDOWN_MS) / (60 * 60 * 1000);
  const wlEl = document.getElementById('watch-limit-minutes');
  const cdEl = document.getElementById('cooldown-hours');
  if (wlEl) wlEl.value = Math.round(minutes);
  if (cdEl) cdEl.value = parseFloat(hours.toFixed(2));
}

function initSettings(state) {
  const saveBtn = document.getElementById('save-btn');
  if (!saveBtn) return;
  saveBtn.addEventListener('click', async () => {
    const rawMin = parseFloat(document.getElementById('watch-limit-minutes').value);
    const rawHrs = parseFloat(document.getElementById('cooldown-hours').value);
    if (isNaN(rawMin) || rawMin < 1) {
      document.getElementById('watch-limit-minutes').focus();
      return;
    }
    if (isNaN(rawHrs) || rawHrs <= 0) {
      document.getElementById('cooldown-hours').focus();
      return;
    }
    const watchLimit = Math.round(rawMin * 60 * 1000);
    const cooldownDuration = Math.round(rawHrs * 60 * 60 * 1000);
    await sendMessage({ type: 'UPDATE_SETTINGS', settings: { watchLimit, cooldownDuration } });
    state.watchLimit = watchLimit;
    state.cooldownDuration = cooldownDuration;

    const feedback = document.getElementById('save-feedback');
    if (feedback) {
      feedback.style.display = 'inline';
      setTimeout(() => (feedback.style.display = 'none'), 2000);
    }
  });
}

// Export for Node.js (tests) — no-op in browser context
if (typeof module !== 'undefined') {
  module.exports = {
    sendMessage,
    escapeHtml,
    loadState,
    onStorageChanged,
    renderSiteGroup,
    renderSites,
    initAddSite,
    renderSettings,
    initSettings,
  };
}
