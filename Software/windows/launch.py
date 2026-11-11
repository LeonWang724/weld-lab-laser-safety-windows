"""Run the shared monitor on Windows with Python 3.8 or newer."""
from pathlib import Path
import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent
URL = "http://127.0.0.1:8765/"

def service_ready():
    try:
        with urllib.request.urlopen(URL + "__weld_lab_health__", timeout=1) as response:
            return json.load(response).get("app") == "weld-lab-laser-safety"
    except (OSError, ValueError):
        return False

def find_firefox():
    installed = ROOT / "browser-path.txt"
    if installed.is_file():
        candidate = Path(installed.read_text(encoding="utf-8").strip())
        if candidate.is_file():
            return str(candidate)
    candidate = ROOT / "browser/firefox.exe"
    if candidate.is_file():
        return str(candidate)
    executable = shutil.which("firefox")
    if executable:
        return executable
    for name in ("ProgramFiles", "ProgramFiles(x86)", "LOCALAPPDATA"):
        folder = os.environ.get(name)
        if folder:
            candidate = Path(folder) / "Mozilla Firefox/firefox.exe"
            if candidate.is_file():
                return str(candidate)
    raise RuntimeError("Install Firefox first. Windows 7 requires Firefox 115 ESR. See README.md.")

def install_startup():
    startup = Path(os.environ["APPDATA"]) / "Microsoft/Windows/Start Menu/Programs/Startup"
    startup.mkdir(parents=True, exist_ok=True)
    # Escape literal percent signs for cmd.exe; quote paths containing spaces.
    python = sys.executable.replace("%", "%%")
    launcher = str(ROOT / "launch.py").replace("%", "%%")
    (startup / "Weld Lab Laser Safety.cmd").write_text(
        '@echo off\n"' + python + '" "' + launcher + '" --kiosk\n', encoding="mbcs")
    print("Automatic startup enabled for this Windows account. Keep this folder in place.")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kiosk", action="store_true")
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--install-startup", action="store_true")
    args = parser.parse_args()
    required = [ROOT / "server.py"] + [ROOT / "web" / name for name in
                ("index.html", "app.js", "model.js", "styles.css", "icon.svg")]
    if any(not path.is_file() for path in required):
        parser.exit(1, "Keep the complete Windows PC folder together.\n")
    if args.check:
        print("Windows server and web files are ready.")
        return 0
    if sys.platform != "win32":
        parser.exit(1, "Run this launcher on the Windows display computer.\n")
    if sys.version_info < (3, 8):
        parser.exit(1, "Python 3.8 or newer is required. Windows 7 requires Python 3.8.10.\n")
    own_server = None
    try:
        if args.install_startup:
            install_startup()
            return 0
        firefox = find_firefox()
        if not service_ready():
            own_server = subprocess.Popen([sys.executable, str(ROOT / "server.py")])
            for attempt in range(100):
                if service_ready():
                    break
                if own_server.poll() is not None:
                    raise RuntimeError("Server could not start. Check whether port 8765 is already in use.")
                time.sleep(.1)
            else:
                raise RuntimeError("Server did not become ready within ten seconds.")
        subprocess.Popen([firefox] + (["--kiosk"] if args.kiosk else ["--new-window"]) + [URL + "?display=1"])
        print("Keep this window open while the display is in use. Press Ctrl+C to stop.")
        print("Other computers: http://" + os.environ.get("COMPUTERNAME", "DISPLAY-PC") + ":8765/?control=1")
        while True:
            if own_server is not None and own_server.poll() is not None:
                raise RuntimeError("The status server stopped. Restart the launcher.")
            time.sleep(1)
    except KeyboardInterrupt:
        return 0
    except (OSError, RuntimeError) as error:
        parser.exit(1, str(error) + "\n")
    finally:
        if own_server is not None and own_server.poll() is None:
            own_server.terminate()
            own_server.wait()

if __name__ == "__main__":
    sys.exit(main())
