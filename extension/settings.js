let state = null;

async function init() {
  state = await loadState();
  renderSettings(state);
  initSettings(state);
}

onStorageChanged(['watchLimit', 'cooldownDuration'], async () => {
  const fresh = await loadState();
  if (!fresh) return;
  state = fresh;
  renderSettings(state);
});

document.addEventListener('DOMContentLoaded', init);
