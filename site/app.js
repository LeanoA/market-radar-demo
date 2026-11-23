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
const relTimeFmt = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const PRESET_META = {
  all: { label: 'Showing all Top 50 constituents' },
  leaders: { label: 'Preset: SOTA Score ≥ 75 & Stage 2 Uptrend' },
  smooth: { label: 'Preset: FIP Quality ≥ 60, Up/Dn Vol ≥ 1.15x & 12-1M Mom > 0' },
  garp: { label: 'Preset: 12-1M Mom > 0 & 0 < PEG < 2.0' },
  pullback: { label: 'Preset: Stage 2 / Bullish Pullback & RSI 40–58' },
};

const state = {
  payload: null,
  rowMap: new Map(),
  stocksByTicker: new Map(),
  activeTicker: null,
  density: 'all',
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
  emptyStateMsg: document.getElementById('empty-state-msg'),
  emptyResetBtn: document.getElementById('empty-reset-btn'),
  activePresetRule: document.getElementById('active-preset-rule'),
  exportCsvBtn: document.getElementById('export-csv-btn'),
  themeToggleBtn: document.getElementById('theme-toggle-btn'),
  dataSourceBadge: document.getElementById('data-source-badge'),
  lastUpdated: document.getElementById('last-updated'),
  updateSchedule: document.getElementById('update-schedule'),
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
  densityButtons: [...document.querySelectorAll('.density-btn')],
  dialog: document.getElementById('stock-detail-dialog'),
  dialogSector: document.getElementById('dialog-sector-badge'),
  dialogTitle: document.getElementById('dialog-stock-title'),
  dialogSubtitle: document.getElementById('dialog-stock-subtitle'),
  dialogPrevBtn: document.getElementById('dialog-prev-btn'),
  dialogNextBtn: document.getElementById('dialog-next-btn'),
  dialogPosIndicator: document.getElementById('dialog-pos-indicator'),
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

function buildSparklineSvg(values, width = 76, height = 24, { baseline = false } = {}) {
  if (!Array.isArray(values) || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, idx) => {
      const x = (idx / (values.length - 1)) * (width - 6) + 3;
      const y = height - 4 - ((v - min) / span) * (height - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  const isUp = values[values.length - 1] >= values[0];
  const stroke = isUp ? 'var(--pos)' : 'var(--neg)';
  const firstY = height - 4 - ((values[0] - min) / span) * (height - 8);
  const lastX = width - 3;
  const lastY = height - 4 - ((values[values.length - 1] - min) / span) * (height - 8);
  const baselineMarkup = baseline
    ? `<line x1="3" y1="${firstY.toFixed(1)}" x2="${lastX}" y2="${firstY.toFixed(1)}" stroke="var(--border)" stroke-width="1" stroke-dasharray="3 3"/>`
    : '';
  const endDotMarkup = baseline
    ? `<circle cx="${lastX}" cy="${lastY.toFixed(1)}" r="3" fill="${stroke}"/>`
    : '';
  return `<svg class="sparkline" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true">${baselineMarkup}<polyline fill="none" stroke="${stroke}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" points="${pts}"/>${endDotMarkup}</svg>`;
}

function showLoadError(message) {
  els.liveFeedback.innerHTML = '';
  const text = document.createElement('span');
  text.textContent = message;
  const retryBtn = document.createElement('button');
  retryBtn.type = 'button';
  retryBtn.id = 'retry-load-btn';
  retryBtn.className = 'btn btn-secondary btn-compact';
  retryBtn.textContent = 'Retry';
  retryBtn.addEventListener('click', () => {
    hideFeedback();
    loadDataset();
  });
  els.liveFeedback.append(text, retryBtn);
  els.liveFeedback.hidden = false;
}

function hideFeedback() {
  els.liveFeedback.hidden = true;
  els.liveFeedback.innerHTML = '';
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

function syncControlInputsFromState() {
  els.filterSearch.value = state.filters.q;
  els.filterRegime.value = state.filters.regime;
  els.filterMinScore.value = String(state.filters.minScore);
  els.minScoreOutput.textContent = String(state.filters.minScore);
  if (els.filterSector.options.length > 1) {
    els.filterSector.value = state.filters.sector;
  }
  updatePresetButtons();
  updateActiveRuleText();
}

function readFiltersFromUrl() {
  const params = new URLSearchParams(window.location.search);
  state.filters.preset = params.get('preset') || 'all';
  state.filters.q = params.get('q') || '';
  state.filters.sector = params.get('sector') || 'all';
  state.filters.regime = params.get('regime') || 'all';
  state.filters.minScore = Number(params.get('minScore') || '0') || 0;

  if (state.filters.preset === 'leaders') {
    state.filters.minScore = Math.max(state.filters.minScore, 75);
    if (state.filters.regime === 'all') state.filters.regime = 'Stage 2 Uptrend';
  }
  syncControlInputsFromState();
}

function updatePresetButtons() {
  for (const btn of els.presetButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.preset === state.filters.preset));
  }
}

function updateActiveRuleText() {
  if (!els.activePresetRule) return;
  const parts = [];
  if (state.filters.preset !== 'all') {
    parts.push(PRESET_META[state.filters.preset]?.label || state.filters.preset);
  }
  if (state.filters.sector !== 'all') parts.push(`Sector: ${state.filters.sector}`);
  if (state.filters.regime !== 'all' && state.filters.preset !== 'leaders') {
    parts.push(`Regime: ${state.filters.regime}`);
  }
  if (state.filters.minScore > 0 && state.filters.preset !== 'leaders') {
    parts.push(`Min Score ≥ ${state.filters.minScore}`);
  }
  if (state.filters.q.trim()) parts.push(`Query: "${state.filters.q.trim()}"`);

  els.activePresetRule.textContent = parts.length > 0 ? parts.join(' · ') : PRESET_META.all.label;
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

function createNumericCell(displayText, rawValue, { col = '', essential = false, pillarStart = false, extraClass = '' } = {}) {
  const td = document.createElement('td');
  td.textContent = displayText;
  td.dataset.value = rawValue === null || rawValue === undefined ? '' : String(rawValue);
  td.dataset.essential = String(essential);
  if (col) td.dataset.col = col;
  const classes = [];
  if (pillarStart) classes.push('pillar-start');
  if (extraClass) classes.push(extraClass);
  if (classes.length > 0) td.className = classes.join(' ');
  return td;
}

function buildRowElement(stock) {
  const tr = document.createElement('tr');
  tr.dataset.ticker = stock.ticker;

  const th = document.createElement('th');
  th.scope = 'row';
  th.dataset.value = stock.ticker;
  th.dataset.essential = 'true';

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
  th.appendChild(btn);
  tr.appendChild(th);

  const scoreTd = document.createElement('td');
  scoreTd.dataset.value = String(stock.composite_score);
  scoreTd.dataset.essential = 'true';
  scoreTd.innerHTML = `<span class="score-pill ${scoreClass(stock.composite_score)}">${stock.composite_score.toFixed(1)}</span>`;
  tr.appendChild(scoreTd);

  const sigTd = document.createElement('td');
  sigTd.dataset.value = stock.signal;
  sigTd.dataset.col = 'signal';
  sigTd.dataset.essential = 'true';
  sigTd.innerHTML = `<span class="signal-badge ${signalClass(stock.signal)}" translate="no">${stock.signal}</span>`;
  tr.appendChild(sigTd);

  const priceTd = document.createElement('td');
  priceTd.dataset.value = String(stock.price);
  priceTd.dataset.essential = 'true';
  priceTd.innerHTML = `<span class="price-cell"><span>${currencyFmt.format(stock.price)}</span>${buildSparklineSvg(stock.sparkline)}</span>`;
  tr.appendChild(priceTd);

  tr.appendChild(
    createNumericCell(fmtSignedPct(stock.mom_12_1), stock.mom_12_1, {
      essential: true,
      pillarStart: true,
      extraClass: stock.mom_12_1 >= 0 ? 'val-pos' : 'val-neg',
    }),
  );
  tr.appendChild(
    createNumericCell(fmtSignedPct(stock.mom_6_1), stock.mom_6_1, {
      essential: false,
      extraClass: stock.mom_6_1 >= 0 ? 'val-pos' : 'val-neg',
    }),
  );
  tr.appendChild(
    createNumericCell(fmtSignedPct(stock.ret_3m), stock.ret_3m, {
      essential: false,
      extraClass: stock.ret_3m >= 0 ? 'val-pos' : 'val-neg',
    }),
  );
  tr.appendChild(
    createNumericCell(`${fmtSignedPct(stock.rs_spy_6m)} (${stock.rs_rating})`, stock.rs_spy_6m, {
      essential: true,
      pillarStart: true,
      extraClass: stock.rs_spy_6m >= 0 ? 'val-pos' : 'val-neg',
    }),
  );
  tr.appendChild(
    createNumericCell(`${stock.fip_quality.toFixed(0)} (${stock.pos_days_pct.toFixed(0)}%)`, stock.fip_quality, {
      essential: true,
    }),
  );
  tr.appendChild(
    createNumericCell(`${stock.high_52w_prox.toFixed(1)}%`, stock.high_52w_prox, {
      essential: false,
    }),
  );

  const regTd = document.createElement('td');
  regTd.textContent = stock.ma_regime;
  regTd.dataset.value = stock.ma_regime;
  regTd.dataset.col = 'ma_regime';
  regTd.dataset.essential = 'true';
  regTd.className = stock.ma_regime === 'Stage 2 Uptrend' ? 'val-pos' : stock.ma_regime === 'Stage 4 Downtrend' ? 'val-neg' : '';
  tr.appendChild(regTd);

  tr.appendChild(createNumericCell(fmtNum(stock.rsi_14, 1), stock.rsi_14, { essential: false }));
  tr.appendChild(
    createNumericCell(fmtNum(stock.sortino_1y, 2), stock.sortino_1y, {
      essential: false,
      pillarStart: true,
      extraClass: stock.sortino_1y >= 1.2 ? 'val-pos' : stock.sortino_1y < 0 ? 'val-neg' : '',
    }),
  );
  tr.appendChild(
    createNumericCell(`${fmtNum(stock.up_down_vol_ratio, 2)}x`, stock.up_down_vol_ratio, {
      essential: true,
      extraClass: stock.up_down_vol_ratio >= 1.15 ? 'val-pos' : stock.up_down_vol_ratio < 0.9 ? 'val-neg' : '',
    }),
  );
  tr.appendChild(
    createNumericCell(fmtNum(stock.forward_pe, 1), stock.forward_pe, {
      essential: false,
      pillarStart: true,
      extraClass: stock.forward_pe === null ? 'val-muted' : '',
    }),
  );
  tr.appendChild(
    createNumericCell(fmtNum(stock.peg_ratio, 2), stock.peg_ratio, {
      essential: true,
      extraClass: stock.peg_ratio === null ? 'val-muted' : '',
    }),
  );
  tr.appendChild(
    createNumericCell(fmtSignedPct(stock.rev_growth, 1), stock.rev_growth, {
      essential: false,
      extraClass: stock.rev_growth === null ? 'val-muted' : stock.rev_growth >= 0 ? 'val-pos' : 'val-neg',
    }),
  );
  tr.appendChild(
    createNumericCell(stock.roe !== null ? `${stock.roe.toFixed(1)}%` : '—', stock.roe, {
      essential: false,
      extraClass: stock.roe === null ? 'val-muted' : '',
    }),
  );

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

function sortByColumn(th, direction, { announce = true } = {}) {
  if (!th) return;
  for (const header of els.table.tHead.rows[0].cells) {
    header.removeAttribute('aria-sort');
  }
  th.setAttribute('aria-sort', direction);
  state.sortCol = th.dataset.col || '';
  state.sortDir = direction;

  const sortedRows = sortRowsList([...els.tbody.rows], th.cellIndex, th.dataset.type || 'text', direction);
  reorderWithTransition(sortedRows);
  if (announce) {
    const visibleCount = sortedRows.filter((r) => !r.hidden).length;
    const label = th.dataset.label || th.textContent.trim();
    els.reorderStatus.textContent = `Sorted by ${label}, ${direction}, ${visibleCount} rows`;
  }
}

function sortByButton(button) {
  const th = button.closest('th');
  if (!th) return;
  const currentSort = th.getAttribute('aria-sort');
  const direction = currentSort === 'ascending' ? 'descending' : 'ascending';
  sortByColumn(th, direction);
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
  if (visible === 0) {
    els.emptyStateMsg.textContent = `No stocks match the active criteria (${els.activePresetRule.textContent}).`;
  }
  els.exportCsvBtn.disabled = visible === 0;
  els.kpiVisibleCount.textContent = `Showing ${numberFmt.format(visible)} of ${state.payload.universe_size} stocks`;
  updateActiveRuleText();
  syncUrlFromFilters();
}

function formatRelativeElapsed(isoTimestamp) {
  const diffSec = Math.round((new Date(isoTimestamp).getTime() - Date.now()) / 1000);
  const absSec = Math.abs(diffSec);
  if (absSec < 60) return relTimeFmt.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return relTimeFmt.format(diffMin, 'minute');
  const diffHr = Math.round(diffSec / 3600);
  if (Math.abs(diffHr) < 24) return relTimeFmt.format(diffHr, 'hour');
  const diffDay = Math.round(diffSec / 86400);
  return relTimeFmt.format(diffDay, 'day');
}

function updateTimestampDisplay() {
  if (!state.payload?.generated_at) return;
  const generatedDate = new Date(state.payload.generated_at);
  const exact = dateFmt.format(generatedDate);
  const elapsed = formatRelativeElapsed(state.payload.generated_at);
  els.lastUpdated.textContent = `Last updated: ${exact} (${elapsed})`;
}

function renderSummary(payload) {
  const { benchmark, summary, data_source: source, stocks } = payload;
  const sourceLabels = {
    yahoo_finance_live: 'Yahoo Finance Snapshot',
    offline_snapshot: 'Offline Snapshot',
    offline_fallback: 'Offline Fallback',
  };
  els.dataSourceBadge.textContent = sourceLabels[source] || source;
  updateTimestampDisplay();

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

function getVisibleOrderedTickers() {
  return [...els.tbody.rows].filter((row) => !row.hidden).map((row) => row.dataset.ticker);
}

function renderDialogChart(values) {
  if (!Array.isArray(values) || values.length < 2) {
    els.dialogChart.innerHTML = '<span class="val-muted">No 30D series available</span>';
    return;
  }
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const first = values[0];
  const last = values[values.length - 1];
  const pct30d = first > 0 ? ((last - first) / first) * 100 : 0;
  const pctClass = pct30d >= 0 ? 'val-pos' : 'val-neg';

  els.dialogChart.innerHTML = `
    <div class="dialog-chart-meta">
      <span>30D Price Trend</span>
      <strong class="${pctClass}">${fmtSignedPct(pct30d)}</strong>
    </div>
    ${buildSparklineSvg(values, 250, 68, { baseline: true })}
    <div class="dialog-chart-range">
      <span>Low ${currencyFmt.format(minVal)}</span>
      <span>High ${currencyFmt.format(maxVal)}</span>
    </div>
  `;
}

function renderPillarCard(label, score) {
  const safeScore = Number.isFinite(score) ? Math.max(0, Math.min(100, score)) : 0;
  const tierClass = scoreClass(safeScore);
  return `
    <div class="pillar-card">
      <div class="pillar-head">
        <span class="kpi-label">${label}</span>
        <strong>${fmtNum(score, 1)}</strong>
      </div>
      <div class="pillar-bar-track" aria-hidden="true">
        <div class="pillar-bar-fill ${tierClass}" style="width: ${safeScore.toFixed(1)}%"></div>
      </div>
    </div>
  `;
}

function openStockDialog(ticker) {
  const stock = state.stocksByTicker.get(ticker);
  if (!stock) return;

  state.activeTicker = ticker;
  const visibleTickers = getVisibleOrderedTickers();
  const idx = visibleTickers.indexOf(ticker);
  const total = visibleTickers.length;
  els.dialogPosIndicator.textContent = idx >= 0 ? `${idx + 1} / ${total}` : '— / —';
  els.dialogPrevBtn.disabled = idx <= 0;
  els.dialogNextBtn.disabled = idx < 0 || idx >= total - 1;

  els.dialogSector.textContent = stock.sector;
  els.dialogTitle.textContent = `${stock.ticker} — ${stock.name}`;
  els.dialogSubtitle.textContent = `${currencyFmt.format(stock.price)} · ${stock.ma_regime} · RS Rating ${stock.rs_rating}/99`;
  els.dialogComposite.textContent = `${stock.composite_score.toFixed(1)} / 100`;
  els.dialogSignal.textContent = stock.signal;
  els.dialogSignal.className = `signal-badge ${signalClass(stock.signal)}`;
  renderDialogChart(stock.sparkline);

  const pillars = stock.pillars || {};
  els.dialogPillars.innerHTML = [
    renderPillarCard('Momentum (35%)', pillars.momentum),
    renderPillarCard('Trend &amp; RS (25%)', pillars.trend_rs),
    renderPillarCard('Inst. Flow (20%)', pillars.flow),
    renderPillarCard('Fundamental (20%)', pillars.fundamental),
  ].join('');

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

  if (!els.dialog.open) {
    els.dialog.showModal();
  }
}

function stepDialogStock(delta) {
  if (!state.activeTicker) return;
  const visible = getVisibleOrderedTickers();
  const idx = visible.indexOf(state.activeTicker);
  const target = visible[idx + delta];
  if (target) openStockDialog(target);
}

function exportVisibleCsv() {
  if (!state.payload) return;
  const visibleStocks = state.payload.stocks.filter(matchesFilters);
  if (visibleStocks.length === 0) return;
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

async function loadDataset() {
  els.exportCsvBtn.disabled = true;
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    state.payload = payload;
    hideFeedback();
    renderSummary(payload);
    renderTable(payload);
  } catch (err) {
    els.dataSourceBadge.textContent = 'Unavailable';
    els.kpiSpyRegime.textContent = 'Snapshot offline';
    showLoadError(`Unable to load market dataset (${err.message}). Please try again.`);
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
    if (metaTheme) metaTheme.content = isDark ? '#0f1713' : '#f3f5ef';
  };

  applyTheme(saved || 'light');

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

function wireDialogBehavior() {
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

  els.dialogPrevBtn.addEventListener('click', () => stepDialogStock(-1));
  els.dialogNextBtn.addEventListener('click', () => stepDialogStock(1));

  els.dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      stepDialogStock(-1);
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      stepDialogStock(1);
    }
  });
}

function resetAllFilters() {
  state.filters = { preset: 'all', q: '', sector: 'all', regime: 'all', minScore: 0 };
  syncControlInputsFromState();
  const defaultScoreTh = els.table.tHead.querySelector('th[data-col="composite_score"]');
  if (defaultScoreTh) {
    sortByColumn(defaultScoreTh, 'descending', { announce: false });
  }
  applyFilters();
}

function setDensity(density, { explicitMobile = false } = {}) {
  state.density = density;
  els.table.dataset.density = density;
  if (explicitMobile) {
    if (density === 'all') {
      els.table.dataset.mobileAll = 'true';
    } else {
      delete els.table.dataset.mobileAll;
    }
  }
  for (const btn of els.densityButtons) {
    btn.setAttribute('aria-pressed', String(btn.dataset.density === density));
  }
}

function wireControls() {
  els.tbody.addEventListener('click', (event) => {
    const row = event.target.closest('tr[data-ticker]');
    if (!row) return;
    openStockDialog(row.dataset.ticker);
  });

  els.filterSearch.addEventListener('input', (e) => {
    state.filters.q = e.target.value;
    applyFilters();
  });

  els.filterSector.addEventListener('change', (e) => {
    state.filters.sector = e.target.value;
    applyFilters();
  });

  els.filterRegime.addEventListener('change', (e) => {
    const val = e.target.value;
    state.filters.regime = val;
    if (state.filters.preset === 'leaders' && val !== 'Stage 2 Uptrend') {
      state.filters.preset = 'all';
      updatePresetButtons();
    } else if (
      state.filters.preset === 'pullback' &&
      val !== 'all' &&
      val !== 'Stage 2 Uptrend' &&
      val !== 'Bullish Pullback'
    ) {
      state.filters.preset = 'all';
      updatePresetButtons();
    }
    applyFilters();
  });

  els.filterMinScore.addEventListener('input', (e) => {
    const val = Number(e.target.value) || 0;
    state.filters.minScore = val;
    els.minScoreOutput.textContent = String(val);
    if (state.filters.preset === 'leaders' && val < 75) {
      state.filters.preset = 'all';
      updatePresetButtons();
    }
    applyFilters();
  });

  for (const btn of els.presetButtons) {
    btn.addEventListener('click', () => {
      const nextPreset = btn.dataset.preset || 'all';
      const prevPreset = state.filters.preset;
      state.filters.preset = nextPreset;

      if (nextPreset === 'leaders') {
        state.filters.minScore = 75;
        state.filters.regime = 'Stage 2 Uptrend';
      } else if (nextPreset === 'all') {
        state.filters.minScore = 0;
        state.filters.regime = 'all';
      } else {
        if (prevPreset === 'leaders') {
          state.filters.minScore = 0;
          state.filters.regime = 'all';
        }
        if (
          nextPreset === 'pullback' &&
          state.filters.regime !== 'all' &&
          state.filters.regime !== 'Stage 2 Uptrend' &&
          state.filters.regime !== 'Bullish Pullback'
        ) {
          state.filters.regime = 'all';
        }
      }

      syncControlInputsFromState();
      applyFilters();
    });
  }

  for (const btn of els.densityButtons) {
    btn.addEventListener('click', () => {
      setDensity(btn.dataset.density || 'all', { explicitMobile: true });
    });
  }

  els.resetFiltersBtn.addEventListener('click', resetAllFilters);
  els.emptyResetBtn.addEventListener('click', resetAllFilters);
  els.exportCsvBtn.addEventListener('click', exportVisibleCsv);

  document.addEventListener('keydown', (event) => {
    if (event.key !== '/' || els.dialog.open) return;
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    event.preventDefault();
    els.filterSearch.focus();
  });
}

async function init() {
  initThemeToggle();
  readFiltersFromUrl();
  wireTableSorting();
  wireDialogBehavior();
  wireControls();
  await loadDataset();
  window.setInterval(updateTimestampDisplay, 60_000);
}

init();
