const DATA_URL = './data/market-radar.json';

const numberFmt = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });
const currencyFmt = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 2,
});
const dateFmt = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const state = {
  payload: null,
  isLocalServer: false,
  rowMap: new Map(),
  stocksByTicker: new Map(),
  sortCol: 'composite_score',
  sortDir: 'descending',
  filters: {
    preset: 'all',
    q: '',
    sector: 'all',
    regime: 'all',
    minScore: 0,
  },
};

const els = {
  table: document.getElementById('radar-table'),
  tbody: document.getElementById('radar-tbody'),
  reorderStatus: document.getElementById('reorder-status'),
  liveFeedback: document.getElementById('live-feedback'),
  emptyState: document.getElementById('empty-state'),
  refreshBtn: document.getElementById('refresh-btn'),
  exportCsvBtn: document.getElementById('export-csv-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  dataSourceBadge: document.getElementById('data-source-badge'),
  lastUpdated: document.getElementById('last-updated'),
  kpiSpyPrice: document.getElementById('kpi-spy-price'),
  kpiSpyRegime: document.getElementById('kpi-spy-regime'),
  kpiStage2Pct: document.getElementById('kpi-stage2-pct'),
  kpiStage2Count: document.getElementById('kpi-stage2-count'),
  kpiSignalsCount: document.getElementById('kpi-signals-count'),
  kpiAvgMom: document.getElementById('kpi-avg-mom'),
  kpiTopSector: document.getElementById('kpi-top-sector'),
  kpiVisibleCount: document.getElementById('kpi-visible-count'),
  filterSearch: document.getElementById('filter-search'),
  filterSector: document.getElementById('filter-sector'),
  filterRegime: document.getElementById('filter-regime'),
  filterMinScore: document.getElementById('filter-min-score'),
  minScoreOutput: document.getElementById('min-score-output'),
  resetFiltersBtn: document.getElementById('reset-filters-btn'),
  presetButtons: [...document.querySelectorAll('.preset-chip')],
  dialog: document.getElementById('stock-detail-dialog'),
  dialogSector: document.getElementById('dialog-sector-badge'),
  dialogTitle: document.getElementById('dialog-stock-title'),
  dialogSubtitle: document.getElementById('dialog-stock-subtitle'),
  dialogComposite: document.getElementById('dialog-composite-score'),
  dialogSignal: document.getElementById('dialog-signal-badge'),
  dialogChart: document.getElementById('dialog-chart-container'),
  dialogPillars: document.getElementById('dialog-pillars-grid'),
  dialogMetrics: document.getElementById('dialog-metrics-grid'),
  dialogThesis: document.getElementById('dialog-thesis'),
  dialogYahooLink: document.getElementById('dialog-yahoo-link'),
};

function fmtSignedPct(val, digits = 1) {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  const sign = val > 0 ? '+' : '';
  return `${sign}${val.toFixed(digits)}%`;
}

function fmtNum(val, digits = 2) {
  if (val === null || val === undefined || Number.isNaN(val)) return '—';
  return val.toFixed(digits);
}

function signalClass(signal) {
  if (signal === 'STRONG BUY') return 'signal-strong-buy';
  if (signal === 'ACCUMULATE') return 'signal-accumulate';
  if (signal === 'HOLD / WATCH') return 'signal-hold';
  return 'signal-avoid';
}

function scoreClass(score) {
  if (score >= 75) return 'score-high';
  if (score >= 55) return 'score-mid';
  return 'score-low';
}

function buildSparklineSvg(values, width = 76, height = 24) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, idx) => {
      const x = (idx / (values.length - 1)) * (width - 4) + 2;
      const y = height - 3 - ((v - min) / span) * (height - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const isUp = values[values.length - 1] >= values[0];
  const stroke = isUp ? 'var(--pos)' : 'var(--neg)';
  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><polyline fill="none" stroke="${stroke}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/></svg>`;
}

function showFeedback(message) {
  els.liveFeedback.textContent = message;
  els.liveFeedback.hidden = false;
}

function hideFeedback() {
  els.liveFeedback.hidden = true;
  els.liveFeedback.textContent = '';
}

function syncUrlFromFilters() {
  const params = new URLSearchParams();
  if (state.filters.preset !== 'all') params.set('preset', state.filters.preset);
  if (state.filters.q) params.set('q', state.filters.q);
  if (state.filters.sector !== 'all') params.set('sector', state.filters.sector);
  if (state.filters.regime !== 'all') params.set('regime', state.filters.regime);
  if (state.filters.minScore > 0) params.set('minScore', String(state.filters.minScore));
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.replaceState(null, '', nextUrl);
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.filters.preset = params.get('preset') || 'all';
  state.filters.q = params.get('q') || '';
  state.filters.sector = params.get('sector') || 'all';
  state.filters.regime = params.get('regime') || 'all';
  state.filters.minScore = Number(params.get('minScore') || '0') || 0;

  els.filterSearch.value = state.filters.q;
  els.filterRegime.value = state.filters.regime;
  els.filterMinScore.value = String(state.filters.minScore);
  els.minScoreOutput.textContent = String(state.filters.minScore);
  updatePresetButtons();
}

function updatePresetButtons() {
  for (const btn of els.presetButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.preset === state.filters.preset));
  }
}

