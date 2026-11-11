# Weld Lab Laser Safety

## Open the Mac app

Double-click **Weld Lab Laser Safety.app**. It opens directly to SAFE in a clearly labeled preview, with all sample reports OFF. A visible Preview label distinguishes samples from the lab display. Use Settings to change reports, characters and backgrounds. Samples expire after five minutes; reopen the app to start a new preview.

To use live lab reports, enter the Windows display computer name or IPv4 address in Settings, for example `192.168.1.50:8765`, and press Connect. The app menu also has Connect to Display Computer. Both computers must be on the same lab network. Disconnect returns to the local preview. Existing saved addresses are retained; connection is explicit when opening the app.

## Windows display computer

Copy **Install Weld Lab Laser Safety.cmd** onto the old PC and double-click it. It downloads its own Python runtime and Firefox if needed, creates a Desktop shortcut and opens the display. First setup needs internet and an updated Windows 7 SP1 installation. The Windows PC README explains firewall access and optional startup after login. No third-party Python packages, microSD card or Arduino are required.

The Windows PC hosts the shared status service on TCP 8765 and drives the monitor. Staff can also use `http://DISPLAY-PC:8765/?control=1` in a browser. Reports expire after five minutes; restart and lost connection show unknown. Preferences persist. These controls report status only and do not operate or detect physical lasers.

## Source and build

`shared/server.py` is the shared Python server; `windows` contains the Windows launcher; `dist` contains the web interface; `macos` contains the native Mac client. Build the Mac app using `python3 macos/build_app.py`. Assemble the complete distribution using `python3 package_desktop.py`. Windows packaging copies the shared server and web assets into Windows PC.

Run server checks using `python3 -m unittest discover -s tests -p 'test_*.py'` and JavaScript model checks using `npm test`.

Windows 7 and Python 3.8 are out of security support. Use the trusted lab network and keep port 8765 off the public internet. Windows startup and Firefox behavior need checking on the actual display PC.

The monitor keeps its original glass panels and wavelength sizes, with a plain unenclosed ON caption. When every current report is OFF, it shows a large yellow SAFE message. Missing, expired or disconnected reports show AWAITING REPORTS; SAFE reflects operator reports only.

Build the single-file Windows installer with `python3 build_windows_setup.py`. Its embedded app payload is verified against SHA-256 hashes during extraction.
