let state = null;

async function init() {
  state = await loadState();
  renderSettings(state);
  initSettings(state);
}

onStorageChanged(['watchLimit', 'cooldownDuration'], async () => {
  state = await loadState();
  renderSettings(state);
});

document.addEventListener('DOMContentLoaded', init);
