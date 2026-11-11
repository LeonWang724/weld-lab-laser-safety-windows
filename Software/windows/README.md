# Install on the Windows display PC

Copy **Install Weld Lab Laser Safety.cmd** onto the PC and double-click it. If you received **Weld-Lab-Laser-Safety-Windows-Setup.zip**, extract it first, then run the .cmd file.

Setup downloads a private Python 3.8.10 runtime from python.org and, if Firefox is missing, downloads a Mozilla-signed Firefox installer from Mozilla. For Windows 7/8 it chooses the newest available Firefox 115 ESR release. On newer Windows it downloads current Firefox. It copies the app into `%LOCALAPPDATA%\Weld Lab Laser Safety`, creates **Weld Lab Laser Safety** on your Desktop, and opens the display. The setup file can then be removed. No manual Python installation or pip commands are needed.

Internet is required for the first setup. Windows 7 must have SP1, Universal C Runtime updates and working TLS 1.2/certificate support. Setup reports an error if those prerequisites are missing. A Windows security or installation prompt may require approval under the PC's policies. No Windows 7 execution testing was possible on the development Mac.

Next time, double-click **Weld Lab Laser Safety** on the Desktop. Keep its command window open while the monitor is in use. Closing Firefox alone leaves the shared service running; Ctrl+C in the command window stops it. Settings contains the report controls.

If Windows Firewall prompts, allow Python on the trusted lab/private network only. If controls from other computers cannot connect, ask the lab administrator to allow inbound TCP port **8765** for Python on that network; do not disable the firewall.
On another computer on the same reachable lab network, open `http://DISPLAY-PC:8765/?control=1`, replacing DISPLAY-PC with the name printed in the command window. If the name fails, run `ipconfig` on the display PC and use its active adapter's IPv4 address instead. The local controls are `http://127.0.0.1:8765/?control=1`.

Optional: double-click **Enable Automatic Startup.cmd** to start the display after this Windows user signs in. This does not enable automatic Windows login. Keep the folder in place. To undo, press Windows+R, enter `shell:startup`, and delete **Weld Lab Laser Safety.cmd**.

Preferences are saved under `%APPDATA%\weld-lab-laser-safety\preferences.json`. Reports expire after five minutes and restart as unknown. Network loss shows unknown. These are manual reports; the software does not detect or operate physical lasers and does not replace an interlock.

Windows 7 and Python 3.8 are out of security support. Browser compatibility is not a promise of ongoing security updates. Use only the trusted lab network; do not publish port 8765 on the internet. Check with the lab administrator before putting this old PC into service.

This package was prepared on macOS. Real Windows 7 startup, Firefox display, firewall access and automatic login startup still need checking on the actual PC. On that PC first verify: launch display, change a report from another computer, confirm expiry/disconnection shows unknown, then restart and confirm reports are unknown.
