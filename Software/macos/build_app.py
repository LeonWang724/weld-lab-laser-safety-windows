"""Build the offline macOS app using Apple's Swift compiler."""
from pathlib import Path
import argparse
import os
import plistlib
import shutil
import subprocess
import struct
import tempfile

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument("--work-dir", default=str(Path(tempfile.gettempdir()) / "WeldLabLaserSafetyBuild"))
parser.add_argument("--output", default=str(root.parent / "Weld Lab Laser Safety.app"))
args = parser.parse_args()
work = Path(args.work_dir).resolve()
app = Path(args.output).resolve()
work.mkdir(parents=True, exist_ok=True)
subprocess.run(["python3", str(root / "build_local.py")], check=True)
contents = app / "Contents"
resources = contents / "Resources"
executable = contents / "MacOS" / "WeldLabLaserSafety"
resources.mkdir(parents=True, exist_ok=True)
executable.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(root / "dist/Weld-Lab-Laser-Safety.html", resources)
shutil.copytree(root / "dist/arduino", resources / "arduino", dirs_exist_ok=True)
info = {
    "CFBundleName": "Weld Lab Laser Safety",
    "CFBundleDisplayName": "Weld Lab Laser Safety",
    "CFBundleIdentifier": "local.weldlab.lasersafety",
    "CFBundleExecutable": "WeldLabLaserSafety",
    "CFBundlePackageType": "APPL",
    "CFBundleShortVersionString": "1.5",
    "CFBundleVersion": "6",
    "CFBundleIconFile": "AppIcon",
    "LSMinimumSystemVersion": "13.0",
    "LSMultipleInstancesProhibited": True,
    "NSHighResolutionCapable": True,
    "NSPrincipalClass": "NSApplication",
    "NSAppTransportSecurity": {"NSAllowsLocalNetworking": True, "NSAllowsArbitraryLoadsInWebContent": True},
    "NSHumanReadableCopyright": "Weld Lab Laser Safety — local display application",
}
with (contents / "Info.plist").open("wb") as f:
    plistlib.dump(info, f)
swift = subprocess.check_output(["xcrun", "--find", "swiftc"], text=True).strip()
sdk = subprocess.check_output(["xcrun", "--sdk", "macosx", "--show-sdk-path"], text=True).strip()
environment = os.environ.copy()
environment["CLANG_MODULE_CACHE_PATH"] = str(work / "ModuleCache")
subprocess.run([swift, "-parse-as-library", "-swift-version", "5", "-sdk", sdk, "-O", "-module-cache-path", str(work / "ModuleCache"), "-target", "arm64-apple-macos13.0", "-framework", "AppKit", "-framework", "WebKit", "-framework", "ImageIO", str(root / "macos/main.swift"), "-o", str(executable)], env=environment, check=True)
iconset = work / "AppIcon.iconset"
subprocess.run([str(executable), "--make-iconset", str(iconset)], check=True)
chunks = []
for kind, filename in [(b"ic07", "icon_128x128.png"), (b"ic08", "icon_256x256.png"), (b"ic09", "icon_512x512.png"), (b"ic10", "icon_512x512@2x.png")]:
    data = (iconset / filename).read_bytes()
    chunks.append(kind + struct.pack(">I", len(data) + 8) + data)
body = b"".join(chunks)
(resources / "AppIcon.icns").write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)
subprocess.run(["/usr/bin/codesign", "--force", "--sign", "-", "--timestamp=none", str(app)], check=True)
subprocess.run(["/usr/bin/codesign", "--verify", "--deep", "--strict", str(app)], check=True)
archive = app.parent / "Weld-Lab-Laser-Safety-Mac.zip"
if archive.exists(): archive.unlink()
subprocess.run(["/usr/bin/ditto", "-c", "-k", "--sequesterRsrc", "--keepParent", str(app), str(archive)], check=True)
print("Mac app:", app)
print("Download:", archive)
