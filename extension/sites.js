let state = null;

async function init() {
  state = await loadState();
  renderSites(state);
  initAddSite(state);
}

chrome.storage.onChanged.addListener((changes) => {
  if ('sites' in changes || 'siteStates' in changes) {
    loadState().then((fresh) => {
      state = fresh;
      renderSites(state);
    });
  }
});

document.addEventListener('DOMContentLoaded', init);
