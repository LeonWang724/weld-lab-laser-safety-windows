"""Build one copyable Windows setup file containing the app and its installer."""
from pathlib import Path
import base64
import hashlib
import io
import shutil
import zipfile

root = Path(__file__).resolve().parent
windows = root / 'windows'
output = root.parent
shutil.copy2(root / 'shared/server.py', windows / 'server.py')
shutil.copytree(root / 'dist', windows / 'web', dirs_exist_ok=True)
# Include only application files, never a previous installer or user runtime.
files = [windows / name for name in ('launch.py', 'server.py', 'Start Display.cmd',
         'Enable Automatic Startup.cmd', 'README.md')]
files += sorted(p for p in (windows / 'web').rglob('*')
                if p.is_file() and not p.name.startswith('.') and p.name != 'Luma.html')
manifest = []
stream = io.BytesIO()
with zipfile.ZipFile(stream, 'w', zipfile.ZIP_DEFLATED) as archive:
    for path in files:
        relative = path.relative_to(windows).as_posix()
        data = path.read_bytes()
        archive.writestr(relative, data)
        manifest.append("        '" + relative.replace('/', '\\') + '|' + hashlib.sha256(data).hexdigest() + "'")
script = (windows / 'setup.ps1').read_text().replace('__MANIFEST__', ',\n'.join(manifest))
header = r'''@echo off
setlocal
set "WELD_SETUP_SOURCE=%~f0"
title Weld Lab Laser Safety Setup
powershell.exe -NoProfile -Command "$text=[IO.File]::ReadAllText($env:WELD_SETUP_SOURCE);$match=[regex]::Match($text,'(?ms)^# POWERSHELL\r?\n(.*?)^# PAYLOAD\r?\n');if(!$match.Success){exit 1};& ([scriptblock]::Create($match.Groups[1].Value))"
if errorlevel 1 pause
exit /b
# POWERSHELL
'''
payload = base64.encodebytes(stream.getvalue()).decode('ascii')
installer = header + script + '\n# PAYLOAD\n' + payload
path = output / 'Install Weld Lab Laser Safety.cmd'
path.write_bytes(installer.replace('\r\n', '\n').replace('\n', '\r\n').encode('utf-8'))
# A ZIP makes it easier to transfer through services that block .cmd attachments.
with zipfile.ZipFile(output / 'Weld-Lab-Laser-Safety-Windows-Setup.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    archive.write(path, path.name)
print('Windows setup:', path)
