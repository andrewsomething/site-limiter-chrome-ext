let state = null;

async function init() {
  state = await loadState();
  renderSettings(state);
  initSettings(state);
  renderPauseSection(state);
  initPauseSection();
}

function renderPauseSection(s) {
  const btn = document.getElementById('pause-toggle-btn');
  if (!btn) return;
  const paused = s && s.isPaused;
  btn.textContent = paused ? 'Resume' : 'Pause';
  btn.classList.toggle('btn-pause-active', !!paused);
}

function initPauseSection() {
  const btn = document.getElementById('pause-toggle-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const res = await sendMessage({ type: 'TOGGLE_PAUSE' });
    if (res) state.isPaused = res.isPaused;
    renderPauseSection(state);
  });
}

onStorageChanged(['watchLimit', 'cooldownDuration', 'isPaused'], async () => {
  const fresh = await loadState();
  if (!fresh) return;
  state = fresh;
  renderSettings(state);
  renderPauseSection(state);
});

document.addEventListener('DOMContentLoaded', init);
