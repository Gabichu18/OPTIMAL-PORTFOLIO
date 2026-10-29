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
- Energy: Xtrackers MSCI World Energy UCITS ETF (XDW0, EUR) from May 2016,
  iShares Global Energy (IXC) from December 2001, Vanguard Energy fund
  (VGENX) before that.
- Currency: EUR/USD month-end from FRED (DEXUSEU; German mark at the fixed
  1.95583 conversion rate before 1999) and the euro 3-month interbank rate
  (IR3TIB01EZM156N, ECB deposit rate for the latest months) for the euro
  base-currency views.
- Copper miners: Global X Copper Miners UCITS (4COP.DE, EUR) from November
  2021, US-listed COPX before that.
- Ferrovial: an unadjusted 5:1 split on 27 Oct 2004 is neutralised (that
  day's return set to zero).
- SK Hynix starts in February 2004, after its 2003 debt restructuring;
  earlier Yahoo prices contain bad dividend records.
- Vertiv starts in February 2020 (earlier prices are the pre-merger SPAC).
- Airbus (AIR.PA, EUR) is converted to USD like Ferrovial; Yahoo's history starts in
  September 2001 (EADS), and American Water Works listed in April 2008.
- GE: Yahoo records the GE HealthCare (Jan 2023) and GE Vernova (Apr 2024)
  spin-offs as split factors, so the adjusted close assumes the spun-off
  shares were sold and reinvested in GE. Occidental's California Resources
  spin-off (Dec 2014) is handled the same way by Yahoo.
- Unilever (UL, the NYSE ADR): Yahoo records the 8-for-9 share consolidation
  of 9 Dec 2025 but not the Magnum Ice Cream demerger (1 MICC per 5 Unilever
  shares, ex 8 Dec 2025), so December 2025 adds back the spun-off value
  ($14.92 x 0.225 per share against a $62.27 close).
- Repsol (REP.MC, EUR) is converted to USD like Ferrovial; Yahoo's history
  starts in January 2000.
"""
from pathlib import Path
import numpy as np
import pandas as pd
import yfinance as yf

START, END = "1996-08-01", None  # END=None: up to today
US = {
    "NVDA": "NVDA", "AMZN": "AMZN", "GOOGL": "GOOGL", "MSFT": "MSFT", "META": "META", "AAPL": "AAPL",
    "VRT": "VRT", "VST": "VST", "ETN": "ETN", "ANET": "ANET", "MU": "MU", "TSM": "TSM", "AMAT": "AMAT",
    "CAT": "CAT", "GE": "GE", "AWK": "AWK", "NOC": "NOC", "AVGO": "AVGO", "CRWD": "CRWD", "JPM": "JPM", "GS": "GS", "LMT": "LMT", "NUE": "NUE",
    "TM": "TM", "PFE": "PFE", "UNH": "UNH", "JNJ": "JNJ", "UL": "UL", "OXY": "OXY", "ASML": "ASML", "GOLD": "GC=F", "BTC": "BTC-USD", "COST": "COST", "SPY": "SPY",
}
LOCAL = {  # id -> (Yahoo ticker, FRED FX series, True if FX is quoted as local units per USD)
    "XIAOMI": ("1810.HK", "DEXHKUS", True), "SAMSUNG": ("005930.KS", "DEXKOUS", True),
    "SKHYNIX": ("000660.KS", "DEXKOUS", True), "ITX": ("ITX.MC", "DEXUSEU", False),
    "FER": ("FER.MC", "DEXUSEU", False), "IBE": ("IBE.MC", "DEXUSEU", False), "AIR": ("AIR.PA", "DEXUSEU", False),
    "REP": ("REP.MC", "DEXUSEU", False),
}
ORDER = ["NVDA", "AMZN", "GOOGL", "MSFT", "META", "AAPL", "VRT", "VST", "ETN", "ANET", "MU", "TSM", "XIAOMI",
         "AMAT", "SAMSUNG", "CAT", "GE", "AIR", "AVGO", "CRWD", "JPM", "GS", "LMT", "NOC", "NUE", "TM", "PFE", "UNH", "JNJ", "UL", "ITX", "ASML",
         "SKHYNIX", "GOLD", "COPX", "ENERGY", "OXY", "REP", "BTC", "UST", "FER", "IBE", "AWK", "COST", "SPY"]


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
    eur = fred("DEXUSEU")
    xdw0 = month_end(daily("XDW0.DE")["Close"].squeeze()) * eur
    R["ENERGY"] = splice(pr(xdw0), splice(pr(month_end(daily("IXC")["Close"].squeeze())),
                                          pr(month_end(daily("VGENX")["Close"].squeeze())), "2001-12"), "2016-05")
    cop_ucits = month_end(daily("4COP.DE")["Close"].squeeze()) * eur
    R["COPX"] = splice(pr(cop_ucits), pr(month_end(daily("COPX")["Close"].squeeze())), "2021-12")
    R["GOLD"] = pr(prices["GOLD"].interpolate(limit=3))
    R.loc[:"2020-01", "VRT"] = np.nan
    R.loc[:"2004-01", "SKHYNIX"] = np.nan
    if "2025-12" in R.index:  # Magnum Ice Cream demerger, not in Yahoo's adjusted close
        R.loc["2025-12", "UL"] = (1 + R.loc["2025-12", "UL"]) * (1 + 0.2 / (8 / 9) * 14.92 / 62.27) - 1

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
    # euro views: EUR/USD returns in 1e-5 units, euro short rate as a monthly rate
    eur_full = eur.combine_first(1.95583 / fred("EXGEUS"))
    fx = eur_full.reindex(P.index).pct_change().iloc[1:]
    lines.append("EURX5|0|" + ",".join("" if pd.isna(x) else str(int(round(x * 1e5))) for x in fx.values))
    ibor = fred("IR3TIB01EZM156N").combine_first(fred("ECBDFR")).reindex(P.index).ffill()
    rfe = (ibor.shift(1) / 12 / 100).loc[R.index]
    lines.append("RFEUR|0|" + ",".join("" if pd.isna(x) else str(int(round(x * 1e4))) for x in rfe.values))
    out = Path(__file__).resolve().parent.parent / "data/monthly_returns_bp.txt"
    out.write_text("\n".join(lines) + "\n")
    print(f"Wrote {out} ({months[0]} to {months[-1]}, {len(months)} months)")


if __name__ == "__main__":
    main()