function matchesFilters(stock) {
  const { preset, q, sector, regime, minScore } = state.filters;
  if (stock.composite_score < minScore) return false;
  if (sector !== 'all' && stock.sector !== sector) return false;
  if (regime !== 'all' && stock.ma_regime !== regime) return false;
  if (q) {
    const needle = q.trim().toLowerCase();
    const hay = `${stock.ticker} ${stock.name} ${stock.sector}`.toLowerCase();
    if (!hay.includes(needle)) return false;
  }

  if (preset === 'leaders') {
    return stock.composite_score >= 75 && stock.ma_regime === 'Stage 2 Uptrend';
  }
  if (preset === 'smooth') {
    return stock.fip_quality >= 60 && stock.up_down_vol_ratio >= 1.15 && stock.mom_12_1 > 0;
  }
  if (preset === 'garp') {
    return (
      stock.mom_12_1 > 0 &&
      stock.peg_ratio !== null &&
      stock.peg_ratio > 0 &&
      stock.peg_ratio < 2.0
    );
  }
  if (preset === 'pullback') {
    return (
      (stock.ma_regime === 'Stage 2 Uptrend' || stock.ma_regime === 'Bullish Pullback') &&
      stock.rsi_14 >= 40 &&
      stock.rsi_14 <= 58
    );
  }
  return true;
}

function createNumericCell(displayText, rawValue, extraClass = '') {
  const td = document.createElement('td');
  td.textContent = displayText;
  td.dataset.value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  if (extraClass) td.className = extraClass;
  return td;
}

