// lib/utils.js loaded via popup.html script tag — provides formatCountdown, formatWatchTime
const DEFAULT_WATCH_LIMIT_MS = 15 * 60 * 1000;

// ── Utilities ────────────────────────────────────────────────────────────────

function sendMessage(msg) {
  return new Promise((resolve) => chrome.runtime.sendMessage(msg, resolve));
}

// ── State ────────────────────────────────────────────────────────────────────

let state = null; // { sites, siteStates, watchLimit, cooldownDuration }

async function loadState() {
  state = await sendMessage({ type: 'GET_STATE' });
}

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
        progressPct = Math.min(100, (watched / watchLimit) * 100);
      }

      return `
      <div class="site-row">
        <div class="site-header">
          <span class="site-name">${site.name}</span>
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

// ── Sites tab ─────────────────────────────────────────────────────────────────

function renderSites() {
  const sites = state.sites || [];
  renderSiteGroup(
    'default-sites-list',
    sites.filter((s) => s.isDefault)
  );
  renderSiteGroup(
    'custom-sites-list',
    sites.filter((s) => !s.isDefault),
    true
  );
}

function renderSiteGroup(containerId, sites, allowDelete = false) {
  const container = document.getElementById(containerId);
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
        <div class="site-toggle-name">${site.name}</div>
        <div class="pattern-hint">${site.patterns.join(', ')}</div>
      </div>
      ${allowDelete ? `<button class="delete-btn" data-id="${site.id}" title="Remove">✕</button>` : ''}
    </div>`
    )
    .join('');

  container.querySelectorAll('.site-toggle-row').forEach((row) => {
    row.addEventListener('click', async (e) => {
      if (e.target.closest('.delete-btn')) return;
      const cb = row.querySelector('.site-enabled-cb');
      // If the click originated inside .toggle, the browser already toggled the
      // checkbox — don't invert it again. For clicks elsewhere on the row (e.g.
      // the site name), toggle manually to make the whole row clickable.
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
        state.sites = state.sites.filter((s) => s.id !== btn.dataset.id);
        await sendMessage({ type: 'UPDATE_SITES', sites: state.sites });
        renderSites();
      });
    });
  }
}

function initAddSite() {
  document.getElementById('add-site-btn').addEventListener('click', async () => {
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
    renderSites();
  });
}

// ── Settings tab ──────────────────────────────────────────────────────────────

function renderSettings() {
  const minutes = (state.watchLimit || DEFAULT_WATCH_LIMIT_MS) / (60 * 1000);
  const hours = (state.cooldownDuration || 3 * 60 * 60 * 1000) / (60 * 60 * 1000);
  document.getElementById('watch-limit-minutes').value = Math.round(minutes);
  document.getElementById('cooldown-hours').value = parseFloat(hours.toFixed(2));
}

function initSettings() {
  document.getElementById('save-btn').addEventListener('click', async () => {
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
    feedback.style.display = 'inline';
    setTimeout(() => (feedback.style.display = 'none'), 2000);
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
  await loadState();
  initTabs();
  renderStatus();
  renderSites();
  renderSettings();
  initAddSite();
  initSettings();
  initResetAll();
  startPolling();
});
