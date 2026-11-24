param(
    [string]$Cli='arduino-cli',
    [string]$ArduinoData=$(if($env:ARDUINO_DIRECTORIES_DATA){$env:ARDUINO_DIRECTORIES_DATA}else{Join-Path $env:LOCALAPPDATA 'Arduino15'}),
    [string]$BuildDirectory=(Join-Path $env:TEMP 'ghostdesk-cyd-build'),
    [string]$OutputDirectory=(Join-Path $PSScriptRoot '../dist/board')
)
$ErrorActionPreference='Stop'
$platform=Join-Path $ArduinoData 'packages/esp32/hardware/esp32/2.0.17'
$tool=Join-Path $ArduinoData 'packages/esp32/tools/esptool_py/4.5.1/esptool.exe'
if(!(Test-Path -LiteralPath $tool) -or !(Test-Path -LiteralPath $platform)){throw 'Install the pinned Espressif core 2.0.17 first.'}
& $Cli compile --fqbn 'esp32:esp32:esp32:FlashSize=4M,PartitionScheme=default,FlashMode=dio,FlashFreq=40' --jobs 4 --build-path $BuildDirectory (Join-Path $PSScriptRoot GhostBoard)
if($LASTEXITCODE){throw 'Firmware compile failed.'}
[void][IO.Directory]::CreateDirectory($OutputDirectory)
$out=Join-Path $OutputDirectory 'GhostDesk-CYD-ILI9341.bin'
& $tool --chip esp32 merge_bin -o $out --flash_mode dio --flash_freq 40m --flash_size 4MB 0x1000 (Join-Path $BuildDirectory 'GhostBoard.ino.bootloader.bin') 0x8000 (Join-Path $BuildDirectory 'GhostBoard.ino.partitions.bin') 0xe000 (Join-Path $platform 'tools/partitions/boot_app0.bin') 0x10000 (Join-Path $BuildDirectory 'GhostBoard.ino.bin')
if($LASTEXITCODE){throw 'Firmware merge failed.'}
$hash=(Get-FileHash -LiteralPath $out -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $OutputDirectory 'firmware.sha256'),"$hash  GhostDesk-CYD-ILI9341.bin")
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'windows/Set up board.cmd'),(Join-Path $PSScriptRoot 'windows/setup-board.ps1'),(Join-Path $PSScriptRoot 'START HERE.md') -Destination $OutputDirectory -Force
Write-Host "Built $out for flash address 0x0"
