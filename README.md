# Weld Lab Laser Safety

A Windows monitor app for shared, manually reported laser status, with an optional Mac client and local preview.

## Install on Windows

1. Download [Install Weld Lab Laser Safety.cmd](https://github.com/LeonWang724/weld-lab-laser-safety-windows/raw/refs/heads/main/Install%20Weld%20Lab%20Laser%20Safety.cmd).
2. Double-click it on the Windows PC. Internet is required for first setup.
3. Setup downloads its Python runtime and Firefox if needed, creates a **Weld Lab Laser Safety** Desktop shortcut, and opens the display.

Windows 7 requires SP1, Universal C Runtime updates and working TLS 1.2/certificates. Windows 7 and Python 3.8 are out of security support. The installer was built and checked on macOS; actual Windows installation still needs verification.

The Windows PC hosts the monitor and shared controls. Staff on the same trusted lab network can open `http://DISPLAY-PC:8765/?control=1`, replacing DISPLAY-PC with its name or IPv4 address. Allow Python through the firewall on that trusted network when prompted. Do not expose this port to the internet.

## Display

Original glass panels, character artwork, wavelength numbers and plain ON captions. All current reports OFF shows **SAFE**. Missing, expired or disconnected reports show **AWAITING REPORTS**. Reports expire after five minutes. The Mac app opens a clearly labeled local preview with all samples OFF.

These are operator reports only. SAFE is not a measurement or an interlock and does not authorize lab entry. The app does not detect or operate physical lasers.

## Source and builds

See [Software/README.md](Software/README.md) and [Windows setup details](Software/windows/README.md).

```sh
cd Software
python3 build_windows_setup.py
python3 -m unittest discover -s tests -p 'test_*.py'
npm test
```

Build the Mac app on an Apple silicon Mac with Xcode command-line tools using `python3 macos/build_app.py`.

The Python server uses only the standard library. The Windows installer downloads dependencies from Python and Mozilla; no credentials are included. Character artwork and Star Wars names belong to their respective owners; no third-party artwork license is granted by this repository.
