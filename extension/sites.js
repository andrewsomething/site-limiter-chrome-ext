let state = null;

async function init() {
  state = await loadState();
  renderSites(state);
  initAddSite(state);
}

onStorageChanged(['sites', 'siteStates'], async () => {
  const fresh = await loadState();
  if (!fresh) return;
  state = fresh;
  renderSites(state);
});

document.addEventListener('DOMContentLoaded', init);
