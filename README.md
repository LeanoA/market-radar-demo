# Market Radar — Top 50 S&P 500 SOTA Momentum & Medium-Term Screener

A quantitative equity screener powered by public Yahoo Finance data (`yfinance`), designed to run **locally with on-demand refresh** and deploy automatically as a static web app on **GitHub Pages**.

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

## Run Locally

Requirements: Python 3.11+ and [`uv`](https://docs.astral.sh/uv/).

```bash
# 1. Build fresh data from Yahoo Finance
uv run scripts/build_radar.py

# 2. Start the local server (includes live "Refresh Yahoo Data" button)
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

## Deploy to GitHub Pages

1. Push this repository to GitHub on the `main` branch.
2. Go to **Settings -> Pages -> Build and deployment** and select **Source: GitHub Actions**.
3. The workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) refreshes `site/data/market-radar.json` every weekday after US market close (21:30 UTC) and on manual dispatch, then deploys `./site` to GitHub Pages.
