#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "yfinance>=0.2.50",
#   "pandas>=2.2.0",
#   "numpy>=2.0.0",
# ]
# ///
"""Quantitative engine for Market Radar: Top 50 S&P 500 SOTA Momentum & Medium-Term Screener."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import sys
from typing import Any

import numpy as np
import pandas as pd

ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT = ROOT_DIR / "site" / "data" / "market-radar.json"
RISK_FREE_RATE = 0.045

# Top 50 liquid S&P 500 constituents across major GICS sectors
TOP_SP500_UNIVERSE: list[tuple[str, str, str]] = [
    ("NVDA", "NVIDIA Corp.", "Information Technology"),
    ("AAPL", "Apple Inc.", "Information Technology"),
    ("MSFT", "Microsoft Corp.", "Information Technology"),
    ("AMZN", "Amazon.com Inc.", "Consumer Discretionary"),
    ("GOOGL", "Alphabet Inc.", "Communication Services"),
    ("META", "Meta Platforms Inc.", "Communication Services"),
    ("AVGO", "Broadcom Inc.", "Information Technology"),
    ("TSLA", "Tesla Inc.", "Consumer Discretionary"),
    ("BRK-B", "Berkshire Hathaway Inc.", "Financials"),
    ("LLY", "Eli Lilly & Co.", "Health Care"),
    ("JPM", "JPMorgan Chase & Co.", "Financials"),
    ("WMT", "Walmart Inc.", "Consumer Staples"),
    ("V", "Visa Inc.", "Financials"),
    ("XOM", "Exxon Mobil Corp.", "Energy"),
    ("UNH", "UnitedHealth Group Inc.", "Health Care"),
    ("ORCL", "Oracle Corp.", "Information Technology"),
    ("MA", "Mastercard Inc.", "Financials"),
    ("COST", "Costco Wholesale Corp.", "Consumer Staples"),
    ("HD", "Home Depot Inc.", "Consumer Discretionary"),
    ("PG", "Procter & Gamble Co.", "Consumer Staples"),
    ("NFLX", "Netflix Inc.", "Communication Services"),
    ("JNJ", "Johnson & Johnson", "Health Care"),
    ("BAC", "Bank of America Corp.", "Financials"),
    ("ABBV", "AbbVie Inc.", "Health Care"),
    ("CRM", "Salesforce Inc.", "Information Technology"),
    ("CVX", "Chevron Corp.", "Energy"),
    ("KO", "Coca-Cola Co.", "Consumer Staples"),
    ("MRK", "Merck & Co. Inc.", "Health Care"),
    ("AMD", "Advanced Micro Devices", "Information Technology"),
    ("PEP", "PepsiCo Inc.", "Consumer Staples"),
    ("TMO", "Thermo Fisher Scientific", "Health Care"),
    ("ACN", "Accenture plc", "Information Technology"),
    ("LIN", "Linde plc", "Materials"),
    ("CSCO", "Cisco Systems Inc.", "Information Technology"),
    ("ADBE", "Adobe Inc.", "Information Technology"),
    ("WFC", "Wells Fargo & Co.", "Financials"),
    ("MCD", "McDonald's Corp.", "Consumer Discretionary"),
    ("ABT", "Abbott Laboratories", "Health Care"),
    ("GE", "GE Aerospace", "Industrials"),
    ("CAT", "Caterpillar Inc.", "Industrials"),
    ("DIS", "Walt Disney Co.", "Communication Services"),
    ("QCOM", "Qualcomm Inc.", "Information Technology"),
    ("IBM", "IBM Corp.", "Information Technology"),
    ("TXN", "Texas Instruments Inc.", "Information Technology"),
    ("INTU", "Intuit Inc.", "Information Technology"),
    ("NOW", "ServiceNow Inc.", "Information Technology"),
    ("ISRG", "Intuitive Surgical Inc.", "Health Care"),
    ("GS", "Goldman Sachs Group", "Financials"),
    ("MS", "Morgan Stanley", "Financials"),
    ("RTX", "RTX Corp.", "Industrials"),
]


def _safe_float(val: Any, default: float | None = None) -> float | None:
    if val is None:
        return default
    try:
        num = float(val)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(num):
        return default
    return num


def _round(val: float | None, digits: int = 2) -> float | None:
    if val is None or not math.isfinite(val):
        return None
    return round(float(val), digits)


def _window_return(close: pd.Series, lookback: int, end_offset: int = 0) -> float:
    """Compute percentage return over a trading-day window."""
    if len(close) < 2:
        return 0.0
    end_idx = -1 - end_offset
    if abs(end_idx) > len(close):
        end_idx = 0
    start_idx = max(-len(close), end_idx - lookback)
    start_price = float(close.iloc[start_idx])
    end_price = float(close.iloc[end_idx])
    if start_price <= 0:
        return 0.0
    return (end_price / start_price - 1.0) * 100.0


def compute_momentum_metrics(df: pd.DataFrame) -> dict[str, float]:
    """Calculate cross-sectional momentum (12-1M, 6-1M) and risk-adjusted ratios."""
    close = df["Close"].dropna()
    if len(close) < 30:
        raise ValueError("Insufficient price history to compute momentum metrics.")

    # Jegadeesh & Titman 12-1M skips the most recent 21 trading days
    idx_1m = -22 if len(close) > 22 else -1
    idx_12m = -252 if len(close) >= 252 else 0
    idx_6m = -126 if len(close) >= 126 else 0

    c_1m = float(close.iloc[idx_1m])
    c_12m = float(close.iloc[idx_12m])
    c_6m = float(close.iloc[idx_6m])
    c_now = float(close.iloc[-1])

    mom_12_1 = ((c_1m / c_12m) - 1.0) * 100.0 if c_12m > 0 else 0.0
    mom_6_1 = ((c_1m / c_6m) - 1.0) * 100.0 if c_6m > 0 else 0.0

    ret_1m = ((c_now / c_1m) - 1.0) * 100.0 if c_1m > 0 else 0.0
    ret_3m = _window_return(close, 62)
    ret_6m = _window_return(close, 125)
    ret_9m = _window_return(close, 188)
    ret_12m = ((c_now / c_12m) - 1.0) * 100.0 if c_12m > 0 else 0.0

    daily_ret = close.pct_change().dropna().tail(252)
    vol_dec = float(daily_ret.std(ddof=1)) * math.sqrt(252) if len(daily_ret) > 2 else 0.0
    volatility_1y = vol_dec * 100.0

    n_days = max(1, len(daily_ret))
    ann_ret_dec = ((c_now / c_12m) ** (252.0 / n_days) - 1.0) if c_12m > 0 else 0.0
    excess_ret = ann_ret_dec - RISK_FREE_RATE

    if vol_dec > 1e-8:
        sharpe_1y = excess_ret / vol_dec
    else:
        sharpe_1y = 4.0 if excess_ret > 0 else 0.0

    downside_sq = np.minimum(daily_ret.to_numpy(dtype=float), 0.0) ** 2
    downside_dev = float(np.sqrt(np.mean(downside_sq))) * math.sqrt(252) if len(downside_sq) else 0.0
    if downside_dev > 1e-8:
        sortino_1y = excess_ret / downside_dev
    else:
        sortino_1y = 5.0 if excess_ret > 0 else 0.0

    return {
        "mom_12_1": round(mom_12_1, 2),
        "mom_6_1": round(mom_6_1, 2),
        "ret_1m": round(ret_1m, 2),
        "ret_3m": round(ret_3m, 2),
        "ret_6m": round(ret_6m, 2),
        "ret_9m": round(ret_9m, 2),
        "ret_12m": round(ret_12m, 2),
        "volatility_1y": round(volatility_1y, 2),
        "sharpe_1y": round(float(np.clip(sharpe_1y, -5.0, 6.0)), 2),
        "sortino_1y": round(float(np.clip(sortino_1y, -5.0, 8.0)), 2),
    }


def compute_trend_quality(df: pd.DataFrame) -> dict[str, Any]:
    """Calculate Frog-in-the-Pan (FIP) smoothness, MA stage regime, 52W High proximity, RSI, and ATR%."""
    close = df["Close"].dropna()
    high = df["High"].dropna()
    low = df["Low"].dropna()
    price = float(close.iloc[-1])

    sma50_series = close.rolling(50, min_periods=20).mean()
    sma200_series = close.rolling(200, min_periods=60).mean()

    sma50 = float(sma50_series.iloc[-1])
    sma200 = float(sma200_series.iloc[-1])
    slope_idx = -21 if len(sma50_series.dropna()) > 21 else -5
    sma50_prev = float(sma50_series.dropna().iloc[slope_idx])
    sma50_rising = sma50 >= sma50_prev

    above_sma50 = price > sma50
    above_sma200 = price > sma200

    if price > sma50 and sma50 > sma200 and sma50_rising:
        ma_regime = "Stage 2 Uptrend"
    elif price < sma50 and price > sma200 and sma50 > sma200:
        ma_regime = "Bullish Pullback"
    elif price > sma50 and sma50 <= sma200:
        ma_regime = "Early Recovery"
    elif price < sma50 and price < sma200:
        ma_regime = "Stage 4 Downtrend"
    else:
        ma_regime = "Consolidation"

    # Frog-in-the-Pan (Da, Gurun & Warachka 2014): continuous small positive days beat spiky jumps
    daily_ret = close.pct_change().dropna().tail(252)
    if len(daily_ret) > 0:
        pos_days_pct = float((daily_ret > 0).mean() * 100.0)
        total_ret = abs(float(close.iloc[-1] / close.iloc[max(-len(close), -252)] - 1.0)) + 1e-6
        max_day_jump = float(daily_ret.abs().max())
        lumpiness = min(1.0, max_day_jump / max(total_ret, 0.05))
        base_fip = np.clip((pos_days_pct - 38.0) / 24.0 * 75.0, 0.0, 75.0)
        smooth_bonus = (1.0 - lumpiness) * 25.0
        fip_quality = float(np.clip(base_fip + smooth_bonus, 0.0, 100.0))
    else:
        pos_days_pct = 50.0
        fip_quality = 50.0

    high_52w = float(high.tail(252).max())
    high_52w_prox = min(100.0, (price / high_52w) * 100.0) if high_52w > 0 else 0.0

    # Wilder RSI(14)
    delta = close.diff()
    gain = delta.clip(lower=0.0)
    loss = (-delta).clip(lower=0.0)
    avg_gain = gain.ewm(alpha=1.0 / 14.0, min_periods=14, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / 14.0, min_periods=14, adjust=False).mean()
    last_loss = float(avg_loss.iloc[-1])
    last_gain = float(avg_gain.iloc[-1])
    if last_loss <= 1e-9:
        rsi_14 = 100.0 if last_gain > 0 else 50.0
    else:
        rs = last_gain / last_loss
        rsi_14 = 100.0 - (100.0 / (1.0 + rs))

    # 14-day ATR%
    prev_close = close.shift(1)
    tr = pd.concat(
        [
            high - low,
            (high - prev_close).abs(),
            (low - prev_close).abs(),
        ],
        axis=1,
    ).max(axis=1)
    atr_14 = float(tr.ewm(alpha=1.0 / 14.0, min_periods=14, adjust=False).mean().iloc[-1])
    atr_pct = (atr_14 / price) * 100.0 if price > 0 else 0.0

    dist_sma50_pct = ((price / sma50) - 1.0) * 100.0 if sma50 > 0 else 0.0
    dist_sma200_pct = ((price / sma200) - 1.0) * 100.0 if sma200 > 0 else 0.0

    return {
        "ma_regime": ma_regime,
        "above_sma50": bool(above_sma50),
        "above_sma200": bool(above_sma200),
        "dist_sma50_pct": round(dist_sma50_pct, 2),
        "dist_sma200_pct": round(dist_sma200_pct, 2),
        "pos_days_pct": round(pos_days_pct, 1),
        "fip_quality": round(fip_quality, 1),
        "high_52w_prox": round(high_52w_prox, 2),
        "rsi_14": round(rsi_14, 1),
        "atr_pct": round(atr_pct, 2),
    }


def compute_volume_and_rs(df: pd.DataFrame, spy_df: pd.DataFrame) -> dict[str, float]:
    """Calculate 6M Relative Strength alpha vs SPY, 20D/90D RVOL, and 60D Up/Down Volume Ratio."""
    close = df["Close"].dropna()
    volume = df["Volume"].dropna()
    spy_close = spy_df["Close"].dropna()

    stock_6m = _window_return(close, 125)
    spy_6m = _window_return(spy_close, 125)
    rs_spy_6m = stock_6m - spy_6m

    vol_20 = float(volume.tail(20).mean()) if len(volume) >= 20 else float(volume.mean())
    vol_90 = float(volume.tail(90).mean()) if len(volume) >= 20 else float(volume.mean())
    rvol_20d = vol_20 / vol_90 if vol_90 > 0 else 1.0

    recent_df = df[["Close", "Volume"]].dropna().tail(61)
    ret_60 = recent_df["Close"].diff()
    up_vol = float(recent_df.loc[ret_60 > 0, "Volume"].sum())
    down_vol = float(recent_df.loc[ret_60 < 0, "Volume"].sum())
    if down_vol > 0:
        up_down_vol_ratio = up_vol / down_vol
    else:
        up_down_vol_ratio = 2.0 if up_vol > 0 else 1.0

    return {
        "rs_spy_6m": round(rs_spy_6m, 2),
        "rvol_20d": round(float(np.clip(rvol_20d, 0.2, 4.0)), 2),
        "up_down_vol_ratio": round(float(np.clip(up_down_vol_ratio, 0.2, 4.0)), 2),
    }


def _percentile_ranks(values: list[float | None], higher_is_better: bool = True, neutral: float = 50.0) -> list[float]:
    """Compute cross-sectional percentile scores in [0, 100], preserving neutral score for missing values."""
    valid_indices = [i for i, v in enumerate(values) if v is not None and math.isfinite(v)]
    out = [neutral] * len(values)
    if not valid_indices:
        return out
    if len(valid_indices) == 1:
        out[valid_indices[0]] = 80.0 if higher_is_better else 50.0
        return out

    s = pd.Series([values[i] for i in valid_indices], index=valid_indices, dtype=float)
    pct = s.rank(pct=True, ascending=higher_is_better) * 100.0
    for idx, score in pct.items():
        out[int(idx)] = float(score)
    return out


def score_universe(stocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Compute cross-sectional RS Rating, 4-pillar SOTA Composite Score (0-100), and Action Signal."""
    if not stocks:
        return []

    regime_scores = {
        "Stage 2 Uptrend": 100.0,
        "Bullish Pullback": 72.0,
        "Early Recovery": 58.0,
        "Consolidation": 42.0,
        "Stage 4 Downtrend": 8.0,
    }

    # IBD-style weighted RS composite for cross-sectional RS Rating (1-99)
    rs_raw = [
        0.4 * (s.get("ret_3m") or 0.0)
        + 0.2 * (s.get("ret_6m") or 0.0)
        + 0.2 * (s.get("ret_9m") or 0.0)
        + 0.2 * (s.get("ret_12m") or 0.0)
        for s in stocks
    ]
    rs_pct = _percentile_ranks(rs_raw, higher_is_better=True)

    # Pillar 1: Risk-Adjusted Momentum (35%)
    p_mom12 = _percentile_ranks([s.get("mom_12_1") for s in stocks], True)
    p_mom6 = _percentile_ranks([s.get("mom_6_1") for s in stocks], True)
    p_sortino = _percentile_ranks([s.get("sortino_1y") for s in stocks], True)

    # Pillar 2: Trend Quality & RS (25%)
    p_52w = _percentile_ranks([s.get("high_52w_prox") for s in stocks], True)
    p_fip = _percentile_ranks([s.get("fip_quality") for s in stocks], True)
    p_rs = rs_pct
    p_regime = [regime_scores.get(str(s.get("ma_regime")), 40.0) for s in stocks]

    # Pillar 3: Institutional Accumulation & Alpha (20%)
    p_ud_vol = _percentile_ranks([s.get("up_down_vol_ratio") for s in stocks], True)
    p_rvol = _percentile_ranks([s.get("rvol_20d") for s in stocks], True)
    p_alpha = _percentile_ranks([s.get("rs_spy_6m") for s in stocks], True)

    # Pillar 4: Fundamental Quality & GARP Valuation (20%)
    p_rev = _percentile_ranks([s.get("rev_growth") for s in stocks], True)
    p_eps = _percentile_ranks([s.get("eps_growth") for s in stocks], True)
    p_roe = _percentile_ranks([s.get("roe") for s in stocks], True)
    peg_clean = [
        s.get("peg_ratio") if (s.get("peg_ratio") is not None and s["peg_ratio"] > 0) else None
        for s in stocks
    ]
    p_peg = _percentile_ranks(peg_clean, higher_is_better=False)

    enriched: list[dict[str, Any]] = []
    for i, stock in enumerate(stocks):
        item = dict(stock)
        rs_rating = int(np.clip(round(rs_pct[i] * 0.98 + 1), 1, 99))

        pillar_mom = 0.45 * p_mom12[i] + 0.30 * p_mom6[i] + 0.25 * p_sortino[i]
        pillar_trend = 0.30 * p_52w[i] + 0.25 * p_fip[i] + 0.30 * p_rs[i] + 0.15 * p_regime[i]
        pillar_flow = 0.45 * p_ud_vol[i] + 0.20 * p_rvol[i] + 0.35 * p_alpha[i]
        pillar_fund = 0.30 * p_rev[i] + 0.30 * p_eps[i] + 0.25 * p_roe[i] + 0.15 * p_peg[i]

        composite = 0.35 * pillar_mom + 0.25 * pillar_trend + 0.20 * pillar_flow + 0.20 * pillar_fund
        composite = round(float(np.clip(composite, 0.0, 100.0)), 1)

        ma_regime = item.get("ma_regime", "Consolidation")
        rsi_14 = float(item.get("rsi_14", 50.0))
        above_sma200 = bool(item.get("above_sma200", False))

        if ma_regime == "Stage 4 Downtrend" or composite < 45.0:
            signal = "AVOID"
        elif composite >= 78.0 and ma_regime == "Stage 2 Uptrend" and rsi_14 < 78.0:
            signal = "STRONG BUY"
        elif composite >= 62.0 and above_sma200:
            signal = "ACCUMULATE"
        else:
            signal = "HOLD / WATCH"

        item["rs_rating"] = rs_rating
        item["composite_score"] = composite
        item["signal"] = signal
        item["pillars"] = {
            "momentum": round(pillar_mom, 1),
            "trend_rs": round(pillar_trend, 1),
            "flow": round(pillar_flow, 1),
            "fundamental": round(pillar_fund, 1),
        }
        enriched.append(item)

    enriched.sort(key=lambda row: row["composite_score"], reverse=True)
    return enriched


