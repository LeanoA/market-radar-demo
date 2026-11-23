# AGENTS.md

Project instructions and guardrails for AI coding assistants working on **Market Radar Demo**.

## Project Overview

- **Purpose:** Technical demonstration of a quantitative S&P 500 Top 50 momentum & medium-term screener built with Python (`yfinance`, `pandas`, `numpy`) and vanilla HTML/CSS/JS.
- **Deployment:** Static site in `site/` deployed via GitHub Pages (`.github/workflows/deploy-pages.yml`), refreshed Monday–Friday at 21:30 UTC.

## Essential Commands

```bash
# Build dataset from Yahoo Finance (or deterministic offline snapshot)
uv run scripts/build_radar.py
uv run scripts/build_radar.py --offline

# Serve locally (includes /api/health and /api/refresh for local dev only)
python3 scripts/serve_local.py

# Run full test & integrity suite (must pass before every commit)
uv run --with pytest --with pandas --with numpy pytest -v
```

## Architecture & Design Rules

- **Static Site Contract (`site/`):** Never add live refresh buttons or `/api/refresh` calls to `site/index.html` or `site/app.js`—the published GitHub Pages site is strictly static.
- **Visual System (`site/styles.css`):** Keep the **botanical sage & warm paper** light theme (`data-theme="light"` default) and **deep moss** dark theme. Use `light-dark()` and `color-mix(in oklab, ...)` rather than `in oklch`, and preserve `[hidden] { display: none !important; }`.
- **Accessibility:** Preserve semantic landmarks, `<caption id="radar-table-caption">`, `commandfor="radar-table" command="--sort"`, `closedby="any"` on `<dialog>`, and `prefers-reduced-motion: reduce`.
- **Disclaimers:** Keep all four disclaimer items intact in `site/index.html` and `README.md` (Technical Demo, Not Investment Advice, Assumption of Risk, and Trademarks & Non-Affiliation for Yahoo Finance / S&P 500®).

## Guardrails & Hygiene

- **Never commit secrets or private keys.** Do not bypass `.pre-commit-config.yaml` (`gitleaks` + `detect-private-key`).
- **Commits:** Use Conventional Commits (`feat:`, `fix:`, `docs:`, `style:`, `test:`) with no AI attribution trailers.
- **Docs:** Keep `README.md` and `docs/ai-engineering-workflow.md` concise and updated if tooling or workflow changes.
