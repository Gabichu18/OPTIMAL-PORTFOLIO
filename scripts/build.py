"""Rebuild index.html from the template, stylesheet, engine and data.
Usage: python scripts/build.py
"""
import json
from pathlib import Path
root = Path(__file__).resolve().parent.parent
html = (root / "src/app.template.html").read_text()
html = (html.replace("/*__STYLE__*/", (root / "src/style.css").read_text())
            .replace("/*__DATA__*/", (root / "data/monthly_returns_bp.txt").read_text().strip())
            .replace("/*__DAILY__*/", json.dumps({f.stem: f.read_text().strip() for f in sorted((root / "data/daily").glob("*.txt"))}))
            .replace("/*__ENGINE__*/", (root / "src/engine.js").read_text()))
# standalone document wrapper (GitHub Pages serves the file as-is)
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="description" content="Portfolio optimizer on 15 years of real data: Black-Litterman, Ledoit-Wolf, risk parity, downside risk, stress tests, walk-forward backtests and Monte Carlo.">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;font:14px system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>\n'
        '</head>\n<body>\n')
(root / "index.html").write_text(head + html + "\n</body>\n</html>\n")
print("index.html rebuilt")
