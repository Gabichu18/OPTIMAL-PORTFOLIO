"""Rebuild index.html from the template, stylesheet, engine and data.
Usage: python scripts/build.py
"""
from pathlib import Path
root = Path(__file__).resolve().parent.parent
html = (root / "src/app.template.html").read_text()
html = (html.replace("/*__STYLE__*/", (root / "src/style.css").read_text())
            .replace("/*__DATA__*/", (root / "data/monthly_returns_bp.txt").read_text().strip())
            .replace("/*__ENGINE__*/", (root / "src/engine.js").read_text()))
(root / "index.html").write_text(html)
print("index.html rebuilt")