def _fetch_ticker_fundamentals(ticker: str) -> dict[str, Any]:
    """Fetch valuation & fundamental quality metrics from Yahoo Finance info."""
    import yfinance as yf

    try:
        info = yf.Ticker(ticker).info or {}
    except Exception:
        return {}

    rev_g = _safe_float(info.get("revenueGrowth"))
    eps_g = _safe_float(info.get("earningsGrowth"))
    roe = _safe_float(info.get("returnOnEquity"))
    fcf = _safe_float(info.get("freeCashflow"))
    rev = _safe_float(info.get("totalRevenue"))
    fcf_margin = (fcf / rev * 100.0) if (fcf is not None and rev and rev > 0) else None

    peg = _safe_float(info.get("trailingPegRatio")) or _safe_float(info.get("pegRatio"))

    return {
        "forward_pe": _round(_safe_float(info.get("forwardPE")), 1),
        "peg_ratio": _round(peg, 2),
        "ev_ebitda": _round(_safe_float(info.get("enterpriseToEbitda")), 1),
        "rev_growth": _round(rev_g * 100.0 if rev_g is not None else None, 1),
        "eps_growth": _round(eps_g * 100.0 if eps_g is not None else None, 1),
        "roe": _round(roe * 100.0 if roe is not None else None, 1),
        "fcf_margin": _round(fcf_margin, 1),
        "market_cap": _safe_float(info.get("marketCap")),
        "short_name": info.get("shortName"),
    }


