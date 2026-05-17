// stats.js — loaded by stats.html (bundled with esbuild, includes Chart.js)
import {
  Chart,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
} from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

let allStats = {}; // dailyStats from storage
let allSites = []; // site list
let selectedDays = 14;

let timeChart = null;
let blocksChart = null;

// Indigo palette — one shade per site
const PALETTE = [
  '#6366f1',
  '#818cf8',
  '#a5b4fc',
  '#4f46e5',
  '#c7d2fe',
  '#7c3aed',
  '#a78bfa',
  '#8b5cf6',
  '#ddd6fe',
  '#4338ca',
];

function getChartColors() {
  const dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  return {
    grid: dark ? '#2e2e4a' : '#e2e2ee',
    text: dark ? '#8888aa' : '#64648a',
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

function buildDatasets(dates) {
  // Only include sites that have any data in range
  const activeSites = allSites.filter((site) =>
    dates.some(
      (date) => allStats[date]?.[site.id]?.watchedMs > 0 || allStats[date]?.[site.id]?.blocks > 0
    )
  );

  const timeDatasets = activeSites.map((site, i) => ({
    label: site.name,
    data: dates.map((date) => Math.round((allStats[date]?.[site.id]?.watchedMs || 0) / 60000)),
    backgroundColor: PALETTE[i % PALETTE.length] + 'cc',
    borderColor: PALETTE[i % PALETTE.length],
    borderWidth: 1,
    borderRadius: 2,
  }));

  const blocksDatasets = activeSites.map((site, i) => ({
    label: site.name,
    data: dates.map((date) => allStats[date]?.[site.id]?.blocks || 0),
    backgroundColor: PALETTE[i % PALETTE.length] + 'cc',
    borderColor: PALETTE[i % PALETTE.length],
    borderWidth: 1,
    borderRadius: 2,
  }));

  return { timeDatasets, blocksDatasets };
}

function updateSummary(dates) {
  let totalMs = 0;
  let totalBlocks = 0;
  let activeDays = 0;
  for (const date of dates) {
    const dayData = allStats[date] || {};
    let dayMs = 0;
    for (const site of Object.values(dayData)) {
      dayMs += site.watchedMs || 0;
      totalBlocks += site.blocks || 0;
    }
    totalMs += dayMs;
    if (dayMs > 0) activeDays++;
  }
  document.getElementById('sum-time').textContent = formatMinutes(totalMs);
  document.getElementById('sum-blocks').textContent = totalBlocks;
  document.getElementById('sum-avg').textContent =
    activeDays > 0 ? formatMinutes(totalMs / activeDays) : '—';
}

function makeChartOptions(yFormatter) {
  const c = getChartColors();
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: c.text, font: { size: 11 }, boxWidth: 12, padding: 12 } },
      tooltip: {
        callbacks: {
          label: (ctx) => ` ${ctx.dataset.label}: ${yFormatter(ctx.raw)}`,
        },
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { color: c.grid },
        ticks: { color: c.text, font: { size: 11 } },
      },
      y: {
        stacked: true,
        beginAtZero: true,
        grid: { color: c.grid },
        ticks: { color: c.text, font: { size: 11 }, callback: (v) => yFormatter(v) },
      },
    },
  };
}

function updateOrCreateChart(chart, id, datasets, labels, yFormatter) {
  const canvas = document.getElementById(id);
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets = datasets;
    chart.options = makeChartOptions(yFormatter);
    chart.update();
    return chart;
  }
  // Destroy any stale chart on the canvas (e.g. after page reload)
  Chart.getChart(canvas)?.destroy();
  return new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: makeChartOptions(yFormatter),
  });
}

function renderCharts() {
  const dates = buildDateRange(selectedDays);
  const labels = dates.map(labelForDate);
  const { timeDatasets, blocksDatasets } = buildDatasets(dates);

  updateSummary(dates);

  timeChart = updateOrCreateChart(timeChart, 'chart-time', timeDatasets, labels, (v) => `${v}m`);
  blocksChart = updateOrCreateChart(blocksChart, 'chart-blocks', blocksDatasets, labels, (v) => v);
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
