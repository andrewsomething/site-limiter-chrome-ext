(function () {
  if (window.__shortsLimiterActive) return;
  window.__shortsLimiterActive = true;

  // lib/utils.js is loaded as a content script before this file (see manifest.json)
  // It exposes: formatCountdown, matchSite

  let heartbeatInterval = null;
  let overlayEl = null;
  let countdownInterval = null;
  let isBlocked = false;
  let activeSiteId = null;

  // Intercept any video play attempt while blocked
  document.addEventListener(
    'play',
    (e) => {
      if (isBlocked && e.target.tagName === 'VIDEO') {
        e.target.pause();
      }
    },
    true
  );

  function showBlockedOverlay(timeUntilUnblock) {
    stopHeartbeat();

    if (overlayEl) {
      const el = overlayEl.querySelector('#sl-countdown');
      if (el) {
        el.textContent = formatCountdown(timeUntilUnblock);
      }
      return;
    }

    overlayEl = document.createElement('div');
    overlayEl.id = 'shorts-limiter-overlay';
    overlayEl.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:#0f0f0f',
      'z-index:2147483647',
      'display:flex',
      'align-items:center',
      'justify-content:center',
      'font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif',
      'color:#fff',
    ].join(';');

    overlayEl.innerHTML = `
      <div style="text-align:center;max-width:420px;padding:2rem;">
        <img src="${chrome.runtime.getURL('icons/icon128.png')}"
             width="64" height="64"
             style="border-radius:16px;margin-bottom:1rem;"
             alt="" />
        <h1 style="font-size:1.75rem;font-weight:700;margin:0 0 0.5rem">Time limit reached</h1>
        <p style="color:#aaa;font-size:1rem;margin:0 0 2rem">
          You've used up your watch limit for this site. Time for a break!
        </p>
        <div style="background:#1f1f1f;border-radius:12px;padding:1.5rem">
          <p style="color:#aaa;font-size:0.85rem;margin:0 0 0.4rem;text-transform:uppercase;letter-spacing:.05em">
            Available again in
          </p>
          <p id="sl-countdown" style="font-size:2rem;font-weight:700;color:#818cf8;margin:0">
            ${formatCountdown(timeUntilUnblock)}
          </p>
        </div>
        <p style="color:#555;font-size:0.8rem;margin-top:1.5rem">
          You can adjust the cooldown in the extension popup.
        </p>
      </div>`;

    document.body.appendChild(overlayEl);
    isBlocked = true;
    document.querySelectorAll('video').forEach((v) => v.pause());

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
        if (el) {
          el.textContent = formatCountdown(remaining);
        }
      }
    }, 1000);
  }

  function removeOverlay() {
    isBlocked = false;
    if (overlayEl) {
      overlayEl.remove();
      overlayEl = null;
    }
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function sendMessage(msg, callback) {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          return;
        }
        callback(response);
      });
    } catch (_) {
      stopHeartbeat();
    }
  }

  function startHeartbeat(siteId) {
    if (heartbeatInterval) {
      return;
    }
    heartbeatInterval = setInterval(() => {
      sendMessage({ type: 'HEARTBEAT', siteId }, (response) => {
        if (response?.blocked) {
          showBlockedOverlay(response.timeUntilUnblock);
          stopHeartbeat();
        }
      });
    }, 1000);
  }

  function stopHeartbeat() {
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function handleNavigation() {
    sendMessage({ type: 'GET_SITES' }, ({ sites }) => {
      const site = matchSite(sites, location.hostname, location.pathname);

      if (!site) {
        stopHeartbeat();
        removeOverlay();
        activeSiteId = null;
        return;
      }

      if (activeSiteId !== site.id) {
        stopHeartbeat();
        activeSiteId = site.id;
      }

      sendMessage({ type: 'CHECK_STATUS', siteId: site.id }, (response) => {
        if (response?.blocked) {
          showBlockedOverlay(response.timeUntilUnblock);
        } else {
          removeOverlay();
          startHeartbeat(site.id);
        }
      });
    });
  }

  window.addEventListener('yt-navigate-finish', handleNavigation);
  window.addEventListener('popstate', handleNavigation);
  window.addEventListener('hashchange', handleNavigation);

  handleNavigation();
})();
