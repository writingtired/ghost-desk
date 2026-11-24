param(
    [string]$RuntimeZip,
    [string]$OutputDirectory=(Join-Path $PSScriptRoot 'dist')
)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$version='v24.19.0'
$sha='57f71ab3652e797d84acddc79c81cc9ff1c6ddb2a1974cdb83f00fee9bff4c73'
$name="node-$version-win-x64"
$stage=[IO.Directory]::CreateDirectory((Join-Path ([IO.Path]::GetTempPath()) ('ghostdesk-build-'+[guid]::NewGuid().ToString('N')))).FullName
try {
    if (!$RuntimeZip) {
        $RuntimeZip=Join-Path $stage "$name.zip"
        Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$version/$name.zip" -OutFile $RuntimeZip
    }
    if ((Get-FileHash -LiteralPath $RuntimeZip -Algorithm SHA256).Hash -ne $sha) {throw 'Node runtime checksum mismatch'}
    $bundle=Join-Path $stage 'Ghost Desk'
    $app=[IO.Directory]::CreateDirectory((Join-Path $bundle 'app')).FullName
    $runtime=[IO.Directory]::CreateDirectory((Join-Path $bundle 'runtime')).FullName
    $browser=[IO.Directory]::CreateDirectory((Join-Path $bundle 'browser')).FullName
    & (Join-Path $PSScriptRoot 'dock/build.ps1') -OutputFile (Join-Path $bundle 'Ghost Desk.exe')
    foreach($file in 'ghost-mark.png','bridge.mjs','device-link.mjs','board-update.mjs','activity.mjs','display.html','display.js','sprites.js','sprites.json','codex.mjs','desktop.mjs','focus-antigravity.ps1','index.html','panel.js','panel.css') {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $app
    }
    foreach($file in 'manifest.json','worker.js','observe.js') {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot "browser/$file") -Destination $browser
    }
    foreach($file in 'LICENSE','README.md','RELEASE.md','Ghost Desk preview.png','Ghost Desk demo.gif') {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot $file) -Destination $bundle
    }
    # The repository download links point at GitHub. Offline readers already have the app.
    $readme=Join-Path $bundle 'README.md'
    $copy=[IO.File]::ReadAllText($readme)
    $copy=[regex]::Replace($copy,'(?m)^\*\*\[Download for Windows\].*\r?\n','')
    $copy=[regex]::Replace($copy,'(?m)^Already paired\? Download the .*\r?$','Already paired? Open **Update display…** in Ghost Desk and select the .ota.bin from the release.')
    [IO.File]::WriteAllText($readme,$copy)
    $guides=[IO.Directory]::CreateDirectory((Join-Path $bundle 'hardware')).FullName
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'hardware/START HERE.md'),(Join-Path $PSScriptRoot 'hardware/BUILD.md'),(Join-Path $PSScriptRoot 'hardware/DEPENDENCIES.md') -Destination $guides
    $source=[IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $RuntimeZip).Path)
    try {
        foreach($file in 'node.exe','LICENSE') {
            $entry=$source.GetEntry("$name/$file")
            if (!$entry) {throw "Missing runtime file $file"}
            [IO.Compression.ZipFileExtensions]::ExtractToFile($entry,(Join-Path $runtime $file))
        }
    } finally {$source.Dispose()}
    $out=[IO.Directory]::CreateDirectory($OutputDirectory).FullName
    $zip=Join-Path $out 'Ghost-Desk-Windows-x64.zip'
    $built=Join-Path $stage 'release.zip'
    [IO.Compression.ZipFile]::CreateFromDirectory($bundle,$built,[IO.Compression.CompressionLevel]::Optimal,$true)
    Copy-Item -LiteralPath $built -Destination $zip -Force
    Write-Output $zip
} finally {
    $resolved=[IO.Path]::GetFullPath($stage)
    if ([IO.Path]::GetDirectoryName($resolved) -eq [IO.Path]::GetTempPath().TrimEnd('\') -and
        [IO.Path]::GetFileName($resolved) -match '^ghostdesk-build-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
