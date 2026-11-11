"""Assemble the self-contained Mac app, complete source, and ready-to-copy Windows version."""
from pathlib import Path
import argparse
import shutil
import subprocess

root = Path(__file__).resolve().parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--output", default=str(root.parent / "Weld Lab Laser Safety"))
args = parser.parse_args()
package = Path(args.output).resolve()
app = root.parent / "Weld Lab Laser Safety.app"
if not app.is_dir():
    parser.error("Build the Mac app first with macos/build_app.py.")
package.mkdir(parents=True, exist_ok=True)
ignore = shutil.ignore_patterns(".git", ".openai", ".DS_Store", "__pycache__", "Luma.html")
subprocess.run(["/usr/bin/ditto", str(app), str(package / app.name)], check=True)
shutil.copytree(root, package / "Software", dirs_exist_ok=True, ignore=ignore)
shutil.copytree(root / "windows", package / "Windows PC", dirs_exist_ok=True, ignore=ignore)
shutil.copy2(root / "shared/server.py", package / "Windows PC/server.py")
shutil.copytree(root / "dist", package / "Windows PC/web", dirs_exist_ok=True, ignore=ignore)
shutil.copy2(root / "package-start.txt", package / "START HERE.txt")
subprocess.run(["python3", str(root / "build_windows_setup.py")], check=True)
shutil.copy2(root.parent / "Install Weld Lab Laser Safety.cmd", package / "Install Weld Lab Laser Safety.cmd")
archive = root.parent / "Weld-Lab-Laser-Safety-Complete.zip"
if archive.exists():
    archive.unlink()
subprocess.run(["/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(package), str(archive)], check=True)
print("Complete folder:", package)
print("Complete ZIP:", archive)
