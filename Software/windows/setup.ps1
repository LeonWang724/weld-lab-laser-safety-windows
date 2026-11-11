$ErrorActionPreference = 'Stop'
function Download($url, $destination) {
    Write-Host ('Downloading ' + $url)
    $client = New-Object Net.WebClient
    try { $client.DownloadFile($url, $destination) } finally { $client.Dispose() }
}
function Extract-Zip($archive, $destination, $required) {
    [IO.Directory]::CreateDirectory($destination) | Out-Null
    $shell = New-Object -ComObject Shell.Application
    $source = $shell.NameSpace([string]$archive)
    $target = $shell.NameSpace([string]$destination)
    if ($null -eq $source -or $null -eq $target) { throw 'Windows could not open the ZIP archive.' }
    $target.CopyHere($source.Items(), 1044)
    $deadline = [DateTime]::UtcNow.AddMinutes(3)
    do {
        $complete = $true
        foreach ($entry in $required) {
            $parts = $entry.Split('|')
            $path = Join-Path $destination $parts[0]
            try {
                $stream = [IO.File]::OpenRead($path)
                $sha = [Security.Cryptography.SHA256]::Create()
                try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
                finally { $stream.Dispose(); $sha.Dispose() }
                if ($actual -ne $parts[1]) { $complete = $false; break }
            } catch { $complete = $false; break }
        }
        if ($complete) { return }
        Start-Sleep -Milliseconds 250
    } while ([DateTime]::UtcNow -lt $deadline)
    throw 'Windows could not finish extracting the files. Close the app and run setup again.'
}
try {
    Write-Host 'Weld Lab Laser Safety - Windows setup'
    Write-Host 'Installing for your Windows account. First setup needs internet access.'
    $version = [Environment]::OSVersion.Version
    if ($version.Major -lt 6 -or ($version.Major -eq 6 -and $version.Minor -lt 1)) {
        throw 'Windows 7 SP1 or newer is required.'
    }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]3072
    $destination = Join-Path $env:LOCALAPPDATA 'Weld Lab Laser Safety'
    $scratch = Join-Path $env:TEMP ('WeldSetup-' + [Guid]::NewGuid().ToString('N'))
    [IO.Directory]::CreateDirectory($scratch) | Out-Null
    $self = [IO.File]::ReadAllText($env:WELD_SETUP_SOURCE)
    $payload = [regex]::Match($self, '(?ms)^# PAYLOAD\r?\n(.*)\z').Groups[1].Value
    $archive = Join-Path $scratch 'app.zip'
    [IO.File]::WriteAllBytes($archive, [Convert]::FromBase64String($payload))
    $manifest = @(
__MANIFEST__
    )
    Write-Host 'Copying the app...'
    Extract-Zip $archive $destination $manifest
    $runtime = Join-Path $destination 'runtime'
    $python = Join-Path $runtime 'python.exe'
    if (!(Test-Path $python) -or !(Test-Path (Join-Path $runtime 'runtime-ready.txt'))) {
        $pythonZip = Join-Path $scratch 'python.zip'
        Download 'https://www.python.org/ftp/python/3.8.10/python-3.8.10-embed-win32.zip' $pythonZip
        # Digest published on Python's 3.8.10 release page; transfer uses HTTPS.
        $md5 = [Security.Cryptography.MD5]::Create()
        $inputFile = [IO.File]::OpenRead($pythonZip)
        try { $digest = [BitConverter]::ToString($md5.ComputeHash($inputFile)).Replace('-', '').ToLowerInvariant() }
        finally { $inputFile.Dispose(); $md5.Dispose() }
        if ($digest -ne '659adf421e90fba0f56a9631f79e70fb') { throw 'Python download verification failed. Run setup again.' }
        # Shell extraction is asynchronous. Wait for the runtime to pass an import check.
        [IO.Directory]::CreateDirectory($runtime) | Out-Null
        $shell = New-Object -ComObject Shell.Application
        $shell.NameSpace([string]$runtime).CopyHere($shell.NameSpace([string]$pythonZip).Items(), 1044)
        $ready = $false
        $deadline = [DateTime]::UtcNow.AddMinutes(3)
        do {
            if ((Test-Path $python) -and (Test-Path (Join-Path $runtime 'python38.zip'))) {
                try {
                    $probe = Start-Process -FilePath $python -ArgumentList '-c "import http.server, json, pathlib, urllib.request, ctypes, socket"' -WindowStyle Hidden -Wait -PassThru
                    if ($probe.ExitCode -eq 0) { $ready = $true; break }
                } catch { }
            }
            Start-Sleep -Milliseconds 500
        } while ([DateTime]::UtcNow -lt $deadline)
        if (!$ready) { throw 'Python cannot start. Windows 7 needs SP1 and the Universal C Runtime updates. Install Windows updates and rerun setup.' }
    }
    $probe = Start-Process -FilePath $python -ArgumentList '-c "import http.server, json, pathlib, urllib.request, ctypes, socket"' -WindowStyle Hidden -Wait -PassThru
    if ($probe.ExitCode -ne 0) { throw 'The bundled Python runtime cannot start. Check Windows updates, then rerun setup.' }
    [IO.File]::WriteAllText((Join-Path $runtime 'runtime-ready.txt'), 'Python runtime checked')
    $firefox = $null
    $browserPaths = @((Join-Path $destination 'browser\firefox.exe'))
    foreach ($folder in @($env:ProgramFiles, ${env:ProgramFiles(x86)}, $env:LOCALAPPDATA)) {
        if ($folder) { $browserPaths += Join-Path $folder 'Mozilla Firefox\firefox.exe' }
    }
    foreach ($path in $browserPaths) { if (Test-Path $path) { $firefox = $path; break } }
    if (!$firefox) {
        $installer = Join-Path $scratch 'FirefoxSetup.exe'
        if ($version.Major -eq 6 -and $version.Minor -le 3) {
            $client = New-Object Net.WebClient
            try { $listing = $client.DownloadString('https://archive.mozilla.org/pub/firefox/releases/') }
            finally { $client.Dispose() }
            $releases = [regex]::Matches($listing, 'href="(?:[^"]*/)?(115\.\d+\.\d+esr)/"') | ForEach-Object { $_.Groups[1].Value }
            $release = $releases | Sort-Object { [version]($_ -replace 'esr$', '') } -Descending | Select-Object -First 1
            if (!$release) { throw 'Could not find a Windows 7 compatible Firefox installer on Mozilla. Please install Firefox 115 ESR and run setup again.' }
            Download ('https://archive.mozilla.org/pub/firefox/releases/' + $release + '/win32/en-US/Firefox%20Setup%20' + $release + '.exe') $installer
        } else {
            Download 'https://download.mozilla.org/?product=firefox-latest-ssl&os=win&lang=en-US' $installer
        }
        $signature = Get-AuthenticodeSignature $installer
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch 'Mozilla Corporation') {
            throw 'Windows could not verify the Mozilla installer signature. Check the PC clock and Windows certificate updates, then run setup again.'
        }
        $browserFolder = Join-Path $destination 'browser'
        Write-Host 'Installing Firefox for the display...'
        $installArgs = '/S /InstallDirectoryPath="' + $browserFolder + '" /DesktopShortcut=false /TaskbarShortcut=false /StartMenuShortcuts=false /MaintenanceService=false'
        $process = Start-Process -FilePath $installer -ArgumentList $installArgs -Wait -PassThru
        $firefox = Join-Path $browserFolder 'firefox.exe'
        if (!(Test-Path $firefox)) { throw ('Firefox installation did not finish (exit ' + $process.ExitCode + '). Install Firefox 115 ESR manually on Windows 7 and rerun setup.') }
    }
    # The launcher finds the same browser without needing global PATH changes.
    [IO.File]::WriteAllText((Join-Path $destination 'browser-path.txt'), $firefox, (New-Object Text.UTF8Encoding($false)))
    $wsh = New-Object -ComObject WScript.Shell
    $shortcut = $wsh.CreateShortcut((Join-Path $wsh.SpecialFolders.Item('Desktop') 'Weld Lab Laser Safety.lnk'))
    $shortcut.TargetPath = $python
    $shortcut.Arguments = '"' + (Join-Path $destination 'launch.py') + '" --kiosk'
    $shortcut.WorkingDirectory = $destination
    $shortcut.Description = 'Weld Lab Laser Safety monitor and shared reports'
    $shortcut.IconLocation = $firefox + ',0'
    $shortcut.Save()
    Write-Host 'Installed. Your desktop shortcut is ready. Opening the display...'
    Start-Process -FilePath $python -ArgumentList $shortcut.Arguments -WorkingDirectory $destination
    # Remove only this setup run's temporary download directory.
    Remove-Item -LiteralPath $scratch -Recurse -Force -ErrorAction SilentlyContinue
    exit 0
} catch {
    Write-Host ''
    Write-Host ('Setup could not finish: ' + $_.Exception.Message) -ForegroundColor Red
    Write-Host 'Keep the setup file and run it again after fixing the issue.'
    exit 1
}
