"""Refresh data/monthly_returns_bp.txt from Yahoo Finance.

Usage:
    pip install yfinance pandas
    python scripts/fetch_data.py
    python scripts/build.py

Output format (one line per series, returns in basis points):
    <first month>|<number of months>
    <ID>|<index of first return>|r1,r2,...
"""
from pathlib import Path
import numpy as np
import pandas as pd
import yfinance as yf

START = "2011-09-01"
ASSETS = {  # id -> (Yahoo ticker, currency)
    "NVDA": ("NVDA", "USD"), "AMZN": ("AMZN", "USD"), "GOOGL": ("GOOGL", "USD"), "MSFT": ("MSFT", "USD"),
    "META": ("META", "USD"), "AAPL": ("AAPL", "USD"), "VRT": ("VRT", "USD"), "VST": ("VST", "USD"),
    "ETN": ("ETN", "USD"), "ANET": ("ANET", "USD"), "MU": ("MU", "USD"), "TSM": ("TSM", "USD"),
    "XIAOMI": ("1810.HK", "HKD"), "AMAT": ("AMAT", "USD"), "SAMSUNG": ("005930.KS", "KRW"),
    "CAT": ("CAT", "USD"), "AVGO": ("AVGO", "USD"), "CRWD": ("CRWD", "USD"), "JPM": ("JPM", "USD"),
    "GS": ("GS", "USD"), "LMT": ("LMT", "USD"), "NUE": ("NUE", "USD"), "TM": ("TM", "USD"),
    "PFE": ("PFE", "USD"), "ITX": ("ITX.MC", "EUR"), "ASML": ("ASML", "USD"),
    "SKHYNIX": ("000660.KS", "KRW"), "GOLD": ("GC=F", "USD"), "COPX": ("COPX", "USD"),
    "OIL": ("BZ=F", "USD"), "BTC": ("BTC-USD", "USD"), "UST": ("IEF", "USD"), "SPY": ("SPY", "USD"),
}
FX = {"HKD": "HKD=X", "KRW": "KRW=X", "EUR": "EURUSD=X"}  # HKD/KRW quoted per USD, EUR as USD per EUR


def monthly(ticker: str) -> pd.Series:
    """Month-end adjusted close, labelled by the month it closes (exchange-local)."""
    df = yf.download(ticker, start=START, interval="1d", auto_adjust=True, progress=False)
    s = df["Close"].squeeze().dropna()
    s = s[s > 0]
    return s.resample("ME").last().to_period("M")


def clean_fx(s: pd.Series) -> pd.Series:
    # Yahoo occasionally stores a KRW quote off by ~10,000x; drop jumps vs both neighbours, then interpolate
    ratio_prev, ratio_next = s / s.shift(1), s / s.shift(-1)
    bad = ((ratio_prev > 1.5) | (ratio_prev < 0.66)) & ((ratio_next > 1.5) | (ratio_next < 0.66))
    return s.mask(bad).interpolate(limit_direction="both")


def main() -> None:
    fx = {k: clean_fx(monthly(t)) for k, t in FX.items()}
    prices = {}
    for aid, (tic, cur) in ASSETS.items():
        p = monthly(tic)
        if cur == "HKD" or cur == "KRW":
            p = p / fx[cur].reindex(p.index).interpolate()
        elif cur == "EUR":
            p = p * fx["EUR"].reindex(p.index).interpolate()
        prices[aid] = p
    P = pd.DataFrame(prices).sort_index()
    P = P.loc[:pd.Timestamp.today().to_period("M")]
    P[["GOLD", "OIL"]] = P[["GOLD", "OIL"]].interpolate(limit=3)  # futures roll gaps
    P.loc[:"2019-12", "VRT"] = np.nan  # pre-merger SPAC shell (GS Acquisition Holdings) is not Vertiv
    R = P.pct_change().iloc[1:]
    months = [str(m) for m in R.index]
    lines = [f"{months[0]}|{len(months)}"]
    for aid in ASSETS:
        r = R[aid]
        first = int(np.argmax(r.notna().values))
        vals = ["" if pd.isna(x) else str(int(round(x * 1e4))) for x in r.values[first:]]
        lines.append(f"{aid}|{first}|{','.join(vals)}")
    # risk-free: 13-week T-bill yield at the end of the previous month, as a monthly rate
    irx = monthly("^IRX").reindex(P.index).ffill()
    rf = (irx.shift(1) / 12 / 100).loc[R.index]
    lines.append("RF|0|" + ",".join("" if pd.isna(x) else str(int(round(x * 1e4))) for x in rf.values))
    out = Path(__file__).resolve().parent.parent / "data/monthly_returns_bp.txt"
    out.write_text("\n".join(lines) + "\n")
    print(f"Wrote {out} ({months[0]} to {months[-1]}, {len(months)} months)")


if __name__ == "__main__":
    main()
