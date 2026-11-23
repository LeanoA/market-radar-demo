"""Integrity checks for the static web app, generated dataset, and GitHub Pages workflow."""

from __future__ import annotations

import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


def test_site_files_and_accessibility_contracts() -> None:
    html = (SITE / "index.html").read_text(encoding="utf-8")
    css = (SITE / "styles.css").read_text(encoding="utf-8")
    js = (SITE / "app.js").read_text(encoding="utf-8")

    # Modern web guidance contracts
    assert '<meta name="color-scheme" content="light dark">' in html
    assert 'role="region"' in html
    assert 'aria-labelledby="radar-table-caption"' in html
    assert '<caption id="radar-table-caption"' in html
    assert 'commandfor="radar-table" command="--sort"' in html
    assert 'closedby="any"' in html
    assert 'id="reorder-status" role="status"' in html

    assert "color-scheme: light dark;" in css
    assert "light-dark(" in css
    assert "@container (width < 640px)" in css
    assert "prefers-reduced-motion: reduce" in css
    assert "font-variant-numeric: tabular-nums;" in css

    assert "commandForElement" in js
    assert "closedBy" in js
    assert "moveBefore" in js
    assert "Intl.Collator" in js
    assert "showModal()" in js


def test_generated_market_radar_dataset_exists_and_valid() -> None:
    data_path = SITE / "data" / "market-radar.json"
    assert data_path.exists(), "Run scripts/build_radar.py before running integrity tests."
    payload = json.loads(data_path.read_text(encoding="utf-8"))

    assert payload["universe_size"] >= 45
    assert len(payload["stocks"]) == payload["universe_size"]
    assert payload["benchmark"]["ticker"] == "SPY"
    assert payload["summary"]["stage2_count"] <= payload["universe_size"]

    scores = [s["composite_score"] for s in payload["stocks"]]
    assert scores == sorted(scores, reverse=True), "Stocks must be pre-sorted descending by composite_score."


def test_github_pages_workflow_present() -> None:
    wf = (ROOT / ".github" / "workflows" / "deploy-pages.yml").read_text(encoding="utf-8")
    assert "uv run scripts/build_radar.py" in wf
    assert re.search(r"path:\s*\./site", wf)
