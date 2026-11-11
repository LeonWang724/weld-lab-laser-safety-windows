"""Build the standalone local page and downloadable project archive."""
from pathlib import Path
import base64
import urllib.parse
import zipfile

root = Path(__file__).resolve().parent
dist = root / "dist"
html = (dist / "index.html").read_text()
css = (dist / "styles.css").read_text()
html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
icon = urllib.parse.quote((dist / "icon.svg").read_text(), safe="")
html = html.replace('href="icon.svg"', 'href="data:image/svg+xml,' + icon + '"')
model = (dist / "model.js").read_text().replace("export ", "") + '\nconst DEFAULT_WAVELENGTHS = WAVELENGTHS;\n'
app = (dist / "app.js").read_text().split("\n", 1)[1]
for image in (dist / "assets").glob("*.png"):
    data = base64.b64encode(image.read_bytes()).decode("ascii")
    app = app.replace("assets/" + image.name, "data:image/png;base64," + data)
html = html.replace('<script type="module" src="app.js"></script>', '<script type="module">\n' + model + '\n' + app + '\n</script>')
for name in ("Weld-Lab-Laser-Safety.html", "Luma.html"):
    (dist / name).write_text(html)

for name in ("Weld-Lab-Laser-Safety.zip", "Luma-laser-display.zip"):
    with zipfile.ZipFile(root.parent / name, "w", zipfile.ZIP_DEFLATED) as archive:
        for item in sorted(root.rglob("*")):
            rel = item.relative_to(root)
            if item.is_file() and item.name != "Luma.html" and not any(part.startswith(".") or part == "__pycache__" for part in rel.parts):
                archive.write(item, Path("Weld-Lab-Laser-Safety") / rel)
print("Built the standalone page with embedded images and the project ZIP.")
