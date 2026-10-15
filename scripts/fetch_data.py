"""Refresh data/monthly_returns_bp.txt from Yahoo Finance and FRED.

Usage:
    pip install yfinance pandas
    python scripts/fetch_data.py
    python scripts/build.py

Output format (one line per series, returns in basis points):
    <first month>|<number of months>
    <ID>|<index of first return>|r1,r2,...

Sources and splices (all returns are monthly, in USD, dividends reinvested):
- US listings: Yahoo adjusted closes.
- Non-US listings (Madrid, Seoul, Hong Kong): total return rebuilt from Yahoo
  closes plus cash dividends, because Yahoo's adjusted close for some of them
  contains bad dividend factors before 2011. Converted at FRED month-end FX
  (DEXUSEU, DEXKOUS, DEXHKUS), which has no gaps or corrupted quotes.
- US Treasuries: IEF from August 2002, Vanguard Intermediate-Term Treasury
  fund (VFITX) before that.
- Oil: Brent front-month future (BZ=F) from August 2007, FRED Brent spot
  (DCOILBRENTEU) before that.
- Copper miners: Global X Copper Miners UCITS (4COP.DE, EUR) from November
  2021, US-listed COPX before that.
- Ferrovial: an unadjusted 5:1 split on 27 Oct 2004 is neutralised (that
  day's return set to zero).
- SK Hynix starts in February 2004, after its 2003 debt restructuring;
  earlier Yahoo prices contain bad dividend records.
- Vertiv starts in February 2020 (earlier prices are the pre-merger SPAC).
"""
from pathlib import Path
import numpy as np
import pandas as pd
import yfinance as yf

START, END = "1996-08-01", None  # END=None: up to today
US = {
    "NVDA": "NVDA", "AMZN": "AMZN", "GOOGL": "GOOGL", "MSFT": "MSFT", "META": "META", "AAPL": "AAPL",
    "VRT": "VRT", "VST": "VST", "ETN": "ETN", "ANET": "ANET", "MU": "MU", "TSM": "TSM", "AMAT": "AMAT",
    "CAT": "CAT", "AVGO": "AVGO", "CRWD": "CRWD", "JPM": "JPM", "GS": "GS", "LMT": "LMT", "NUE": "NUE",
    "TM": "TM", "PFE": "PFE", "ASML": "ASML", "GOLD": "GC=F", "BTC": "BTC-USD", "COST": "COST", "SPY": "SPY",
}
LOCAL = {  # id -> (Yahoo ticker, FRED FX series, True if FX is quoted as local units per USD)
    "XIAOMI": ("1810.HK", "DEXHKUS", True), "SAMSUNG": ("005930.KS", "DEXKOUS", True),
    "SKHYNIX": ("000660.KS", "DEXKOUS", True), "ITX": ("ITX.MC", "DEXUSEU", False),
    "FER": ("FER.MC", "DEXUSEU", False), "IBE": ("IBE.MC", "DEXUSEU", False),
}
ORDER = ["NVDA", "AMZN", "GOOGL", "MSFT", "META", "AAPL", "VRT", "VST", "ETN", "ANET", "MU", "TSM", "XIAOMI",
         "AMAT", "SAMSUNG", "CAT", "AVGO", "CRWD", "JPM", "GS", "LMT", "NUE", "TM", "PFE", "ITX", "ASML",
         "SKHYNIX", "GOLD", "COPX", "OIL", "BTC", "UST", "FER", "IBE", "COST", "SPY"]


def daily(ticker: str, adjusted: bool = True) -> pd.DataFrame:
    return yf.download(ticker, start=START, end=END, interval="1d", auto_adjust=adjusted,
                       actions=not adjusted, progress=False)


def month_end(s: pd.Series) -> pd.Series:
    s = s.dropna()
    return s[s > 0].resample("ME").last().to_period("M")


def fred(series: str) -> pd.Series:
    url = f"https://fred.stlouisfed.org/graph/fredgraph.csv?id={series}&cosd={START}"
    df = pd.read_csv(url, parse_dates=[0], index_col=0, na_values=".")
    return month_end(df.iloc[:, 0].astype(float))


def total_return_index(ticker: str) -> pd.Series:
    """Close (split-adjusted) plus cash dividends, compounded daily."""
    df = daily(ticker, adjusted=False)
    close = df["Close"].squeeze().dropna()
    div = df["Dividends"].squeeze().reindex(close.index).fillna(0.0)
    gross = (close + div) / close.shift(1)
    yld = div / close.shift(1)
    gross[yld > 0.2] = (close / close.shift(1))[yld > 0.2]  # ignore implausible dividend records
    if ticker == "FER.MC":
        gross[gross.index == "2004-10-27"] = 1.0  # unadjusted 5:1 split on Yahoo
    return gross.fillna(1.0).cumprod()


def main() -> None:
    prices = {k: month_end(daily(t)["Close"].squeeze()) for k, t in US.items()}
    for aid, (tic, fx_id, per_usd) in LOCAL.items():
        fx = fred(fx_id)
        tri = month_end(total_return_index(tic))
        prices[aid] = tri / fx.reindex(tri.index) if per_usd else tri * fx.reindex(tri.index)
    P = pd.DataFrame(prices).sort_index()
    P = P.loc[:pd.Timestamp.today().to_period("M")]
    R = P.pct_change(fill_method=None).iloc[1:]

    def splice(late: pd.Series, early: pd.Series, start: str) -> pd.Series:
        out = early.copy()
        out[out.index >= start] = late[late.index >= start]
        return out

    pr = lambda s: s.pct_change(fill_method=None).reindex(P.index).iloc[1:]
    R["UST"] = splice(pr(month_end(daily("IEF")["Close"].squeeze())),
                      pr(month_end(daily("VFITX")["Close"].squeeze())), "2002-08")
    R["OIL"] = splice(pr(month_end(daily("BZ=F")["Close"].squeeze()).interpolate(limit=3)),
                      pr(fred("DCOILBRENTEU")), "2007-08")
    eur = fred("DEXUSEU")
    cop_ucits = month_end(daily("4COP.DE")["Close"].squeeze()) * eur
    R["COPX"] = splice(pr(cop_ucits), pr(month_end(daily("COPX")["Close"].squeeze())), "2021-12")
    R["GOLD"] = pr(prices["GOLD"].interpolate(limit=3))
    R.loc[:"2020-01", "VRT"] = np.nan
    R.loc[:"2004-01", "SKHYNIX"] = np.nan

    months = [str(m) for m in R.index]
    lines = [f"{months[0]}|{len(months)}"]
    for aid in ORDER:
        r = R[aid]
        first = int(np.argmax(r.notna().values))
        vals = ["" if pd.isna(x) else str(int(round(x * 1e4))) for x in r.values[first:]]
        lines.append(f"{aid}|{first}|{','.join(vals)}")
    # risk-free: 13-week T-bill yield at the end of the previous month, as a monthly rate
    irx = month_end(daily("^IRX", adjusted=False)["Close"].squeeze()).reindex(P.index).ffill()
    rf = (irx.shift(1) / 12 / 100).loc[R.index]
    lines.append("RF|0|" + ",".join("" if pd.isna(x) else str(int(round(x * 1e4))) for x in rf.values))
    out = Path(__file__).resolve().parent.parent / "data/monthly_returns_bp.txt"
    out.write_text("\n".join(lines) + "\n")
    print(f"Wrote {out} ({months[0]} to {months[-1]}, {len(months)} months)")


if __name__ == "__main__":
    main()
