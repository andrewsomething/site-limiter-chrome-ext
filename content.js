(function () {
  // Guard against double-injection
  if (window.__shortsLimiterActive) return;
  window.__shortsLimiterActive = true;

  let heartbeatInterval = null;
  let overlayEl = null;
  let countdownInterval = null;
  let isBlocked = false;

  // Intercept any video play attempt while blocked
  document.addEventListener('play', (e) => {
    if (isBlocked && e.target.tagName === 'VIDEO') e.target.pause();
  }, true);

  function isOnShorts() {
    return window.location.pathname.startsWith('/shorts/');
  }

  function formatCountdown(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
    if (minutes > 0) return `${minutes}m ${seconds}s`;
    return `${seconds}s`;
  }

  function showBlockedOverlay(timeUntilUnblock) {
    stopHeartbeat();

    // If overlay already exists, just update the countdown value
    if (overlayEl) {
      const el = overlayEl.querySelector('#sl-countdown');
      if (el) el.textContent = formatCountdown(timeUntilUnblock);
      return;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'shorts-limiter-overlay';
    overlayEl.style.cssText = [
      'position:fixed', 'inset:0', 'background:#0f0f0f', 'z-index:2147483647',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-family:"YouTube Sans",Roboto,Arial,sans-serif', 'color:#fff',
    ].join(';');

    overlayEl.innerHTML = `
      <div style="text-align:center;max-width:420px;padding:2rem;">
        <div style="font-size:3.5rem;margin-bottom:1rem">⏱️</div>
        <h1 style="font-size:1.75rem;font-weight:700;margin:0 0 0.5rem">Shorts limit reached</h1>
        <p style="color:#aaa;font-size:1rem;margin:0 0 2rem">
          You've used up your Shorts watch limit. Time for a break!
        </p>
        <div style="background:#1f1f1f;border-radius:12px;padding:1.5rem">
          <p style="color:#aaa;font-size:0.85rem;margin:0 0 0.4rem;text-transform:uppercase;letter-spacing:.05em">
            Available again in
          </p>
          <p id="sl-countdown" style="font-size:2rem;font-weight:700;color:#ff4444;margin:0">
            ${formatCountdown(timeUntilUnblock)}
          </p>
        </div>
        <p style="color:#555;font-size:0.8rem;margin-top:1.5rem">
          You can adjust the cooldown in the extension popup.
        </p>
      </div>`;

    document.body.appendChild(overlayEl);
    isBlocked = true;
    document.querySelectorAll('video').forEach(v => v.pause());

    // Tick the on-page countdown independently of heartbeats
    let remaining = timeUntilUnblock;
    countdownInterval = setInterval(() => {
      remaining -= 1000;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        countdownInterval = null;
        removeOverlay();
        handleNavigation();
      } else {
        const el = document.getElementById('sl-countdown');
        if (el) el.textContent = formatCountdown(remaining);
      }
    }, 1000);
  }

  function removeOverlay() {
    isBlocked = false;
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
  }

  function sendMessage(msg, callback) {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) return;
        callback(response);
      });
    } catch (_) {
      // Extension context invalidated (e.g. after reload) — stop all activity
      stopHeartbeat();
    }
  }

  function startHeartbeat() {
    if (heartbeatInterval) return;
    heartbeatInterval = setInterval(() => {
      sendMessage({ type: 'HEARTBEAT' }, (response) => {
        if (response?.blocked) {
          showBlockedOverlay(response.timeUntilUnblock);
          stopHeartbeat();
        }
      });
    }, 1000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) { clearInterval(heartbeatInterval); heartbeatInterval = null; }
  }

  function handleNavigation() {
    if (!isOnShorts()) {
      stopHeartbeat();
      removeOverlay();
      return;
    }

    sendMessage({ type: 'CHECK_STATUS' }, (response) => {
      if (response?.blocked) {
        showBlockedOverlay(response.timeUntilUnblock);
      } else {
        removeOverlay();
        startHeartbeat();
      }
    });
  }

  // YouTube fires this on every client-side navigation
  window.addEventListener('yt-navigate-finish', handleNavigation);

  // Handle initial page load
  handleNavigation();
})();
