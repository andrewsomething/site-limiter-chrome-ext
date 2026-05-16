/**
 * Pure utility functions shared between content.js, popup.js, and tests.
 * No chrome.* or DOM dependencies.
 */

/**
 * Format milliseconds as a human-readable countdown string.
 * e.g. 3723000 → "1h 2m 3s"
 */
function formatCountdown(ms) {
  const totalSeconds = Math.ceil(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

/**
 * Format milliseconds as mm:ss watch time.
 * e.g. 75000 → "1:15"
 */
function formatWatchTime(ms) {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Convert a site glob pattern to a RegExp matching "hostname + pathname".
 * '*' matches any characters within a single path segment (not '/').
 * e.g. "youtube.com/shorts/*" matches "youtube.com/shorts/abc123"
 */
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp('^' + escaped, 'i');
}

/**
 * Reduce a hostname to its registrable domain (last two labels).
 * Strips subdomains so that "old.reddit.com" matches "reddit.com/*".
 * e.g. "old.reddit.com" → "reddit.com", "youtube.com" → "youtube.com"
 */
function registrableDomain(hostname) {
  const parts = hostname.split('.');
  return parts.length > 2 ? parts.slice(-2).join('.') : hostname;
}

/**
 * Match the current location against the list of enabled sites.
 * Returns the first matching site object, or null if none match.
 * @param {Array} sites - Array of site config objects
 * @param {string} hostname - e.g. location.hostname
 * @param {string} pathname - e.g. location.pathname
 */
function matchSite(sites, hostname, pathname) {
  const url = registrableDomain(hostname) + pathname;
  for (const site of sites) {
    if (!site.enabled) {
      continue;
    }
    for (const pattern of site.patterns) {
      if (patternToRegex(pattern).test(url)) {
        return site;
      }
    }
  }
  return null;
}

// Export for Node.js (tests) — no-op in browser context
if (typeof module !== 'undefined') {
  module.exports = {
    formatCountdown,
    formatWatchTime,
    patternToRegex,
    registrableDomain,
    matchSite,
  };
}