function buildRowElement(stock) {
  const tr = document.createElement('tr');
  tr.dataset.ticker = stock.ticker;

  const th = document.createElement('th');
  th.scope = 'row';
  th.dataset.value = stock.ticker;

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'stock-btn';
  btn.dataset.ticker = stock.ticker;
  btn.innerHTML = `
    <span class="stock-ticker" translate="no">${stock.ticker}</span>
    <span class="stock-meta">
      <span class="stock-name">${stock.name}</span>
    </span>
  `;
  btn.addEventListener('click', () => openStockDialog(stock.ticker));
  th.appendChild(btn);
  tr.appendChild(th);

  const scoreTd = document.createElement('td');
  scoreTd.dataset.value = String(stock.composite_score);
  scoreTd.innerHTML = `<span class="score-pill ${scoreClass(stock.composite_score)}">${stock.composite_score.toFixed(1)}</span>`;
  tr.appendChild(scoreTd);

  const sigTd = document.createElement('td');
  sigTd.dataset.value = stock.signal;
  sigTd.innerHTML = `<span class="signal-badge ${signalClass(stock.signal)}" translate="no">${stock.signal}</span>`;
  tr.appendChild(sigTd);

  const priceTd = document.createElement('td');
  priceTd.dataset.value = String(stock.price);
  priceTd.innerHTML = `<span class="price-cell"><span>${currencyFmt.format(stock.price)}</span>${buildSparklineSvg(stock.sparkline)}</span>`;
  tr.appendChild(priceTd);

  tr.appendChild(
    createNumericCell(
      fmtSignedPct(stock.mom_12_1),
      stock.mom_12_1,
      stock.mom_12_1 >= 0 ? 'val-pos' : 'val-neg',
    ),
  );
  tr.appendChild(
    createNumericCell(
      fmtSignedPct(stock.mom_6_1),
      stock.mom_6_1,
      stock.mom_6_1 >= 0 ? 'val-pos' : 'val-neg',
    ),
  );
  tr.appendChild(
    createNumericCell(
      fmtSignedPct(stock.ret_3m),
      stock.ret_3m,
      stock.ret_3m >= 0 ? 'val-pos' : 'val-neg',
    ),
  );
  tr.appendChild(
    createNumericCell(
      `${fmtSignedPct(stock.rs_spy_6m)} (${stock.rs_rating})`,
      stock.rs_spy_6m,
      stock.rs_spy_6m >= 0 ? 'val-pos' : 'val-neg',
    ),
  );
  tr.appendChild(
    createNumericCell(`${stock.fip_quality.toFixed(0)} (${stock.pos_days_pct.toFixed(0)}%)`, stock.fip_quality),
  );
  tr.appendChild(createNumericCell(`${stock.high_52w_prox.toFixed(1)}%`, stock.high_52w_prox));

  const regTd = document.createElement('td');
  regTd.textContent = stock.ma_regime;
  regTd.dataset.value = stock.ma_regime;
  regTd.className = stock.ma_regime === 'Stage 2 Uptrend' ? 'val-pos' : stock.ma_regime === 'Stage 4 Downtrend' ? 'val-neg' : '';
  tr.appendChild(regTd);

  tr.appendChild(createNumericCell(fmtNum(stock.rsi_14, 1), stock.rsi_14));
  tr.appendChild(
    createNumericCell(
      fmtNum(stock.sortino_1y, 2),
      stock.sortino_1y,
      stock.sortino_1y >= 1.2 ? 'val-pos' : stock.sortino_1y < 0 ? 'val-neg' : '',
    ),
  );
  tr.appendChild(
    createNumericCell(
      `${fmtNum(stock.up_down_vol_ratio, 2)}x`,
      stock.up_down_vol_ratio,
      stock.up_down_vol_ratio >= 1.15 ? 'val-pos' : stock.up_down_vol_ratio < 0.9 ? 'val-neg' : '',
    ),
  );
  tr.appendChild(createNumericCell(fmtNum(stock.forward_pe, 1), stock.forward_pe, stock.forward_pe === null ? 'val-muted' : ''));
  tr.appendChild(createNumericCell(fmtNum(stock.peg_ratio, 2), stock.peg_ratio, stock.peg_ratio === null ? 'val-muted' : ''));
  tr.appendChild(
    createNumericCell(
      fmtSignedPct(stock.rev_growth, 1),
      stock.rev_growth,
      stock.rev_growth === null ? 'val-muted' : stock.rev_growth >= 0 ? 'val-pos' : 'val-neg',
    ),
  );
  tr.appendChild(createNumericCell(stock.roe !== null ? `${stock.roe.toFixed(1)}%` : '—', stock.roe, stock.roe === null ? 'val-muted' : ''));

  return tr;
}

