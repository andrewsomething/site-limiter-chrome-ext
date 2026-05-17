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

  if (enabledSites.length === 0) {
    list.innerHTML =
      '<div class="empty-status">No sites enabled.<br>Go to the <strong>Sites</strong> tab to enable some.</div>';
    return;
  }

  list.innerHTML = enabledSites
    .map((site) => {
      // Use per-site override if set, otherwise fall back to global
      const watchLimit = site.watchLimit || state.watchLimit || DEFAULT_WATCH_LIMIT_MS;
      const cooldownDuration =
        site.cooldownDuration || state.cooldownDuration || DEFAULT_COOLDOWN_MS;
      const limitLabel = formatWatchTime(watchLimit);

      const siteState = (state.siteStates || {})[site.id] || {
        watchedTime: 0,
        blockStartTime: null,
      };
      let badgeHtml,
        timeHtml,
        progressPct,
        extraHtml = '';

      if (state.isPaused) {
        badgeHtml = '<span class="badge paused">Paused</span>';
        if (siteState.blockStartTime) {
          // Freeze remaining cooldown at the moment pause was activated
          const elapsedBeforePause = (state.pausedAt || Date.now()) - siteState.blockStartTime;
          const frozenRemaining = Math.max(0, cooldownDuration - elapsedBeforePause);
          timeHtml = `${limitLabel} / ${limitLabel}`;
          progressPct = 100;
          extraHtml = `<div class="cooldown-text">Available in (paused): ${formatCountdown(frozenRemaining)}</div>`;
        } else {
          const watched = siteState.watchedTime || 0;
          timeHtml = `${formatWatchTime(watched)} / ${limitLabel}`;
          progressPct = Math.min(100, watchLimit > 0 ? (watched / watchLimit) * 100 : 0);
        }
      } else if (siteState.blockStartTime) {
        const remaining = cooldownDuration - (Date.now() - siteState.blockStartTime);
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

// ── Pause control ─────────────────────────────────────────────────────────────

function renderPauseControls() {
  const headerBtn = document.getElementById('pause-btn');
  const toggleBtn = document.getElementById('pause-toggle-btn');
  const paused = state.isPaused;

  if (headerBtn) {
    headerBtn.textContent = paused ? '▶' : '⏸';
    headerBtn.style.fontSize = paused ? '20px' : '28px';
    headerBtn.title = paused ? 'Resume tracking' : 'Pause tracking';
  }
  if (toggleBtn) {
    toggleBtn.textContent = paused ? 'Resume' : 'Pause';
    toggleBtn.classList.toggle('btn-pause-active', paused);
  }
}

function initPauseControls() {
  async function toggle() {
    const res = await sendMessage({ type: 'TOGGLE_PAUSE' });
    if (res) state.isPaused = res.isPaused;
    renderPauseControls();
    renderStatus();
  }
  document.getElementById('pause-btn')?.addEventListener('click', toggle);
  document.getElementById('pause-toggle-btn')?.addEventListener('click', toggle);
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
    state.isPaused = fresh.isPaused;
    state.pausedAt = fresh.pausedAt;
    renderStatus();
    renderPauseControls();
  }, 1000);
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener(
  'DOMContentLoaded',
  async () => {
    state = await loadState();
    if (!state) return; // background not ready yet; popup will retry via polling
    initTabs();
    renderStatus();
    renderPauseControls();
    // Popup: enable/disable only — add/delete via Sites page
    renderSites(state);
    renderSettings(state);
    initSettings(state);
    initPauseControls();
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
  },
  { once: true }
);
