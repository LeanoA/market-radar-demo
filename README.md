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

## AI-Assisted Engineering Stack (Executive Summary)

This repository was engineered from the terminal using a structured, specification-first AI workflow rather than ad-hoc prompting. A dual-model **Orchestrator** separates architectural planning from implementation, backed by persistent cross-session memory, specialized domain skills, and automated secret-scanning guardrails.

| Layer | Component | Role in This Project |
|---|---|---|
| **Runtime Platform** | **Google Antigravity CLI (`agy`)** | Terminal agent runtime providing sandboxed shell execution, file tooling, MCP integration, and native subagent orchestration. |
| **Harness & Methodology** | **Gentle AI — ODD (Organic Driven Development)** | Enforces `Authorize → Explore → Classify → Track → Implement → Verify`, bounded context budgets, and Risk-line verification gates. |
| **Plan / Execute Pairing** | **Orchestrator** (`Gemini 4 Pro (Medium)` + `Gemini 4 Flash (High)`) | **Planner** inspects the codebase read-only and defines the contract; **Executor** applies edits, runs `pytest` / visual checks, and hands back on blockers. |
| **Subagent Delegation** | **Dynamic Bounded Workers** | Keeps the main thread thin by delegating broad codebase mapping, parallel independent units, or high-risk verification only when triggers fire. |
| **Persistent Memory** | **Engram (MCP)** | Preserves architectural decisions, bugfix root causes, and session summaries across sessions and context compactions. |
| **Domain & UI Skills** | `yahoo-finance`, `modern-web-guidance`, `impeccable`, `web-design-guidelines`, `cognitive-doc-design` | Supplies `yfinance` pipeline patterns, Baseline web APIs (`light-dark()`, `in oklab`, `<dialog closedby>`), botanical sage UI polish, and accessible docs. |
| **Security Guardrails** | `install-guardrails` (`pre-commit` + `gitleaks`) | Blocks hardcoded secrets and private keys on every commit before code reaches GitHub. |

**Core Concepts for Learners:**
- **What is Orchestration Mode?** Instead of one monolithic chat trying to hold every file, decision, and edit at once, the agent acts as a *thin coordinator*: **Vertical Orchestration** splits read-only planning (`Gemini 4 Pro (Medium)`) from fast execution (`Gemini 4 Flash (High)`), while **Horizontal Orchestration** spawns isolated, bounded subagents only when concrete triggers fire (broad exploration, parallel work units, or high-risk verification).
- **What are Skills?** On-demand, modular playbooks (`SKILL.md` + helper scripts) loaded *only* when a task matches their domain (e.g., `modern-web-guidance` for CSS `light-dark()` / `in oklab` or `impeccable` for visual contrast). They teach the model *how to build well* without bloating the base prompt.
- **What are Guardrails?** Deterministic, non-negotiable enforcement boundaries (terminal sandboxing, read-only Plan Mode locks, `pytest` integrity gates, and `pre-commit` + `gitleaks` secret/private-key scanners) that guarantee *what must never break or leak*, regardless of what the LLM generates.

For a step-by-step explanation designed for developers learning AI-assisted engineering, see [`docs/ai-engineering-workflow.md`](docs/ai-engineering-workflow.md).

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
4. **Trademarks & Non-Affiliation**: Yahoo!, Yahoo Finance, and related marks are registered trademarks of Yahoo Inc. S&P 500® is a registered trademark of S&P Dow Jones Indices LLC. This independent open-source project uses the third-party `yfinance` library and is not affiliated with, endorsed by, sponsored by, or officially connected with Yahoo Inc., S&P Global, or any of their affiliates.
