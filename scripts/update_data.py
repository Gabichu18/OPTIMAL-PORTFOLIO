"""Weekly data update: fetch the latest prices and roll the data file forward.

Usage:
    python scripts/update_data.py              # fetch from Yahoo/FRED, merge, write
    python scripts/update_data.py fresh.txt    # merge an already fetched file

The full history in data/monthly_returns_bp.txt has been checked by hand
(splices, bad prints, corporate actions), so a fresh download only replaces
the most recent months: the last month already in the file (usually a month
still in progress) and any month after it. Everything older is kept as is.
The script refuses to write anything if the download looks wrong (missing
series, no recent data, implausible returns), so a bad week leaves the
published data untouched.
"""
import subprocess
import sys
import tempfile
import time
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data/monthly_returns_bp.txt"
MAX_ABS = {"BTC": 0.95}  # largest believable monthly move (fraction); default below
DEFAULT_MAX = 0.75
SCALE = {"EURX5": 1e5}  # these series are stored in 1e-5 units, the rest in basis points


def month_add(m: str, k: int) -> str:
    y, mo = map(int, m.split("-"))
    t = y * 12 + mo - 1 + k
    return f"{t // 12}-{t % 12 + 1:02d}"


def parse(path: Path):
    lines = path.read_text().strip().splitlines()
    start, n = lines[0].split("|")
    series = {}
    for ln in lines[1:]:
        sid, first, vals = ln.split("|", 2)
        v = [None if x == "" else int(x) for x in vals.split(",")] if vals else []
        series[sid] = [None] * int(first) + v
    return start, int(n), series


def write(path: Path, start: str, n: int, series: dict) -> None:
    out = [f"{start}|{n}"]
    for sid, v in series.items():
        first = next((i for i, x in enumerate(v) if x is not None), len(v))
        out.append(f"{sid}|{first}|" + ",".join("" if x is None else str(x) for x in v[first:]))
    path.write_text("\n".join(out) + "\n")


def fetch(dest: Path) -> None:
    for attempt in range(3):  # Yahoo rate-limits now and then
        r = subprocess.run([sys.executable, str(ROOT / "scripts/fetch_data.py"), str(dest)])
        if r.returncode == 0:
            return
        time.sleep(120 * (attempt + 1))
    sys.exit("Download failed three times; data left unchanged.")


def main() -> None:
    if len(sys.argv) > 1:
        fresh = Path(sys.argv[1])
    else:
        fresh = Path(tempfile.mkdtemp()) / "fresh.txt"
        fetch(fresh)
    o_start, o_n, old = parse(DATA)
    n_start, n_n, new = parse(fresh)
    o_last, n_last = month_add(o_start, o_n - 1), month_add(n_start, n_n - 1)

    problems = []
    missing = [s for s in old if s not in new]
    if missing:
        problems.append(f"series missing from the download: {', '.join(missing)}")
    if n_last < o_last:
        problems.append(f"download ends in {n_last}, before the current file ({o_last})")
    today = date.today()
    if n_last < month_add(f"{today.year}-{today.month:02d}", -1):
        problems.append(f"download ends in {n_last}, more than a month ago")
    if problems:
        sys.exit("Not updating:\n- " + "\n- ".join(problems))

    # months to take from the download: the last month of the file onwards
    cut = o_n - 1
    shift = (int(o_start[:4]) * 12 + int(o_start[5:])) - (int(n_start[:4]) * 12 + int(n_start[5:]))
    n_total = o_n - 1 + (n_n - (cut + shift))
    merged = {}
    for sid, v in old.items():
        tail = new[sid][cut + shift:]
        merged[sid] = v[:cut] + tail
        for k, x in enumerate(tail):
            if x is None:
                continue
            lim = MAX_ABS.get(sid, DEFAULT_MAX)
            if abs(x / SCALE.get(sid, 1e4)) > lim:
                problems.append(f"{sid} {month_add(o_start, cut + k)}: {x / SCALE.get(sid, 1e4):+.0%} looks wrong")
        # an asset that traded last month should still have a price
        if v[cut - 1] is not None and tail and tail[-1] is None and sid not in ("RF", "RFEUR", "EURX5"):
            problems.append(f"{sid}: no return for {n_last}")
    # the overlap tells whether the download agrees with the checked history
    diffs = [abs(old[s][i] - new[s][i + shift]) for s in old for i in range(max(0, cut - 24), cut)
             if old[s][i] is not None and 0 <= i + shift < len(new[s]) and new[s][i + shift] is not None and s not in SCALE]
    if diffs and sorted(diffs)[len(diffs) // 2] > 25:
        problems.append(f"the last two years differ from the checked data by a median of {sorted(diffs)[len(diffs) // 2]} bp")
    if problems:
        sys.exit("Not updating:\n- " + "\n- ".join(problems))

    write(DATA, o_start, n_total, merged)
    print(f"Updated {DATA.name}: {o_last} refreshed, now {o_start} to {n_last} ({n_total} months)")


if __name__ == "__main__":
    main()
