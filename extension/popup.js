// lib/utils.js and lib/ui.js are loaded before this file via popup.html.
// They expose: formatCountdown, formatWatchTime, matchSite, DEFAULT_WATCH_LIMIT_MS,
//              DEFAULT_COOLDOWN_MS, sendMessage, escapeHtml, loadState, renderSites,
//              renderSettings, initAddSite, initSettings, onStorageChanged

// ── State ────────────────────────────────────────────────────────────────────

let state = null;

// ── Tab switching ─────────────────────────────────────────────────────────────

function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ── Status tab ────────────────────────────────────────────────────────────────

function renderStatus() {
  const list = document.getElementById('status-list');
  const enabledSites = (state.sites || []).filter((s) => s.enabled);
  const watchLimit = state.watchLimit || DEFAULT_WATCH_LIMIT_MS;
  const limitLabel = formatWatchTime(watchLimit);

  if (enabledSites.length === 0) {
    list.innerHTML =
      '<div class="empty-status">No sites enabled.<br>Go to the <strong>Sites</strong> tab to enable some.</div>';
    return;
  }

  list.innerHTML = enabledSites
    .map((site) => {
      const siteState = (state.siteStates || {})[site.id] || {
        watchedTime: 0,
        blockStartTime: null,
      };
      let badgeHtml,
        timeHtml,
        progressPct,
        extraHtml = '';

      if (siteState.blockStartTime) {
        const remaining = (state.cooldownDuration || 0) - (Date.now() - siteState.blockStartTime);
        if (remaining <= 0) {
          badgeHtml = '<span class="badge ok">Active</span>';
          timeHtml = `0:00 / ${limitLabel}`;
          progressPct = 0;
        } else {
          badgeHtml = '<span class="badge blocked">Blocked</span>';
          timeHtml = `${limitLabel} / ${limitLabel}`;
          progressPct = 100;
          extraHtml = `<div class="cooldown-text">Available in: ${formatCountdown(remaining)}</div>`;
        }
      } else {
        const watched = siteState.watchedTime || 0;
        badgeHtml = '<span class="badge ok">Active</span>';
        timeHtml = `${formatWatchTime(watched)} / ${limitLabel}`;
        progressPct = Math.min(100, watchLimit > 0 ? (watched / watchLimit) * 100 : 0);
      }

      return `
      <div class="site-row">
        <div class="site-header">
          <span class="site-name">${escapeHtml(site.name)}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            ${badgeHtml}
            <button class="btn btn-ghost site-reset-btn" data-id="${site.id}" style="padding:2px 8px;font-size:11px;border-radius:99px;">Reset</button>
          </div>
        </div>
        <div class="time-label">${timeHtml}</div>
        <div class="progress-track"><div class="progress-fill" style="width:${progressPct}%"></div></div>
        ${extraHtml}
      </div>`;
    })
    .join('');

  list.querySelectorAll('.site-reset-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await sendMessage({ type: 'RESET', siteId: btn.dataset.id });
      if (state.siteStates)
        state.siteStates[btn.dataset.id] = { watchedTime: 0, blockStartTime: null };
      renderStatus();
    });
  });
}

// ── Reset all ─────────────────────────────────────────────────────────────────

function initResetAll() {
  document.getElementById('reset-all-btn').addEventListener('click', async () => {
    await sendMessage({ type: 'RESET_ALL' });
    state.siteStates = {};
    renderStatus();
  });
}

// ── Live polling ──────────────────────────────────────────────────────────────

function startPolling() {
  setInterval(async () => {
    const fresh = await sendMessage({ type: 'GET_STATE' });
    if (!fresh) return;
    state.siteStates = fresh.siteStates;
    state.watchLimit = fresh.watchLimit;
    state.cooldownDuration = fresh.cooldownDuration;
    renderStatus();
  }, 1000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  state = await loadState();
  if (!state) return; // background not ready yet; popup will retry via polling
  initTabs();
  renderStatus();
  // Popup: enable/disable only — add/delete via Sites page
  renderSites(state);
  renderSettings(state);
  initSettings(state);
  initResetAll();
  startPolling();

  document.getElementById('stats-link').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('stats.html') });
  });
  document.getElementById('settings-link').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('settings.html') });
  });
  document.getElementById('manage-sites-link').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('sites.html') });
  });
});
