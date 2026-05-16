# Site Limiter

A Chrome extension that limits how long you spend on distracting websites. After your watch limit is reached, the site is blocked for a configurable cooldown period.

## Features

- **Per-site time limits** — track and enforce limits independently per site
- **Configurable limits** — set your own watch limit and cooldown duration
- **Cooldown blocking** — overlay blocks the page until the cooldown expires, with a live countdown
- **Multi-site support** — comes with defaults for YouTube Shorts, Reddit, X/Twitter, TikTok, and Instagram Reels
- **Custom sites** — add any site using URL glob patterns (e.g. `reddit.com/*`)
- **Subdomain matching** — patterns match across subdomains (e.g. `old.reddit.com`)
- **Per-site reset** — manually reset a site's timer at any time
- **Settings persist** — configuration survives extension reloads
- **System theme** — follows your OS light/dark mode preference

## Installation

1. Clone or download this repo
2. Open `chrome://extensions` in Chrome
3. Enable **Developer mode** (top right)
4. Click **Load unpacked** and select the `extension/` subdirectory

## Usage

Click the extension icon to open the popup:

- **Status tab** — see time used per site and reset individual sites
- **Sites tab** — enable/disable sites and add custom ones
- **Settings tab** — configure the watch limit and cooldown duration

## Development

```bash
npm install
npm test        # run unit tests
npm run lint    # ESLint
npm run format  # Prettier
```

A pre-commit hook runs ESLint and Prettier automatically via husky + lint-staged.

### Project structure

```
extension/      # Chrome extension source (load this folder in Chrome)
  manifest.json
  background.js
  content.js
  popup.html / popup.js
  lib/utils.js
  icons/
tests/          # Jest unit tests
```
