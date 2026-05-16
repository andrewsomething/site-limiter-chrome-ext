'use strict';

const {
  formatCountdown,
  formatWatchTime,
  patternToRegex,
  matchSite,
} = require('../extension/lib/utils');

// ── formatCountdown ───────────────────────────────────────────────────────────

describe('formatCountdown', () => {
  test('formats seconds only', () => {
    expect(formatCountdown(30000)).toBe('30s');
  });

  test('rounds up partial seconds', () => {
    expect(formatCountdown(1500)).toBe('2s');
  });

  test('formats minutes and seconds', () => {
    expect(formatCountdown(90000)).toBe('1m 30s');
  });

  test('formats hours, minutes, and seconds', () => {
    expect(formatCountdown(3723000)).toBe('1h 2m 3s');
  });

  test('formats exactly 0ms as 0s', () => {
    expect(formatCountdown(0)).toBe('0s');
  });

  test('formats exactly 1 hour', () => {
    expect(formatCountdown(3600000)).toBe('1h 0m 0s');
  });
});

// ── formatWatchTime ───────────────────────────────────────────────────────────

describe('formatWatchTime', () => {
  test('formats zero as 0:00', () => {
    expect(formatWatchTime(0)).toBe('0:00');
  });

  test('pads seconds with leading zero', () => {
    expect(formatWatchTime(5000)).toBe('0:05');
  });

  test('formats 1 minute 15 seconds', () => {
    expect(formatWatchTime(75000)).toBe('1:15');
  });

  test('formats 15 minutes', () => {
    expect(formatWatchTime(15 * 60 * 1000)).toBe('15:00');
  });

  test('truncates sub-second ms', () => {
    expect(formatWatchTime(59999)).toBe('0:59');
  });
});

// ── patternToRegex ────────────────────────────────────────────────────────────

describe('patternToRegex', () => {
  test('matches exact domain', () => {
    expect(patternToRegex('reddit.com/*').test('reddit.com/r/all')).toBe(true);
  });

  test('does not match different domain', () => {
    expect(patternToRegex('reddit.com/*').test('notreddit.com/r/all')).toBe(false);
  });

  test('* does not cross path segments', () => {
    expect(patternToRegex('youtube.com/shorts/*').test('youtube.com/watch?v=x')).toBe(false);
  });

  test('matches youtube shorts correctly', () => {
    expect(patternToRegex('youtube.com/shorts/*').test('youtube.com/shorts/abc123')).toBe(true);
  });

  test('matches with subdomain prefix', () => {
    expect(patternToRegex('reddit.com/*').test('old.reddit.com/r/all')).toBe(true);
  });

  test('matches with www subdomain', () => {
    expect(patternToRegex('youtube.com/shorts/*').test('www.youtube.com/shorts/abc123')).toBe(true);
  });

  test('is case-insensitive', () => {
    expect(patternToRegex('Reddit.com/*').test('reddit.com/r/all')).toBe(true);
  });

  test('escapes dots in domain', () => {
    // "redditXcom/*" should not match "reddit.com/..."
    expect(patternToRegex('reddit.com/*').test('redditXcom/r/all')).toBe(false);
  });

  test('matches ccTLD domain (bbc.co.uk)', () => {
    expect(patternToRegex('bbc.co.uk/*').test('bbc.co.uk/news')).toBe(true);
  });

  test('matches ccTLD with subdomain', () => {
    expect(patternToRegex('bbc.co.uk/*').test('news.bbc.co.uk/article')).toBe(true);
  });

  test('does not match different ccTLD domain', () => {
    expect(patternToRegex('bbc.co.uk/*').test('notbbc.co.uk/news')).toBe(false);
  });
});

// ── matchSite ─────────────────────────────────────────────────────────────────

const SITES = [
  {
    id: 'youtube-shorts',
    name: 'YouTube Shorts',
    patterns: ['youtube.com/shorts/*'],
    enabled: true,
  },
  { id: 'reddit', name: 'Reddit', patterns: ['reddit.com/*'], enabled: true },
  { id: 'twitter', name: 'Twitter', patterns: ['twitter.com/*', 'x.com/*'], enabled: true },
  { id: 'bbc', name: 'BBC', patterns: ['bbc.co.uk/*'], enabled: true },
  { id: 'disabled', name: 'Disabled', patterns: ['disabled.com/*'], enabled: false },
];

describe('matchSite', () => {
  test('matches YouTube Shorts path', () => {
    expect(matchSite(SITES, 'www.youtube.com', '/shorts/abc123')?.id).toBe('youtube-shorts');
  });

  test('does not match YouTube non-shorts', () => {
    expect(matchSite(SITES, 'www.youtube.com', '/watch')).toBeNull();
  });

  test('matches reddit with subdomain', () => {
    expect(matchSite(SITES, 'old.reddit.com', '/r/programming')?.id).toBe('reddit');
  });

  test('matches first pattern of multi-pattern site', () => {
    expect(matchSite(SITES, 'twitter.com', '/home')?.id).toBe('twitter');
  });

  test('matches second pattern of multi-pattern site', () => {
    expect(matchSite(SITES, 'x.com', '/home')?.id).toBe('twitter');
  });

  test('does not match disabled site', () => {
    expect(matchSite(SITES, 'disabled.com', '/page')).toBeNull();
  });

  test('returns null for untracked site', () => {
    expect(matchSite(SITES, 'github.com', '/explore')).toBeNull();
  });

  test('matches ccTLD site (bbc.co.uk)', () => {
    expect(matchSite(SITES, 'bbc.co.uk', '/news')?.id).toBe('bbc');
  });

  test('matches ccTLD site with subdomain', () => {
    expect(matchSite(SITES, 'news.bbc.co.uk', '/article/123')?.id).toBe('bbc');
  });
});