function reorderRows(container, orderedRows) {
  const move = Object.hasOwn(Element.prototype, 'moveBefore')
    ? (node) => container.moveBefore(node, null)
    : (node) => container.append(node);
  for (const row of orderedRows) move(row);
}

function reorderWithTransition(orderedRows) {
  const update = () => reorderRows(els.tbody, orderedRows);
  const visibleCount = orderedRows.filter((row) => !row.hidden).length;
  if (visibleCount > 100) {
    update();
    return;
  }
  if (els.table.startViewTransition) {
    els.table.startViewTransition(update);
  } else if (document.startViewTransition) {
    document.startViewTransition(update);
  } else {
    update();
  }
}

function sortRowsList(rows, colIndex, type, direction) {
  const factor = direction === 'ascending' ? 1 : -1;
  const keyed = rows.map((row) => {
    const cell = row.cells[colIndex];
    const raw = cell.dataset.value ?? cell.textContent.trim();
    if (type === 'number') {
      const parsed = raw === '' ? Number.NaN : Number(raw);
      return { row, val: parsed };
    }
    return { row, val: raw };
  });

  keyed.sort((a, b) => {
    if (type === 'number') {
      const aMissing = Number.isNaN(a.val);
      const bMissing = Number.isNaN(b.val);
      if (aMissing && bMissing) return 0;
      if (aMissing) return 1;
      if (bMissing) return -1;
      return factor * (a.val - b.val);
    }
    return factor * collator.compare(a.val, b.val);
  });

  return keyed.map((entry) => entry.row);
}

function sortByButton(button) {
  const th = button.closest('th');
  if (!th) return;
  const currentSort = th.getAttribute('aria-sort');
  const direction = currentSort === 'ascending' ? 'descending' : 'ascending';

  for (const header of els.table.tHead.rows[0].cells) {
    header.removeAttribute('aria-sort');
  }
  th.setAttribute('aria-sort', direction);
  state.sortCol = th.dataset.col || '';
  state.sortDir = direction;

  const sortedRows = sortRowsList([...els.tbody.rows], th.cellIndex, th.dataset.type || 'text', direction);
  reorderWithTransition(sortedRows);
  const visibleCount = sortedRows.filter((r) => !r.hidden).length;
  els.reorderStatus.textContent = `Sorted by ${button.textContent.trim()}, ${direction}, ${visibleCount} rows`;
}

function applyFilters() {
  if (!state.payload) return;
  let visible = 0;
  for (const stock of state.payload.stocks) {
    const row = state.rowMap.get(stock.ticker);
    if (!row) continue;
    const show = matchesFilters(stock);
    row.hidden = !show;
    if (show) visible += 1;
  }
  els.emptyState.hidden = visible > 0;
  els.kpiVisibleCount.textContent = `Showing ${numberFmt.format(visible)} of ${state.payload.universe_size} stocks`;
  syncUrlFromFilters();
}

function renderSummary(payload) {
  const { benchmark, summary, generated_at: generatedAt, data_source: source, stocks } = payload;
  const sourceLabels = {
    yahoo_finance_live: 'Yahoo Finance Live',
    offline_snapshot: 'Offline Snapshot',
    offline_fallback: 'Offline Fallback',
  };
  els.dataSourceBadge.textContent = sourceLabels[source] || source;
  els.lastUpdated.textContent = `Updated ${dateFmt.format(new Date(generatedAt))}`;

  els.kpiSpyPrice.textContent = currencyFmt.format(benchmark.price);
  els.kpiSpyRegime.textContent = `${benchmark.ma_regime} · 6M ${fmtSignedPct(benchmark.ret_6m)} · RSI ${benchmark.rsi_14}`;

  els.kpiStage2Pct.textContent = `${summary.stage2_pct.toFixed(1)}%`;
  els.kpiStage2Count.textContent = `${summary.stage2_count} of ${payload.universe_size} in Stage 2`;

  els.kpiSignalsCount.textContent = `${summary.strong_buy_count} / ${summary.accumulate_count}`;
  els.kpiAvgMom.textContent = `Avg 12-1M Mom: ${fmtSignedPct(summary.avg_mom_12_1)}`;

  els.kpiTopSector.textContent = summary.top_sector;

  const sectors = [...new Set(stocks.map((s) => s.sector))].sort((a, b) => collator.compare(a, b));
  const currentSector = state.filters.sector;
  els.filterSector.innerHTML = '<option value="all">All Sectors</option>';
  for (const sector of sectors) {
    const opt = document.createElement('option');
    opt.value = sector;
    opt.textContent = sector;
    els.filterSector.appendChild(opt);
  }
  els.filterSector.value = sectors.includes(currentSector) ? currentSector : 'all';
}

