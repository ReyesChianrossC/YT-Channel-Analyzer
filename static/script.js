/* ═════════════════════════════════════════════════
   YT Channel Analyzer — Client-side Logic
   ═════════════════════════════════════════════════ */

'use strict';

// ── DOM refs ─────────────────────────────────────
const urlInput       = document.getElementById('channel-url');
const viewsInput     = document.getElementById('min-views');
const analyzeBtn     = document.getElementById('btn-analyze');
const stopBtn        = document.getElementById('btn-stop');
const clearBtn       = document.getElementById('btn-clear');
const exportBtn      = document.getElementById('btn-export');
const progressSection= document.getElementById('progress-section');
const progressFill   = document.getElementById('progress-fill');
const progressLabel  = document.getElementById('progress-label');
const progressMeta   = document.getElementById('progress-meta');
const detailFound    = document.getElementById('detail-found');
const detailEta      = document.getElementById('detail-eta');
const detailDelay    = document.getElementById('detail-delay');
const videoList      = document.getElementById('video-list');
const summaryBox     = document.getElementById('summary-box');
const statFound      = document.getElementById('stat-found');
const statScanned    = document.getElementById('stat-scanned');
const statRate       = document.getElementById('stat-rate');
const sumVideos      = document.getElementById('sum-videos');
const sumScanned     = document.getElementById('sum-scanned');
const sumTopViews    = document.getElementById('sum-top-views');
const sumElapsed     = document.getElementById('sum-elapsed');

// ── State ─────────────────────────────────────────
let evtSource = null;
let collectedVideos = [];
let running = false;

// ── SSE Listener ─────────────────────────────────
function openStream() {
  if (evtSource) { evtSource.close(); evtSource = null; }

  evtSource = new EventSource('/stream');

  evtSource.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    handleEvent(msg);
  };

  evtSource.onerror = () => {
    if (running) showToast('Connection lost. Check the server.', 'error');
    evtSource.close();
    evtSource = null;
  };
}

function handleEvent(msg) {
  switch (msg.type) {
    case 'progress':
      onProgress(msg.data);
      break;
    case 'video_found':
      onVideoFound(msg.data);
      break;
    case 'complete':
      onComplete(msg.data);
      break;
    case 'stopped':
      onStopped(msg.data);
      break;
    case 'error':
      onError(msg.data);
      break;
  }
}

// ── Event handlers ────────────────────────────────
function onProgress(data) {
  progressFill.style.width = `${data.percent.toFixed(1)}%`;
  progressLabel.textContent = data.text || '';
  progressMeta.textContent  = `${data.percent.toFixed(0)}%`;
  if (data.phase)  detailDelay.textContent = data.phase;
  if (data.eta)    detailEta.textContent   = `ETA ${data.eta}`;
}

function onVideoFound(data) {
  collectedVideos.push(data.video);
  statFound.textContent   = data.count;
  detailFound.textContent = `${data.count} qualifying`;
  renderVideoCard(data.video, data.count);
}

function onComplete(data) {
  // Final sorted list may differ if backend re-sorted; re-render
  collectedVideos = data.videos;
  videoList.innerHTML = '';
  collectedVideos.forEach((v, i) => renderVideoCard(v, i + 1));

  // Update stats
  const topViews = collectedVideos.length
    ? collectedVideos[0].views.toLocaleString()
    : '—';

  statFound.textContent   = data.qualifying;
  statScanned.textContent = data.total_scanned;
  statRate.textContent    = data.elapsed;

  sumVideos.textContent   = data.qualifying;
  sumScanned.textContent  = data.total_scanned;
  sumTopViews.textContent = topViews;
  sumElapsed.textContent  = data.elapsed;
  summaryBox.classList.add('visible');

  progressFill.style.width = '100%';
  progressLabel.textContent = '✅ Analysis complete!';
  progressMeta.textContent = '100%';
  progressFill.classList.add('done');

  setRunning(false);
  showToast(`Done! Found ${data.qualifying} qualifying video(s).`, 'success');
}

function onStopped(data) {
  progressLabel.textContent = `⏹ Stopped at ${data.processed}/${data.total}`;
  progressFill.classList.add('done');
  setRunning(false);
  showToast('Analysis stopped. Results so far are shown below.', 'success');
}

function onError(data) {
  showToast(data.message || 'Unknown error.', 'error');
  progressLabel.textContent = '❌ Error';
  setRunning(false);
}

