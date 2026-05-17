let state = null;

async function init() {
  state = await loadState();
  renderSites(state);
  initAddSite(state);
}

onStorageChanged(['sites', 'siteStates'], async () => {
  state = await loadState();
  renderSites(state);
});

document.addEventListener('DOMContentLoaded', init);