function renderTable(payload) {
  els.tbody.innerHTML = '';
  state.rowMap.clear();
  state.stocksByTicker.clear();

  const fragment = document.createDocumentFragment();
  for (const stock of payload.stocks) {
    state.stocksByTicker.set(stock.ticker, stock);
    const row = buildRowElement(stock);
    state.rowMap.set(stock.ticker, row);
    fragment.appendChild(row);
  }
  els.tbody.appendChild(fragment);
  applyFilters();
}

function openStockDialog(ticker) {
  const stock = state.stocksByTicker.get(ticker);
  if (!stock) return;

  els.dialogSector.textContent = stock.sector;
  els.dialogTitle.textContent = `${stock.ticker} — ${stock.name}`;
  els.dialogSubtitle.textContent = `${currencyFmt.format(stock.price)} · ${stock.ma_regime} · RS Rating ${stock.rs_rating}/99`;
  els.dialogComposite.textContent = `${stock.composite_score.toFixed(1)} / 100`;
  els.dialogSignal.textContent = stock.signal;
  els.dialogSignal.className = `signal-badge ${signalClass(stock.signal)}`;
  els.dialogChart.innerHTML = buildSparklineSvg(stock.sparkline, 240, 64);

  const pillars = stock.pillars || {};
  els.dialogPillars.innerHTML = `
    <div class="pillar-card"><span class="kpi-label">Momentum (35%)</span><strong>${fmtNum(pillars.momentum, 1)}</strong></div>
    <div class="pillar-card"><span class="kpi-label">Trend &amp; RS (25%)</span><strong>${fmtNum(pillars.trend_rs, 1)}</strong></div>
    <div class="pillar-card"><span class="kpi-label">Inst. Flow (20%)</span><strong>${fmtNum(pillars.flow, 1)}</strong></div>
    <div class="pillar-card"><span class="kpi-label">Fundamental (20%)</span><strong>${fmtNum(pillars.fundamental, 1)}</strong></div>
  `;

  const tiles = [
    ['12-1M Momentum', fmtSignedPct(stock.mom_12_1)],
    ['6-1M Momentum', fmtSignedPct(stock.mom_6_1)],
    ['Sharpe / Sortino', `${fmtNum(stock.sharpe_1y)} / ${fmtNum(stock.sortino_1y)}`],
    ['FIP Smoothness', `${stock.fip_quality.toFixed(1)} (${stock.pos_days_pct.toFixed(0)}% +days)`],
    ['52W High Prox', `${stock.high_52w_prox.toFixed(1)}%`],
    ['6M Alpha vs SPY', fmtSignedPct(stock.rs_spy_6m)],
    ['Up/Dn Vol (60D)', `${fmtNum(stock.up_down_vol_ratio)}x`],
    ['RVOL (20/90D)', `${fmtNum(stock.rvol_20d)}x`],
    ['RSI (14) / ATR%', `${fmtNum(stock.rsi_14, 1)} / ${fmtNum(stock.atr_pct)}%`],
    ['Forward P/E', fmtNum(stock.forward_pe, 1)],
    ['PEG / EV-EBITDA', `${fmtNum(stock.peg_ratio, 2)} / ${fmtNum(stock.ev_ebitda, 1)}`],
    ['Rev / EPS YoY', `${fmtSignedPct(stock.rev_growth, 1)} / ${fmtSignedPct(stock.eps_growth, 1)}`],
  ];
  els.dialogMetrics.innerHTML = tiles
    .map(([label, value]) => `<div class="metric-tile"><span>${label}</span><strong>${value}</strong></div>`)
    .join('');

  const thesisNotes = [];
  if (stock.ma_regime === 'Stage 2 Uptrend') {
    thesisNotes.push('Primary Stage 2 uptrend aligned above rising SMA50 and SMA200.');
  } else if (stock.ma_regime === 'Stage 4 Downtrend') {
    thesisNotes.push('Stage 4 downtrend below SMA50 and SMA200 — weak medium-term structure.');
  }
  if (stock.mom_12_1 > 20 && stock.fip_quality >= 60) {
    thesisNotes.push('High Frog-in-the-Pan persistence: strong 12-1M trend achieved through steady daily gains.');
  }
  if (stock.up_down_vol_ratio >= 1.2) {
    thesisNotes.push('Volume footprint confirms institutional accumulation on up days.');
  }
  if (stock.rsi_14 >= 75) {
    thesisNotes.push('Short-term RSI is stretched (> 75); watch for consolidation toward SMA20/50 before adding.');
  }
  if (stock.peg_ratio !== null && stock.peg_ratio > 0 && stock.peg_ratio < 1.5) {
    thesisNotes.push('Reasonable growth-adjusted valuation (PEG < 1.5) supporting medium-term continuation.');
  }
  if (thesisNotes.length === 0) {
    thesisNotes.push('Mixed quantitative profile; monitor RS vs SPY and 52-week high proximity for confirmation.');
  }

  els.dialogThesis.innerHTML = `<strong>Quantitative Thesis Checklist</strong><ul>${thesisNotes
    .map((n) => `<li>${n}</li>`)
    .join('')}</ul>`;
  els.dialogYahooLink.href = `https://finance.yahoo.com/quote/${encodeURIComponent(stock.ticker)}/`;

  els.dialog.showModal();
}