// ── Render video card ─────────────────────────────
function renderVideoCard(video, rank) {
  const card = document.createElement('div');
  card.className = 'video-card';
  card.style.animationDelay = `${Math.min(rank * 0.05, 0.5)}s`;

  const dateHtml = video.upload_date
    ? `<span class="meta-pill date">📅 ${video.upload_date}</span>`
    : '';

  card.innerHTML = `
    <div class="video-card-rank">#${rank}</div>
    <div class="video-card-title">${escHtml(video.title)}</div>
    <div class="video-card-meta">
      <span class="meta-pill views">👁 ${video.views_fmt}</span>
      <span class="meta-pill dur">⏱ ${video.duration}</span>
      ${dateHtml}
    </div>
    <a href="${escHtml(video.url)}" target="_blank" rel="noopener" class="video-card-link">
      🔗 Watch on YouTube
    </a>
  `;

  videoList.appendChild(card);
}

// ── Control helpers ───────────────────────────────
function setRunning(state) {
  running = state;
  analyzeBtn.disabled = state;
  stopBtn.disabled    = !state;

  if (state) {
    analyzeBtn.innerHTML = '<span class="spinner"></span> Analyzing…';
    progressSection.classList.add('visible');
    clearBtn.disabled = true;
  } else {
    analyzeBtn.innerHTML = '🔍 Analyze Channel';
    clearBtn.disabled = false;
    stopBtn.innerHTML = '⏹ Stop &amp; Save';
    if (evtSource) { evtSource.close(); evtSource = null; }
  }
}

// ── Button actions ────────────────────────────────
analyzeBtn.addEventListener('click', async () => {
  const url = urlInput.value.trim();
  if (!url) { showToast('Please enter a YouTube channel URL.', 'error'); return; }

  const minViews = parseInt(viewsInput.value.replace(/[^0-9]/g, ''), 10) || 500000;

  // Reset UI
  collectedVideos = [];
  videoList.innerHTML = '';
  summaryBox.classList.remove('visible');
  progressFill.classList.remove('done');
  progressFill.style.width = '0%';
  progressLabel.textContent = 'Starting…';
  progressMeta.textContent  = '0%';
  detailFound.textContent   = '0 qualifying';
  detailEta.textContent     = 'ETA —';
  detailDelay.textContent   = 'Rate: adaptive';
  statFound.textContent = statScanned.textContent = statRate.textContent = '—';

  setRunning(true);
  openStream();

  const res = await fetch('/analyze', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, min_views: minViews }),
  });

  if (!res.ok) {
    const err = await res.json();
    showToast(err.error || 'Failed to start.', 'error');
    setRunning(false);
  }
});

stopBtn.addEventListener('click', async () => {
  await fetch('/stop', { method: 'POST' });
  stopBtn.disabled = true;
  stopBtn.textContent = 'Stopping…';
});

clearBtn.addEventListener('click', () => {
  collectedVideos = [];
  videoList.innerHTML = '';
  summaryBox.classList.remove('visible');
  progressSection.classList.remove('visible');
  progressFill.classList.remove('done');
  progressFill.style.width = '0%';
  statFound.textContent = statScanned.textContent = statRate.textContent = '—';
  urlInput.value = '';
});

exportBtn.addEventListener('click', () => {
  if (!collectedVideos.length) {
    showToast('No results to export.', 'error');
    return;
  }
  const lines = [
    `YouTube Channel Analyzer — Export`,
    `Date: ${new Date().toLocaleString()}`,
    `Channel: ${urlInput.value.trim()}`,
    `Min Views: ${viewsInput.value}`,
    `Videos Found: ${collectedVideos.length}`,
    '='.repeat(60),
    '',
  ];
  collectedVideos.forEach((v, i) => {
    lines.push(`${i + 1}. ${v.title}`);
    lines.push(`   URL: ${v.url}`);
    lines.push(`   Views: ${v.views_fmt}  |  Duration: ${v.duration}${v.upload_date ? `  |  Date: ${v.upload_date}` : ''}`);
    lines.push('');
  });

  const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `yt_analysis_${Date.now()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
});

// ── Utilities ─────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

let toastTimer;
function showToast(msg, type = '') {
  clearTimeout(toastTimer);
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.body.appendChild(el);

  toastTimer = setTimeout(() => el.remove(), 4000);
}

// ── Nice formatted number input ───────────────────
viewsInput.addEventListener('blur', () => {
  const raw = parseInt(viewsInput.value.replace(/[^0-9]/g, ''), 10);
  if (!isNaN(raw)) viewsInput.value = raw.toLocaleString();
});
viewsInput.addEventListener('focus', () => {
  viewsInput.value = viewsInput.value.replace(/[^0-9]/g, '');
});
