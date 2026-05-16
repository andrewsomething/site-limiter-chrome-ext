const DEFAULT_WATCH_LIMIT_MS = 15 * 60 * 1000;

function formatCountdown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function formatWatchTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function renderState(data) {
  const badge = document.getElementById('status-badge');
  const timeLabel = document.getElementById('time-label');
  const fill = document.getElementById('progress-fill');
  const cooldownInfo = document.getElementById('cooldown-info');
  const watchLimit = data.watchLimit || DEFAULT_WATCH_LIMIT_MS;
  const limitLabel = formatWatchTime(watchLimit);

  if (data.blockStartTime) {
    const elapsed = Date.now() - data.blockStartTime;
    const remaining = (data.cooldownDuration || 0) - elapsed;

    if (remaining <= 0) {
      renderAvailable(0, watchLimit, limitLabel, badge, timeLabel, fill, cooldownInfo);
    } else {
      badge.textContent = 'Blocked';
      badge.className = 'badge blocked';
      timeLabel.textContent = `${limitLabel} / ${limitLabel}`;
      fill.style.width = '100%';
      cooldownInfo.style.display = 'block';
      cooldownInfo.textContent = `Available in: ${formatCountdown(remaining)}`;
    }
  } else {
    renderAvailable(data.watchedTime || 0, watchLimit, limitLabel, badge, timeLabel, fill, cooldownInfo);
  }
}

function renderAvailable(watchedTime, watchLimit, limitLabel, badge, timeLabel, fill, cooldownInfo) {
  badge.textContent = 'Active';
  badge.className = 'badge ok';
  const pct = Math.min(100, (watchedTime / watchLimit) * 100);
  timeLabel.textContent = `${formatWatchTime(watchedTime)} / ${limitLabel}`;
  fill.style.width = `${pct}%`;
  cooldownInfo.style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
  // Load initial state and start live polling
  chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
    if (chrome.runtime.lastError || !data) return;
    renderState(data);
    const hours = (data.cooldownDuration || 3 * 60 * 60 * 1000) / (60 * 60 * 1000);
    document.getElementById('cooldown-hours').value = parseFloat(hours.toFixed(2));
    const minutes = (data.watchLimit || DEFAULT_WATCH_LIMIT_MS) / (60 * 1000);
    document.getElementById('watch-limit-minutes').value = Math.round(minutes);
  });

  setInterval(() => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
      if (chrome.runtime.lastError || !data) return;
      renderState(data);
    });
  }, 1000);

  // Save settings
  document.getElementById('save-btn').addEventListener('click', () => {
    const rawHours = parseFloat(document.getElementById('cooldown-hours').value);
    const rawMinutes = parseFloat(document.getElementById('watch-limit-minutes').value);
    if (isNaN(rawHours) || rawHours <= 0) { document.getElementById('cooldown-hours').focus(); return; }
    if (isNaN(rawMinutes) || rawMinutes < 1) { document.getElementById('watch-limit-minutes').focus(); return; }
    const cooldownDuration = Math.round(rawHours * 60 * 60 * 1000);
    const watchLimit = Math.round(rawMinutes * 60 * 1000);
    chrome.runtime.sendMessage(
      { type: 'UPDATE_SETTINGS', settings: { cooldownDuration, watchLimit } },
      () => {
        const feedback = document.getElementById('save-feedback');
        feedback.style.display = 'inline';
        setTimeout(() => (feedback.style.display = 'none'), 2000);
      }
    );
  });

  // Reset timer
  document.getElementById('reset-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RESET' }, () => {
      chrome.runtime.sendMessage({ type: 'GET_STATE' }, (data) => {
        if (data) renderState(data);
      });
    });
  });
});
