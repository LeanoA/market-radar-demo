"""Unit tests for the SOTA Momentum Market Radar quantitative engine."""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

import build_radar  # noqa: E402


def _make_ohlcv(
    days: int = 260,
    start_price: float = 100.0,
    daily_drift: float = 0.0012,
    daily_vol: float = 0.008,
    base_volume: float = 1_000_000.0,
    seed: int = 42,
) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    dates = pd.bdate_range(end="2026-11-20", periods=days)
    returns = rng.normal(loc=daily_drift, scale=daily_vol, size=days)
    close = start_price * np.cumprod(1.0 + returns)
    high = close * (1.0 + np.abs(rng.normal(0.004, 0.002, size=days)))
    low = close * (1.0 - np.abs(rng.normal(0.004, 0.002, size=days)))
    open_ = close * (1.0 + rng.normal(0.0, 0.002, size=days))
    volume = base_volume * (1.0 + rng.uniform(-0.2, 0.25, size=days))
    return pd.DataFrame(
        {
            "Open": open_,
            "High": high,
            "Low": low,
            "Close": close,
            "Volume": volume,
        },
        index=dates,
    )


def test_compute_momentum_metrics_matches_jegadeesh_titman_windows() -> None:
    dates = pd.bdate_range(end="2026-11-20", periods=255)
    # Deterministic monotonic series: +0.15% every trading day
    closes = pd.Series(100.0 * (1.0015 ** np.arange(len(dates))), index=dates)
    df = pd.DataFrame(
        {
            "Open": closes * 0.999,
            "High": closes * 1.005,
            "Low": closes * 0.995,
            "Close": closes,
            "Volume": np.full(len(dates), 1_000_000.0),
        },
        index=dates,
    )

    metrics = build_radar.compute_momentum_metrics(df)

    expected_12_1 = (closes.iloc[-22] / closes.iloc[-252] - 1.0) * 100.0
    expected_6_1 = (closes.iloc[-22] / closes.iloc[-126] - 1.0) * 100.0
    expected_3m = (closes.iloc[-1] / closes.iloc[-63] - 1.0) * 100.0
    expected_1m = (closes.iloc[-1] / closes.iloc[-22] - 1.0) * 100.0

    assert metrics["mom_12_1"] == pytest.approx(expected_12_1, rel=1e-3)
    assert metrics["mom_6_1"] == pytest.approx(expected_6_1, rel=1e-3)
    assert metrics["ret_3m"] == pytest.approx(expected_3m, rel=1e-3)
    assert metrics["ret_1m"] == pytest.approx(expected_1m, rel=1e-3)
    assert metrics["volatility_1y"] >= 0.0
    assert math.isfinite(metrics["sharpe_1y"])
    assert math.isfinite(metrics["sortino_1y"])


def test_compute_trend_quality_detects_stage2_uptrend_and_fip() -> None:
    df = _make_ohlcv(days=260, daily_drift=0.0022, daily_vol=0.006, seed=7)
    trend = build_radar.compute_trend_quality(df)

    assert trend["ma_regime"] == "Stage 2 Uptrend"
    assert 0.0 <= trend["pos_days_pct"] <= 100.0
    assert 0.0 <= trend["fip_quality"] <= 100.0
    assert trend["pos_days_pct"] > 50.0
    assert 0.0 < trend["high_52w_prox"] <= 100.0
    assert 0.0 <= trend["rsi_14"] <= 100.0
    assert trend["atr_pct"] > 0.0


def test_compute_trend_quality_detects_stage4_downtrend() -> None:
    df = _make_ohlcv(days=260, daily_drift=-0.0022, daily_vol=0.007, seed=11)
    trend = build_radar.compute_trend_quality(df)

    assert trend["ma_regime"] == "Stage 4 Downtrend"
    assert trend["high_52w_prox"] < 90.0


def test_compute_volume_and_rs_against_spy_benchmark() -> None:
    spy_df = _make_ohlcv(days=260, daily_drift=0.0005, daily_vol=0.007, seed=1)
    strong_df = _make_ohlcv(days=260, daily_drift=0.0020, daily_vol=0.008, seed=2)
    # Boost recent 20d volume on up days
    up_mask = strong_df["Close"].diff().fillna(0) > 0
    recent_mask = strong_df.index.isin(strong_df.index[-20:])
    strong_df.loc[recent_mask & up_mask, "Volume"] *= 2.2

    vol_rs = build_radar.compute_volume_and_rs(strong_df, spy_df)

    assert vol_rs["rs_spy_6m"] > 0.0
    assert vol_rs["rvol_20d"] > 1.0
    assert vol_rs["up_down_vol_ratio"] > 1.0


