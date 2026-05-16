// stats.js — loaded by stats.html
// Chart is provided by lib/chart.umd.min.js loaded before this script
/* global Chart */

let allStats = {}; // dailyStats from storage
let allSites = []; // site list
let selectedSiteId = 'all';
let selectedDays = 14;

let timeChart = null;
let blocksChart = null;

function getChartColors() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    accent: '#6366f1',
    accentSoft: '#818cf8',
    grid: dark ? '#2e2e4a' : '#e2e2ee',
    text: dark ? '#8888aa' : '#64648a',
    bg: dark ? '#1e1e2e' : '#ffffff',
  };
}

function formatMinutes(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

function buildDateRange(days) {
  const dates = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    dates.push(key);
  }
  return dates;
}

function labelForDate(dateKey) {
  const [, m, d] = dateKey.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

function getDataForRange(dates) {
  const watchedMsPerDay = [];
  const blocksPerDay = [];

  for (const date of dates) {
    const dayData = allStats[date] || {};
    let watchedMs = 0;
    let blocks = 0;

    if (selectedSiteId === 'all') {
      for (const site of Object.values(dayData)) {
        watchedMs += site.watchedMs || 0;
        blocks += site.blocks || 0;
      }
    } else {
      const site = dayData[selectedSiteId] || {};
      watchedMs = site.watchedMs || 0;
      blocks = site.blocks || 0;
    }

    watchedMsPerDay.push(watchedMs);
    blocksPerDay.push(blocks);
  }

  return { watchedMsPerDay, blocksPerDay };
}

function updateSummary(watchedMsPerDay, blocksPerDay) {
  const totalMs = watchedMsPerDay.reduce((a, b) => a + b, 0);
  const totalBlocks = blocksPerDay.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / selectedDays;

  document.getElementById('sum-time').textContent = formatMinutes(totalMs);
  document.getElementById('sum-blocks').textContent = totalBlocks;
  document.getElementById('sum-avg').textContent = formatMinutes(avgMs);
}

function makeChartOptions(yLabel, yFormatter) {
  const c = getChartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${yFormatter(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        grid: { color: c.grid },
        ticks: { color: c.text, font: { size: 11 } },
      },
      y: {
        beginAtZero: true,
        grid: { color: c.grid },
        ticks: {
          color: c.text,
          font: { size: 11 },
          callback: (v) => yFormatter(v),
        },
        title: { display: false },
      },
    },
  };
}

function renderCharts() {
  const dates = buildDateRange(selectedDays);
  const labels = dates.map(labelForDate);
  const { watchedMsPerDay, blocksPerDay } = getDataForRange(dates);
  const c = getChartColors();

  updateSummary(watchedMsPerDay, blocksPerDay);

  const timeData = watchedMsPerDay.map((ms) => Math.round(ms / 60000));

  if (timeChart) {
    timeChart.data.labels = labels;
    timeChart.data.datasets[0].data = timeData;
    timeChart.options = makeChartOptions('Minutes', (v) => `${v}m`);
    timeChart.update();
  } else {
    timeChart = new Chart(document.getElementById('chart-time'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: timeData,
            backgroundColor: c.accent + 'cc',
            borderColor: c.accent,
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: makeChartOptions('Minutes', (v) => `${v}m`),
    });
  }

  if (blocksChart) {
    blocksChart.data.labels = labels;
    blocksChart.data.datasets[0].data = blocksPerDay;
    blocksChart.options = makeChartOptions('Blocks', (v) => v);
    blocksChart.update();
  } else {
    blocksChart = new Chart(document.getElementById('chart-blocks'), {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            data: blocksPerDay,
            backgroundColor: c.accentSoft + 'cc',
            borderColor: c.accentSoft,
            borderWidth: 1,
            borderRadius: 4,
          },
        ],
      },
      options: makeChartOptions('Blocks', (v) => v),
    });
  }
}

function buildSitePills() {
  const container = document.getElementById('site-pills');
  const sites = [{ id: 'all', name: 'All Sites' }, ...allSites.filter((s) => s.enabled)];

  container.innerHTML = '';
  for (const site of sites) {
    const btn = document.createElement('button');
    btn.className = 'pill' + (site.id === selectedSiteId ? ' active' : '');
    btn.textContent = site.name;
    btn.addEventListener('click', () => {
      selectedSiteId = site.id;
      container.querySelectorAll('.pill').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      renderCharts();
    });
    container.appendChild(btn);
  }
}

async function init() {
  const response = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, resolve)
  );
  const statsResponse = await new Promise((resolve) =>
    chrome.runtime.sendMessage({ type: 'GET_STATS' }, resolve)
  );

  allSites = response.sites || [];
  allStats = statsResponse.dailyStats || {};

  buildSitePills();

  document.querySelectorAll('#range-pills .pill').forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedDays = parseInt(btn.dataset.days);
      document.querySelectorAll('#range-pills .pill').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      renderCharts();
    });
  });

  renderCharts();
}

init();
