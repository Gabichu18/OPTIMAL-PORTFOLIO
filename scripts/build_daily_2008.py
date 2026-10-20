"""Build data/daily_2007_2009.txt (daily closes, 28 Sep 2007 - 30 Sep 2009) for the 2008 crisis page.

Inputs: data/daily_2007_2009/<ID>.txt with tokens YYMMDD:price (Yahoo Finance daily adjusted
closes, in the listing currency). The calendar is the NYSE calendar from SPY; a market that was
closed on a NYSE day carries its last close forward (up to 4 days; longer holes stay empty).

Validation: for every asset and month, the daily path compounded over the month is compared with
the monthly total return in data/monthly_returns_bp.txt. US listings must match closely; non-US
listings differ by the month's currency move (the app re-scales each month to the monthly figure
in the chosen currency, so the page always agrees with the rest of the model).

Output format, one line per series:
  DATES|yymmdd,yymmdd,...            NYSE trading days
  <ID>|p1,p2,...                     closes, empty where the asset had not listed yet
"""
import re
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
src = root / "data/daily_2007_2009"
START, END = "070928", "090930"


def load(path):
    px = {}
    for d, v in re.findall(r"\b(\d{6}):(\d+(?:\.\d+)?)\b", path.read_text()):
        if START <= d <= END:
            px.setdefault(d, float(v))
    return px


spy = load(src / "SPY.txt")
dates = sorted(spy)
series = {}
for f in sorted(src.glob("*.txt")):
    px = load(f)
    first = min(px) if px else None
    out, last, li = [], None, -99
    for i, d in enumerate(dates):
        if d in px:
            last, li = px[d], i
        # carry a close over a foreign holiday (<= 4 NYSE days); a longer hole is left empty and
        # the app fills it with a smooth path that still matches the monthly return
        out.append(last if (first and d >= first and i - li <= 4) else None)
    series[f.stem] = out

# ---- validation against the monthly data (USD) ----
lines = (root / "data/monthly_returns_bp.txt").read_text().split("\n")
y, m = map(int, lines[0].split("|")[0].split("-"))
months = []
for _ in range(int(lines[0].split("|")[1])):
    months.append(f"{y % 100:02d}{m:02d}"); m += 1
    if m > 12: m, y = 1, y + 1
monthly = {}
for l in lines[1:]:
    p = l.split("|")
    if len(p) > 2:
        monthly[p[0]] = {months[int(p[1]) + k]: (int(x) / 1e4 if x else None) for k, x in enumerate(p[2].split(","))}
monthly["SPY"] = monthly.get("SPY")
report = []
for sid, px in series.items():
    worst, bad = 0.0, []
    for ym in sorted({d[:4] for d in dates if d > START}):
        idx = [i for i, d in enumerate(dates) if d[:4] == ym]
        prev = idx[0] - 1
        if prev < 0 or px[prev] is None or px[idx[-1]] is None:
            continue
        r_d = px[idx[-1]] / px[prev] - 1
        r_m = monthly.get(sid, {}).get(ym)
        if r_m is None:
            continue
        diff = r_d - r_m
        worst = max(worst, abs(diff))
        if abs(diff) > float(sys.argv[1] if len(sys.argv) > 1 else .02):
            bad.append(f"{ym}: daily {r_d:+.3f} vs monthly {r_m:+.3f}")
    missing = sum(1 for d, v in zip(dates, px) if v is None and d >= (min(k for k, v2 in zip(dates, px) if v2 is not None) if any(px) else END))
    report.append((sid, worst, bad))
    print(f"{sid:8s} worst monthly gap {worst * 100:5.2f}%  {'; '.join(bad[:4])}")

out = [f"DATES|{','.join(dates)}"] + [f"{sid}|{','.join('' if v is None else f'{v:g}' for v in px)}" for sid, px in series.items()]
(root / "data/daily_2007_2009.txt").write_text("\n".join(out) + "\n")
print(f"{len(dates)} NYSE days {dates[0]} -> {dates[-1]}, {len(series)} series written")
