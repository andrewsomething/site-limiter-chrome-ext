/**
 * Pure utility functions and shared constants.
 * No chrome.* or DOM dependencies — safe to use in content.js, background.js, and tests.
 */

const DEFAULT_WATCH_LIMIT_MS = 15 * 60 * 1000;
const DEFAULT_COOLDOWN_MS = 3 * 60 * 60 * 1000;

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
 * An optional subdomain prefix is allowed so a pattern like "reddit.com/*"
 * also matches "old.reddit.com/..." without needing a separate domain-reduction
 * step. '*' only matches within a single path segment (not '/').
 * e.g. "youtube.com/shorts/*" matches "www.youtube.com/shorts/abc123"
 */
function patternToRegex(pattern) {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  // (?:[^.]+\.)* allows zero or more subdomain labels (e.g. "www.", "old.")
  return new RegExp('^(?:[^.]+\\.)*' + escaped, 'i');
}

/**
 * Match the current location against the list of enabled sites.
 * Returns the first matching site object, or null if none match.
 * @param {Array} sites - Array of site config objects
 * @param {string} hostname - e.g. location.hostname
 * @param {string} pathname - e.g. location.pathname
 */
function matchSite(sites, hostname, pathname) {
  const url = hostname + pathname;
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

// Export for Node.js (tests and background.js) — no-op in browser context
if (typeof module !== 'undefined') {
  module.exports = {
    DEFAULT_WATCH_LIMIT_MS,
    DEFAULT_COOLDOWN_MS,
    formatCountdown,
    formatWatchTime,
    patternToRegex,
    matchSite,
  };
}
