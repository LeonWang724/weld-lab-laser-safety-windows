#!/usr/bin/env python3
"""Shared, computer-hosted laser reports and local web interface. No third-party dependencies."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit
import argparse
import json
import math
import os
import socket
import threading
import time
import uuid

CHARACTERS = {"green", "infrared", "palpatine", "chewbacca"}
DEFAULTS = [532, 1064, 971, 671]
REPORT_TTL = 300_000
MAX_ACTIVE = 4


class StateError(ValueError):
    pass


def wavelength(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or not 0 < value <= 1e9:
        raise StateError("Enter a positive wavelength in nanometers.")
    return int(value) if value == int(value) else value


class LabState:
    def __init__(self, preferences_file, clock=None):
        self.preferences_file = Path(preferences_file)
        self.clock = clock or (lambda: time.monotonic_ns() // 1_000_000)
        self.lock = threading.RLock()
        self.wavelengths = list(DEFAULTS)
        self.characters = {}
        self.star_wars = True
        self.space = False
        self.reports = {}
        self.instance = str(uuid.uuid4())
        self.revision = 0
        if self.preferences_file.is_file():
            saved = json.loads(self.preferences_file.read_text(encoding="utf-8"))
            values = saved.get("wavelengths")
            if not isinstance(values, list) or len(values) > 200 or not all(nm in values for nm in (532, 1064)):
                raise StateError("Invalid saved wavelength list.")
            values = [wavelength(nm) for nm in values]
            if len(set(values)) != len(values):
                raise StateError("Duplicate saved wavelengths.")
            self.wavelengths = values
            choices = saved.get("characters", {})
            if not isinstance(choices, dict) or any(str(nm) not in {str(x) for x in values} or character not in CHARACTERS for nm, character in choices.items()):
                raise StateError("Invalid saved character choices.")
            self.characters = choices
            self.star_wars = saved.get("starWarsEnabled", True) is True
            self.space = saved.get("spaceEnabled", False) is True

    def save(self):
        self.preferences_file.parent.mkdir(parents=True, exist_ok=True)
        data = {"wavelengths": self.wavelengths, "characters": self.characters,
                "starWarsEnabled": self.star_wars, "spaceEnabled": self.space}
        temporary = self.preferences_file.with_suffix(".tmp")
        temporary.write_text(json.dumps(data, allow_nan=False), encoding="utf-8")
        temporary.chmod(0o600)
        temporary.replace(self.preferences_file)

    def snapshot(self):
        with self.lock:
            now = self.clock()
            reports = {}
            for nm in self.wavelengths:
                report = self.reports.get(nm)
                age = now - report[1] if report else 0
                state = report[0] if report and 0 <= age <= REPORT_TTL else "unknown"
                reports[str(nm)] = {"state": state, "ageMs": max(0, age)}
            return {"v": 1, "instance": self.instance, "revision": self.revision, "wavelengths": list(self.wavelengths),
                    "reports": reports, "characters": dict(self.characters),
                    "starWarsEnabled": self.star_wars, "spaceEnabled": self.space}

    def command(self, route, data):
        if not isinstance(data, dict):
            raise StateError("Invalid request.")
        with self.lock:
            if route == "/api/report":
                nm = wavelength(data.get("nm"))
                state = data.get("state")
                if nm not in self.wavelengths or state not in ("on", "off"):
                    raise StateError("Choose a saved wavelength and report ON or OFF.")
                current = self.snapshot()["reports"]
                if state == "on" and current[str(nm)]["state"] != "on" and sum(r["state"] == "on" for r in current.values()) >= MAX_ACTIVE:
                    raise StateError("Maximum four lasers on. Turn one off before switching another on.")
                self.reports[nm] = (state, self.clock())
            elif route == "/api/wavelengths":
                nm = wavelength(data.get("nm"))
                if data.get("action") == "add":
                    if nm in self.wavelengths:
                        raise StateError("That wavelength is already in your list.")
                    if len(self.wavelengths) >= 200:
                        raise StateError("The wavelength list is full. Remove an unused wavelength first.")
                    self.wavelengths.append(nm)
                elif data.get("action") == "remove":
                    if nm not in self.wavelengths or nm in (532, 1064):
                        raise StateError("This wavelength cannot be removed.")
                    if self.reports.get(nm, (None,))[0] == "on":
                        raise StateError("Report this laser OFF before removing it.")
                    self.wavelengths.remove(nm)
                    self.reports.pop(nm, None)
                    self.characters.pop(str(nm), None)
                else:
                    raise StateError("Unknown wavelength action.")
                self.save()
            elif route == "/api/character":
                nm = wavelength(data.get("nm"))
                character = data.get("character")
                if nm not in self.wavelengths or character not in CHARACTERS:
                    raise StateError("Choose one of the four characters for a saved wavelength.")
                self.characters[str(nm)] = character
                self.save()
            elif route == "/api/preferences":
                if not data or set(data) - {"starWarsEnabled", "spaceEnabled"} or any(not isinstance(value, bool) for value in data.values()):
                    raise StateError("Invalid appearance setting.")
                if "starWarsEnabled" in data:
                    self.star_wars = data["starWarsEnabled"]
                if "spaceEnabled" in data:
                    self.space = data["spaceEnabled"]
                self.save()
            elif route == "/api/reset":
                self.reports.clear()
            else:
                raise StateError("Unknown command.")
            self.revision += 1
            return self.snapshot()


class LabHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, state, directory, **kwargs):
        self.state = state
        super().__init__(*args, directory=directory, **kwargs)

    def send_json(self, data, status=200):
        body = json.dumps(data, allow_nan=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        if len(args) > 1 and str(args[1]).startswith(("4", "5")):
            super().log_message(format, *args)

    def do_GET(self):
        path = urlsplit(self.path).path
        if path == "/api/state":
            self.send_json(self.state.snapshot())
        elif path == "/__weld_lab_health__":
            self.send_json({"app": "weld-lab-laser-safety", "v": 1})
        elif path in ("/", "/index.html", "/Weld-Lab-Laser-Safety.html"):
            filename = "Weld-Lab-Laser-Safety.html" if path.endswith("Weld-Lab-Laser-Safety.html") else "index.html"
            page = (Path(self.directory) / filename).read_text(encoding="utf-8").replace("</head>", '<meta name="weld-network" content="1"></head>')
            body = page.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif path.startswith("/api/"):
            self.send_json({"error": "Unknown endpoint."}, 404)
        else:
            super().do_GET()

    def do_POST(self):
        # JSON-only commands and same-origin requests prevent cross-site form updates.
        origin = self.headers.get("Origin")
        if origin and (urlsplit(origin).scheme not in ("http", "https") or urlsplit(origin).netloc.lower() != self.headers.get("Host", "").lower()):
            self.send_json({"error": "Open the controls directly from the display computer address."}, 403)
            return
        if self.headers.get("Content-Type", "").split(";")[0].strip() != "application/json":
            self.send_json({"error": "Commands must use JSON."}, 415)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 4096:
                raise StateError("Invalid request size.")
            data = json.loads(self.rfile.read(length), parse_constant=lambda value: (_ for _ in ()).throw(StateError("Invalid number.")))
            self.send_json(self.state.command(urlsplit(self.path).path, data))
        except (ValueError, TypeError) as error:
            self.send_json({"error": str(error)}, 400)
        except OSError:
            self.send_json({"error": "Could not save settings on the display computer. Check its storage and try again."}, 500)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--web", type=Path, default=Path(__file__).resolve().parent / "web")
    config = Path(os.environ.get("APPDATA") or os.environ.get("XDG_CONFIG_HOME") or Path.home() / ".config")
    parser.add_argument("--preferences", type=Path, default=config / "weld-lab-laser-safety/preferences.json")
    args = parser.parse_args()
    if not (args.web / "index.html").is_file():
        parser.error("Keep the web folder beside server.py, or pass --web with the web folder path.")
    try:
        state = LabState(args.preferences)
        handler = partial(LabHandler, state=state, directory=str(args.web.resolve()))
        server = ThreadingHTTPServer((args.host, args.port), handler)
        server.daemon_threads = True
    except (ValueError, OSError) as error:
        parser.exit(1, str(error) + "\n")
    print(f"Monitor display: http://127.0.0.1:{args.port}/?display=1", flush=True)
    print(f"PC controls: http://{socket.gethostname()}.local:{args.port}/?control=1", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