def test_score_universe_ranks_and_assigns_signals() -> None:
    leader = {
        "ticker": "NVDA",
        "name": "NVIDIA Corp.",
        "sector": "Information Technology",
        "price": 145.0,
        "mom_12_1": 85.0,
        "mom_6_1": 42.0,
        "ret_3m": 22.0,
        "ret_1m": 5.0,
        "ret_6m": 48.0,
        "ret_9m": 68.0,
        "ret_12m": 95.0,
        "volatility_1y": 32.0,
        "sharpe_1y": 2.1,
        "sortino_1y": 3.2,
        "pos_days_pct": 61.0,
        "fip_quality": 86.0,
        "ma_regime": "Stage 2 Uptrend",
        "above_sma50": True,
        "above_sma200": True,
        "high_52w_prox": 98.5,
        "rsi_14": 62.0,
        "atr_pct": 2.4,
        "rs_spy_6m": 32.0,
        "rvol_20d": 1.35,
        "up_down_vol_ratio": 1.55,
        "forward_pe": 29.0,
        "peg_ratio": 1.15,
        "ev_ebitda": 24.0,
        "rev_growth": 78.0,
        "eps_growth": 84.0,
        "roe": 92.0,
        "fcf_margin": 44.0,
        "market_cap": 3_400_000_000_000.0,
        "sparkline": [120.0 + i for i in range(30)],
    }
    laggard = {
        "ticker": "PFE",
        "name": "Pfizer Inc.",
        "sector": "Health Care",
        "price": 25.0,
        "mom_12_1": -18.0,
        "mom_6_1": -12.0,
        "ret_3m": -9.0,
        "ret_1m": -4.0,
        "ret_6m": -15.0,
        "ret_9m": -19.0,
        "ret_12m": -22.0,
        "volatility_1y": 28.0,
        "sharpe_1y": -0.8,
        "sortino_1y": -1.1,
        "pos_days_pct": 43.0,
        "fip_quality": 22.0,
        "ma_regime": "Stage 4 Downtrend",
        "above_sma50": False,
        "above_sma200": False,
        "high_52w_prox": 72.0,
        "rsi_14": 36.0,
        "atr_pct": 2.1,
        "rs_spy_6m": -28.0,
        "rvol_20d": 0.85,
        "up_down_vol_ratio": 0.72,
        "forward_pe": 11.0,
        "peg_ratio": 2.9,
        "ev_ebitda": 10.5,
        "rev_growth": -4.0,
        "eps_growth": -12.0,
        "roe": 6.0,
        "fcf_margin": 8.0,
        "market_cap": 140_000_000_000.0,
        "sparkline": [29.0 - i * 0.1 for i in range(30)],
    }

    scored = build_radar.score_universe([laggard, leader])
    assert scored[0]["ticker"] == "NVDA"
    assert scored[0]["composite_score"] > scored[1]["composite_score"]
    assert 0.0 <= scored[0]["composite_score"] <= 100.0
    assert 1 <= scored[0]["rs_rating"] <= 99
    assert scored[0]["signal"] == "STRONG BUY"
    assert scored[1]["signal"] == "AVOID"


def test_offline_dataset_generation_writes_valid_schema(tmp_path: Path) -> None:
    out_file = tmp_path / "market-radar.json"
    payload = build_radar.generate_dataset(output_path=out_file, offline=True)

    assert out_file.exists()
    loaded = json.loads(out_file.read_text(encoding="utf-8"))
    assert loaded["universe_size"] == len(build_radar.TOP_SP500_UNIVERSE)
    assert len(loaded["stocks"]) == len(build_radar.TOP_SP500_UNIVERSE)
    assert loaded["benchmark"]["ticker"] == "SPY"
    assert payload["data_source"] == "offline_snapshot"

    required_keys = {
        "ticker",
        "name",
        "sector",
        "price",
        "composite_score",
        "signal",
        "mom_12_1",
        "mom_6_1",
        "ret_3m",
        "ret_1m",
        "sharpe_1y",
        "sortino_1y",
        "fip_quality",
        "pos_days_pct",
        "ma_regime",
        "high_52w_prox",
        "rsi_14",
        "atr_pct",
        "rs_spy_6m",
        "rs_rating",
        "rvol_20d",
        "up_down_vol_ratio",
        "forward_pe",
        "peg_ratio",
        "ev_ebitda",
        "rev_growth",
        "eps_growth",
        "roe",
        "fcf_margin",
        "sparkline",
    }
    for row in loaded["stocks"]:
        assert required_keys.issubset(row.keys())
        assert len(row["sparkline"]) == 30
        assert 0.0 <= row["composite_score"] <= 100.0
