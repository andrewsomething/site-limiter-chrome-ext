let state = null;

async function init() {
  state = await loadState();
  renderSettings(state);
  initSettings(state);
}

chrome.storage.onChanged.addListener((changes) => {
  if ('watchLimit' in changes || 'cooldownDuration' in changes) {
    loadState().then((fresh) => {
      state = fresh;
      renderSettings(state);
    });
  }
});

document.addEventListener('DOMContentLoaded', init);