def _extract_ticker_df(bulk_df: pd.DataFrame, ticker: str) -> pd.DataFrame | None:
    if bulk_df is None or bulk_df.empty:
        return None
    if isinstance(bulk_df.columns, pd.MultiIndex):
        if ticker not in bulk_df.columns.get_level_values(0):
            return None
        df = bulk_df[ticker].copy()
    else:
        df = bulk_df.copy()
    df = df.dropna(subset=["Close", "High", "Low", "Volume"])
    if len(df) < 65:
        return None
    return df


def _build_offline_snapshot() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Generate a deterministic realistic Top 50 S&P 500 + SPY dataset when running offline."""
    rng = np.random.default_rng(20261123)
    dates = pd.bdate_range(end="2026-11-20", periods=260)

    def sim_df(start_price: float, drift: float, vol: float, base_vol: float) -> pd.DataFrame:
        rets = rng.normal(drift, vol, size=len(dates))
        close = start_price * np.cumprod(1.0 + rets)
        high = close * (1.0 + np.abs(rng.normal(0.005, 0.003, size=len(dates))))
        low = close * (1.0 - np.abs(rng.normal(0.005, 0.003, size=len(dates))))
        open_ = close * (1.0 + rng.normal(0.0, 0.003, size=len(dates)))
        volume = base_vol * (1.0 + rng.uniform(-0.25, 0.35, size=len(dates)))
        # Add realistic institutional up-volume tilt on trending tickers
        if drift > 0.001:
            up_days = np.diff(close, prepend=close[0]) > 0
            volume[-60:][up_days[-60:]] *= 1.35
        return pd.DataFrame(
            {"Open": open_, "High": high, "Low": low, "Close": close, "Volume": volume},
            index=dates,
        )

    spy_df = sim_df(505.0, 0.00065, 0.0075, 62_000_000.0)
    spy_mom = compute_momentum_metrics(spy_df)
    spy_trend = compute_trend_quality(spy_df)
    benchmark = {
        "ticker": "SPY",
        "name": "SPDR S&P 500 ETF Trust",
        "price": round(float(spy_df["Close"].iloc[-1]), 2),
        "ret_1m": spy_mom["ret_1m"],
        "ret_3m": spy_mom["ret_3m"],
        "ret_6m": spy_mom["ret_6m"],
        "mom_12_1": spy_mom["mom_12_1"],
        "ma_regime": spy_trend["ma_regime"],
        "rsi_14": spy_trend["rsi_14"],
    }

    # Realistic archetype profiles across the 50 constituents
    archetypes = [
        (0.0021, 0.015, 29.5, 1.15, 25.0, 42.0, 48.0, 46.0, 31.0),  # High-growth momentum leader
        (0.0014, 0.011, 24.0, 1.45, 18.0, 18.0, 22.0, 34.0, 24.0),  # Quality compounder
        (0.0008, 0.010, 19.5, 1.75, 14.5, 10.5, 13.0, 24.0, 18.0),  # Steady value/momentum
        (0.0002, 0.012, 16.0, 2.20, 12.0, 4.0, 5.5, 16.0, 12.0),    # Consolidating mega-cap
        (-0.0008, 0.013, 13.5, 2.85, 10.5, -2.5, -6.0, 9.0, 8.0),   # Laggard / Stage 4
    ]

    rows: list[dict[str, Any]] = []
    for idx, (ticker, name, sector) in enumerate(TOP_SP500_UNIVERSE):
        drift, vol, fpe, peg, ev_eb, rev_g, eps_g, roe, fcf_m = archetypes[idx % len(archetypes)]
        jitter = float(rng.normal(0.0, 0.00035))
        df = sim_df(
            start_price=float(rng.uniform(45.0, 520.0)),
            drift=drift + jitter,
            vol=vol,
            base_vol=float(rng.uniform(6_000_000, 45_000_000)),
        )
        mom = compute_momentum_metrics(df)
        trend = compute_trend_quality(df)
        vol_rs = compute_volume_and_rs(df, spy_df)
        sparkline = [round(float(x), 2) for x in df["Close"].tail(30).tolist()]

        rows.append(
            {
                "ticker": ticker,
                "name": name,
                "sector": sector,
                "price": round(float(df["Close"].iloc[-1]), 2),
                **mom,
                **trend,
                **vol_rs,
                "forward_pe": round(max(6.0, fpe + float(rng.normal(0, 2.5))), 1),
                "peg_ratio": round(max(0.5, peg + float(rng.normal(0, 0.25))), 2),
                "ev_ebitda": round(max(5.0, ev_eb + float(rng.normal(0, 2.0))), 1),
                "rev_growth": round(rev_g + float(rng.normal(0, 3.0)), 1),
                "eps_growth": round(eps_g + float(rng.normal(0, 4.0)), 1),
                "roe": round(max(2.0, roe + float(rng.normal(0, 3.0))), 1),
                "fcf_margin": round(fcf_m + float(rng.normal(0, 2.5)), 1),
                "market_cap": round(float(rng.uniform(85e9, 3.2e12)), 0),
                "sparkline": sparkline,
            }
        )

    return benchmark, rows


def _fetch_live_universe() -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Download live Top 50 S&P 500 + SPY data from Yahoo Finance."""
    import yfinance as yf

    tickers = ["SPY"] + [t for t, _, _ in TOP_SP500_UNIVERSE]
    bulk_df = yf.download(
        tickers=tickers,
        period="15mo",
        interval="1d",
        auto_adjust=True,
        progress=False,
        group_by="ticker",
        threads=True,
    )

    spy_df = _extract_ticker_df(bulk_df, "SPY")
    if spy_df is None:
        raise RuntimeError("Failed to download SPY benchmark history from Yahoo Finance.")

    spy_mom = compute_momentum_metrics(spy_df)
    spy_trend = compute_trend_quality(spy_df)
    benchmark = {
        "ticker": "SPY",
        "name": "SPDR S&P 500 ETF Trust",
        "price": round(float(spy_df["Close"].iloc[-1]), 2),
        "ret_1m": spy_mom["ret_1m"],
        "ret_3m": spy_mom["ret_3m"],
        "ret_6m": spy_mom["ret_6m"],
        "mom_12_1": spy_mom["mom_12_1"],
        "ma_regime": spy_trend["ma_regime"],
        "rsi_14": spy_trend["rsi_14"],
    }

    fundamentals: dict[str, dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {pool.submit(_fetch_ticker_fundamentals, t): t for t, _, _ in TOP_SP500_UNIVERSE}
        for fut in as_completed(futures):
            ticker = futures[fut]
            try:
                fundamentals[ticker] = fut.result()
            except Exception:
                fundamentals[ticker] = {}

    rows: list[dict[str, Any]] = []
    for ticker, name, sector in TOP_SP500_UNIVERSE:
        df = _extract_ticker_df(bulk_df, ticker)
        if df is None:
            continue
        try:
            mom = compute_momentum_metrics(df)
            trend = compute_trend_quality(df)
            vol_rs = compute_volume_and_rs(df, spy_df)
        except Exception:
            continue

        fund = fundamentals.get(ticker, {})
        sparkline = [round(float(x), 2) for x in df["Close"].tail(30).tolist()]
        rows.append(
            {
                "ticker": ticker,
                "name": fund.get("short_name") or name,
                "sector": sector,
                "price": round(float(df["Close"].iloc[-1]), 2),
                **mom,
                **trend,
                **vol_rs,
                "forward_pe": fund.get("forward_pe"),
                "peg_ratio": fund.get("peg_ratio"),
                "ev_ebitda": fund.get("ev_ebitda"),
                "rev_growth": fund.get("rev_growth"),
                "eps_growth": fund.get("eps_growth"),
                "roe": fund.get("roe"),
                "fcf_margin": fund.get("fcf_margin"),
                "market_cap": fund.get("market_cap"),
                "sparkline": sparkline,
            }
        )

    if not rows:
        raise RuntimeError("No constituent price series returned from Yahoo Finance.")

    return benchmark, rows


def generate_dataset(
    output_path: Path = DEFAULT_OUTPUT,
    offline: bool = False,
    strict_live: bool = False,
) -> dict[str, Any]:
    """Build the SOTA Market Radar JSON dataset and write it to disk."""
    data_source = "yahoo_finance_live"
    if offline:
        benchmark, raw_rows = _build_offline_snapshot()
        data_source = "offline_snapshot"
    else:
        try:
            benchmark, raw_rows = _fetch_live_universe()
        except Exception as exc:
            if strict_live:
                raise
            print(f"[warn] Live Yahoo Finance fetch unavailable ({exc}); using offline snapshot fallback.", file=sys.stderr)
            benchmark, raw_rows = _build_offline_snapshot()
            data_source = "offline_fallback"

    scored = score_universe(raw_rows)

    stage2_count = sum(1 for r in scored if r["ma_regime"] == "Stage 2 Uptrend")
    avg_mom_12_1 = round(sum(r["mom_12_1"] for r in scored) / len(scored), 2) if scored else 0.0

    sector_scores: dict[str, list[float]] = {}
    for row in scored:
        sector_scores.setdefault(row["sector"], []).append(row["composite_score"])
    top_sector = (
        max(sector_scores.items(), key=lambda kv: sum(kv[1]) / len(kv[1]))[0]
        if sector_scores
        else "N/A"
    )

    payload: dict[str, Any] = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_source": data_source,
        "universe_name": "Top 50 S&P 500",
        "universe_size": len(scored),
        "benchmark": benchmark,
        "summary": {
            "stage2_pct": round((stage2_count / len(scored)) * 100.0, 1) if scored else 0.0,
            "stage2_count": stage2_count,
            "strong_buy_count": sum(1 for r in scored if r["signal"] == "STRONG BUY"),
            "accumulate_count": sum(1 for r in scored if r["signal"] == "ACCUMULATE"),
            "avg_mom_12_1": avg_mom_12_1,
            "top_sector": top_sector,
        },
        "stocks": scored,
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    return payload


def main() -> int:
    parser = argparse.ArgumentParser(description="Build SOTA Momentum & Medium-Term Market Radar JSON dataset.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help="Output JSON path.")
    parser.add_argument("--offline", action="store_true", help="Generate deterministic offline snapshot without network.")
    parser.add_argument("--strict-live", action="store_true", help="Fail if live Yahoo Finance download fails.")
    args = parser.parse_args()

    payload = generate_dataset(output_path=args.output, offline=args.offline, strict_live=args.strict_live)
    print(
        f"Generated {args.output} ({payload['universe_size']} stocks, source={payload['data_source']}, "
        f"top={payload['stocks'][0]['ticker'] if payload['stocks'] else 'N/A'})"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
