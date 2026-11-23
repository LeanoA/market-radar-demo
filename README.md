# Market Radar Demo — Top 50 S&P 500 SOTA Momentum & Medium-Term Screener

> **Technical Demo Notice:** This repository (`LeanoA/market-radar-demo`) is a technical demonstration of AI-assisted software engineering and automated quantitative data pipelines built on public Yahoo Finance data (`yfinance`).
>
> **Live Demo:** https://leanoa.github.io/market-radar-demo/

## SOTA Indicators Included

1. **Risk-Adjusted Momentum (35% weight)**:
   - **12-1M & 6-1M Momentum**: Jegadeesh & Titman momentum windows excluding the most recent 21 trading days to filter short-term mean reversion.
   - **1Y Sharpe & Sortino Ratio**: Annualized excess return over risk-free rate (4.5%) normalized by total and downside volatility.
2. **Trend Quality & Relative Strength (25% weight)**:
   - **Frog-in-the-Pan (FIP) Quality**: Da, Gurun & Warachka smoothness metric measuring positive-day consistency vs. spiky jumps.
   - **52-Week High Proximity**: George & Hwang ratio (`Price / 52W High`).
   - **RS Rating (1–99)** & **Stage 2 MA Regime**: Classification across `Price`, `SMA50`, and `SMA200`.
3. **Institutional Flow & Alpha (20% weight)**:
   - **6M Relative Strength Alpha vs SPY**.
   - **60D Up/Down Volume Ratio** and **20D/90D Relative Volume (RVOL)**.
4. **Medium-Term Fundamentals (20% weight)**:
   - **Forward P/E**, **PEG Ratio**, **EV/EBITDA**, **Revenue Growth YoY**, **Earnings Growth YoY**, **ROE**, and **FCF Margin**.

## Update Schedule

- **Automated GitHub Actions Schedule**: Runs Monday–Friday at **21:30 UTC** (`16:30 ET` / `18:30 ART`, after US market close) via [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), plus manual `workflow_dispatch`.
- The UI header displays both the **exact timestamp and relative elapsed time** (`Last updated`) and the recurring update schedule.

## Run Locally

Requirements: Python 3.11+ and [`uv`](https://docs.astral.sh/uv/).

```bash
# 1. Build fresh data from Yahoo Finance
uv run scripts/build_radar.py

# 2. Serve the static site locally
python3 scripts/serve_local.py
```

Then open [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

To run without network access using the deterministic snapshot:

```bash
uv run scripts/build_radar.py --offline
```

## Run Tests

```bash
uv run --with pytest --with pandas --with numpy pytest -v
```

## Technical Demo & Financial Risk Disclaimer

1. **AI-Assisted Software Engineering Demonstration**: This application was created as a technical showcase of AI-assisted software development, quantitative metric pipelines, and modern static web architecture.
2. **Informational & Educational Use Only — Not Financial Advice**: All indicators, scores, and algorithmic labels (`STRONG BUY`, `ACCUMULATE`, `HOLD / WATCH`, `AVOID`) are computed purely from historical public market data using well-known academic and institutional momentum formulas. Nothing in this repository or live demo constitutes financial, investment, legal, or tax advice, nor a recommendation or solicitation to buy, hold, or sell any security.
3. **Assumption of Risk**: Equity investing carries substantial risk of capital loss, and past performance or factor scores do not guarantee future results. Each person is solely responsible for their own independent research and assumes full risk for any investment decisions.