function exportVisibleCsv() {
  if (!state.payload) return;
  const visibleStocks = state.payload.stocks.filter(matchesFilters);
  const headers = [
    'Ticker', 'Name', 'Sector', 'Price', 'SOTA Score', 'Signal', 'Mom 12-1M %', 'Mom 6-1M %',
    '3M Return %', 'RS vs SPY 6M %', 'RS Rating', 'FIP Quality', '52W High Prox %',
    'MA Regime', 'RSI 14', 'Sortino 1Y', 'Up/Down Vol', 'Fwd PE', 'PEG', 'Rev YoY %', 'ROE %',
  ];
  const lines = [headers.join(',')];
  for (const s of visibleStocks) {
    const row = [
      s.ticker, `"${String(s.name).replace(/"/g, '""')}"`, `"${s.sector}"`, s.price,
      s.composite_score, s.signal, s.mom_12_1, s.mom_6_1, s.ret_3m, s.rs_spy_6m,
      s.rs_rating, s.fip_quality, s.high_52w_prox, `"${s.ma_regime}"`, s.rsi_14,
      s.sortino_1y, s.up_down_vol_ratio, s.forward_pe ?? '', s.peg_ratio ?? '',
      s.rev_growth ?? '', s.roe ?? '',
    ];
    lines.push(row.join(','));
  }
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `market-radar-sp500-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

async function detectLocalServer() {
  try {
    const res = await fetch('./api/health', { cache: 'no-store' });
    if (res.ok) {
      state.isLocalServer = true;
      els.refreshBtn.hidden = false;
    }
  } catch {
    state.isLocalServer = false;
  }
}

async function loadDataset() {
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    state.payload = payload;
    renderSummary(payload);
    renderTable(payload);
  } catch (err) {
    showFeedback(`Could not load dataset (${err.message}). Run: uv run scripts/build_radar.py`);
  }
}

function initThemeToggle() {
  const saved = localStorage.getItem('market-radar-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)');
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    const isDark = theme === 'dark';
    els.themeToggleBtn.setAttribute('aria-pressed', String(isDark));
    els.themeToggleBtn.textContent = isDark ? 'Light Mode' : 'Dark Mode';
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = isDark ? '#0b0f17' : '#f4f6fa';
  };

  applyTheme(saved || (prefersDark.matches ? 'dark' : 'dark'));

  prefersDark.addEventListener('change', (e) => {
    if (!localStorage.getItem('market-radar-theme')) {
      applyTheme(e.matches ? 'dark' : 'light');
    }
  });

  els.themeToggleBtn.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem('market-radar-theme', next);
    applyTheme(next);
  });
}

function wireTableSorting() {
  els.table.addEventListener('command', (event) => {
    if (event.command === '--sort') sortByButton(event.source);
  });

  // Fallback for browsers without HTML Invoker Commands
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    for (const button of els.table.tHead.querySelectorAll('button[command="--sort"]')) {
      button.addEventListener('click', () => sortByButton(button));
    }
  }
}

function wireDialogFallback() {
  if (!('closedBy' in HTMLDialogElement.prototype)) {
    els.dialog.addEventListener('click', (event) => {
      if (event.target !== els.dialog) return;
      const rect = els.dialog.getBoundingClientRect();
      const inside =
        rect.top <= event.clientY &&
        event.clientY <= rect.top + rect.height &&
        rect.left <= event.clientX &&
        event.clientX <= rect.left + rect.width;
      if (!inside) els.dialog.close();
    });
  }
}

function wireControls() {
  els.filterSearch.addEventListener('input', (e) => {
    state.filters.q = e.target.value;
    applyFilters();
  });
  els.filterSector.addEventListener('change', (e) => {
    state.filters.sector = e.target.value;
    applyFilters();
  });
  els.filterRegime.addEventListener('change', (e) => {
    state.filters.regime = e.target.value;
    applyFilters();
  });
  els.filterMinScore.addEventListener('input', (e) => {
    state.filters.minScore = Number(e.target.value) || 0;
    els.minScoreOutput.textContent = String(state.filters.minScore);
    applyFilters();
  });

  for (const btn of els.presetButtons) {
    btn.addEventListener('click', () => {
      state.filters.preset = btn.dataset.preset || 'all';
      updatePresetButtons();
      applyFilters();
    });
  }

  els.resetFiltersBtn.addEventListener('click', () => {
    state.filters = { preset: 'all', q: '', sector: 'all', regime: 'all', minScore: 0 };
    els.filterSearch.value = '';
    els.filterSector.value = 'all';
    els.filterRegime.value = 'all';
    els.filterMinScore.value = '0';
    els.minScoreOutput.textContent = '0';
    updatePresetButtons();
    applyFilters();
  });

  els.exportCsvBtn.addEventListener('click', exportVisibleCsv);

  els.refreshBtn.addEventListener('click', async () => {
    if (!state.isLocalServer) return;
    els.refreshBtn.disabled = true;
    els.refreshBtn.textContent = 'Refreshing…';
    hideFeedback();
    try {
      const res = await fetch('./api/refresh', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      await loadDataset();
      showFeedback(`Dataset refreshed (${data.universe_size} stocks, source: ${data.data_source}).`);
    } catch (err) {
      showFeedback(`Refresh failed: ${err.message}`);
    } finally {
      els.refreshBtn.disabled = false;
      els.refreshBtn.textContent = 'Refresh Yahoo Data';
    }
  });
}

async function init() {
  initThemeToggle();
  readFiltersFromUrl();
  wireTableSorting();
  wireDialogFallback();
  wireControls();
  await Promise.all([detectLocalServer(), loadDataset()]);
}

init();
