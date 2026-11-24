$ErrorActionPreference='Stop'
$dir=Join-Path $env:LOCALAPPDATA 'Ghost Desk'
$base='http://127.0.0.1:43821'
function New-Hex([int]$count) {
    $bytes=New-Object byte[] $count
    $rng=[Security.Cryptography.RandomNumberGenerator]::Create()
    try {$rng.GetBytes($bytes)} finally {$rng.Dispose()}
    return [BitConverter]::ToString($bytes).Replace('-','').ToLowerInvariant()
}
function Get-Flasher {
    $cache=Join-Path $dir 'tools'
    [void][IO.Directory]::CreateDirectory($cache)
    $archive=Join-Path $cache 'esptool-v4.5.1-win64.zip'
    $expected='64d0c24499d46b80d6bd7a05c98bdacc3455ab6d503cc2a99e35711310216045'
    if(!(Test-Path -LiteralPath $archive) -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
        Write-Host 'Downloading the Espressif USB flasher (about 6.4 MB)...'
        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -UseBasicParsing 'https://github.com/espressif/arduino-esp32/releases/download/2.0.7/esptool-v4.5.1-win64.zip' -OutFile "$archive.part"
        if((Get-FileHash -LiteralPath "$archive.part" -Algorithm SHA256).Hash -ne $expected){throw 'Flasher download checksum mismatch.'}
        Move-Item -LiteralPath "$archive.part" -Destination $archive -Force
    }
    $bin=Join-Path $cache 'esptool-4.5.1'
    Expand-Archive -LiteralPath $archive -DestinationPath $bin -Force
    $exe=Get-ChildItem -LiteralPath $bin -Filter esptool.exe -Recurse -File | Select-Object -First 1
    if(!$exe){throw 'The flasher was missing from the verified download.'}
    return $exe.FullName
}
function Flash-Board([string]$portName) {
    $firmware=Join-Path $PSScriptRoot 'GhostDesk-CYD-2USB.bin'
    $expected=(Get-Content -LiteralPath (Join-Path $PSScriptRoot 'firmware.sha256') -Raw).Trim().Split(' ')[0]
    if((Get-FileHash -LiteralPath $firmware -Algorithm SHA256).Hash -ne $expected){throw 'Firmware checksum mismatch. Extract the board kit again.'}
    $exe=Get-Flasher
    $info=& $exe --chip esp32 --port $portName flash_id
    if($LASTEXITCODE -ne 0){throw 'ESP32 detection failed. See BOOT and RESET instructions in START HERE.md.'}
    $info|Out-Host
    if(-not ($info -match 'Detected flash size:\s*4MB')){throw 'Expected a classic ESP32 with exactly 4 MB flash. Check the board revision.'}
    $backups=Join-Path $dir 'board-backups'
    [void][IO.Directory]::CreateDirectory($backups)
    $file=Join-Path $backups ("before-GhostDesk-"+(Get-Date -Format yyyyMMdd-HHmmss)+"-$portName.bin")
    if(Test-Path -LiteralPath $file){throw 'Backup already exists.'}
    Write-Host "Saving the original 4 MB flash to $file"
    & $exe --chip esp32 --port $portName --baud 460800 --after no_reset read_flash 0x0 0x400000 $file
    if($LASTEXITCODE -ne 0 -or (Get-Item -LiteralPath $file).Length -ne 4194304){throw 'Backup failed. Flashing stopped.'}
    & $exe --chip esp32 --port $portName --baud 460800 verify_flash 0x0 $file
    if($LASTEXITCODE -ne 0){throw 'The backup did not verify against the board. Flashing stopped.'}
    $hash=(Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText("$file.sha256",$hash+'  '+[IO.Path]::GetFileName($file))
    if((Read-Host "Backup verified. To replace the firmware on the 2.8-inch CYD, type FLASH $portName") -cne "FLASH $portName"){throw 'Flash canceled. Original firmware is still on the board.'}
    & $exe --chip esp32 --port $portName --baud 460800 write_flash 0x0 $firmware
    if($LASTEXITCODE -ne 0){throw 'Flash failed. Keep the board connected and retry. Your backup is in board-backups.'}
    Start-Sleep -Seconds 2
}
function Get-Board($serial) {
    $serial.WriteLine('GHOST?')
    $until=[datetime]::UtcNow.AddMilliseconds(800)
    while([datetime]::UtcNow -lt $until){
        try{$line=$serial.ReadLine().Trim()}catch [TimeoutException]{continue}
        if($line -match '^GHOST1 (ghostdesk-[a-f0-9]{12}) (\d+\.\d+\.\d+\.\d+) (none|[a-f0-9]{16})$'){
            return @{name=$Matches[1];ip=$Matches[2];pairId=$Matches[3]}
        }
        if($line -like 'GHOST ERROR *'){throw "Board rejected setup: $line"}
    }
}
function Save-Link($board,[string]$key) {
    [void][IO.Directory]::CreateDirectory($dir)
    $file=Join-Path $dir 'board-v1.json'
    $stage=Join-Path $dir ([guid]::NewGuid().ToString('N')+'.tmp')
    try {
        [IO.File]::WriteAllBytes($stage,[byte[]]@())
        $acl=New-Object Security.AccessControl.FileSecurity
        $acl.SetAccessRuleProtection($true,$false)
        $user=[Security.Principal.WindowsIdentity]::GetCurrent().User
        $rule=New-Object Security.AccessControl.FileSystemAccessRule($user,'FullControl','Allow')
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $stage -AclObject $acl
        [IO.File]::WriteAllText($stage,(@{name=$board.name;ip=$board.ip;key=$key}|ConvertTo-Json -Compress))
        if([IO.File]::Exists($file)){[IO.File]::Replace($stage,$file,[NullString]::Value)}else{[IO.File]::Move($stage,$file)}
    }finally{if([IO.File]::Exists($stage)){[IO.File]::Delete($stage)}}
}
function Read-Panel($serial) {
    $serial.WriteLine('PANEL?')
    $until=[datetime]::UtcNow.AddMilliseconds(900)
    while([datetime]::UtcNow -lt $until){
        try{$line=$serial.ReadLine().Trim()}catch [TimeoutException]{continue}
        if($line -match '^GHOST PANEL (ST7789|ILI9341)(-inverted)?$'){return $line.Substring(12)}
        if($line -like 'GHOST ERROR *'){throw $line}
    }
}
function Select-Panel($serial) {
    $active=Read-Panel $serial
    if(!$active){throw 'This firmware did not report a display profile. Use option 1 with the updated kit first.'}
    $names=@('ST7789','ILI9341','ST7789-inverted','ILI9341-inverted')
    while($true){
        Write-Host "Current display profile: $active. Look for readable text on a dark background."
        Write-Host '1. ST7789 (dual-USB default)   2. ILI9341'
        Write-Host '3. ST7789 inverted            4. ILI9341 inverted'
        $choice=Read-Host 'Press Enter to keep this display, or choose a profile to try'
        if(!$choice){return}
        if($choice -notmatch '^[1-4]$'){continue}
        $requested=$names[[int]$choice-1]
        $serial.WriteLine("PANEL $requested")
        Start-Sleep -Milliseconds 1000
        $until=[datetime]::UtcNow.AddSeconds(10)
        do{$active=Read-Panel $serial}while($active -ne $requested -and [datetime]::UtcNow -lt $until)
        if($active -ne $requested){throw 'The board did not confirm the selected profile. Tap RESET and retry option 3.'}
    }
}
function Pair-Board([string]$portName,[switch]$CheckDisplay,[switch]$DisplayOnly) {
    $serial=New-Object IO.Ports.SerialPort($portName,115200,'None',8,'One')
    $serial.DtrEnable=$false;$serial.RtsEnable=$false;$serial.ReadTimeout=250;$serial.WriteTimeout=3000
    $serial.Encoding=New-Object Text.UTF8Encoding($false)
    try{
        $serial.Open()
        $until=[datetime]::UtcNow.AddSeconds(12)
        do{$board=Get-Board $serial}while(!$board -and [datetime]::UtcNow -lt $until)
        if(!$board){throw 'Ghost Desk firmware did not answer on this port. Check the port, tap RESET, or run Flash and pair.'}
        if($CheckDisplay -or $DisplayOnly){Select-Panel $serial}
        if($DisplayOnly){return}
        $ssidDefault=''
        $ssidLine=netsh wlan show interfaces 2>$null | Select-String '^\s*SSID\s*:\s*(.+?)\s*$' | Select-Object -First 1
        if($ssidLine){$ssidDefault=$ssidLine.Matches[0].Groups[1].Value}
        $prompt=if($ssidDefault){"2.4 GHz Wi-Fi name [Enter for $ssidDefault]"}else{'2.4 GHz Wi-Fi name'}
        $ssid=Read-Host $prompt;if(!$ssid){$ssid=$ssidDefault}
        if(!$ssid -or [Text.Encoding]::UTF8.GetByteCount($ssid) -gt 32){throw 'Enter a Wi-Fi name of 1 to 32 bytes.'}
        $secret=Read-Host 'Wi-Fi password (hidden; Enter for an open network)' -AsSecureString
        $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        $key=New-Hex 32;$pairId=New-Hex 8
        try{
            $pass=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
            $size=[Text.Encoding]::UTF8.GetByteCount($pass)
            if($size -gt 64 -or ($size -gt 0 -and $size -lt 8) -or ($size -eq 64 -and $pass -notmatch '^[0-9a-fA-F]{64}$')){throw 'Expected a personal Wi-Fi password of 8 to 63 bytes, 64 hex digits, or blank.'}
            $packet=@{ssid=$ssid;password=$pass;key=$key;pairId=$pairId}|ConvertTo-Json -Compress
            $serial.WriteLine('PAIR '+$packet)
        }finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr);$pass=$null;$packet=$null;$secret.Dispose()}
        Write-Host 'Waiting for the board to restart and join Wi-Fi...'
        Start-Sleep -Seconds 2;$until=[datetime]::UtcNow.AddSeconds(60)
        do{$board=Get-Board $serial;if($board -and $board.pairId -eq $pairId -and $board.ip -ne '0.0.0.0'){break};Start-Sleep -Milliseconds 250}while([datetime]::UtcNow -lt $until)
        if(!$board -or $board.pairId -ne $pairId -or $board.ip -eq '0.0.0.0'){throw 'Wi-Fi join was not confirmed. Check the SSID and password, then use Pair only.'}
        Save-Link $board $key
        Write-Host "USB pairing complete. Board address: $($board.ip)"
    }finally{$serial.Dispose()}
}
Write-Host 'Ghost Desk | 2.8-inch ESP32-2432S028 CYD, dual USB, ST7789 / ILI9341'
Write-Host '1. Back up, flash and pair (first setup)'
Write-Host '2. Pair only (already flashed or changing Wi-Fi)'
Write-Host '3. Adjust display only (USB; keeps Wi-Fi pairing)'
$mode=Read-Host 'Choose 1, 2 or 3'
if($mode -notin '1','2','3'){throw 'Setup canceled.'}
$ports=@([IO.Ports.SerialPort]::GetPortNames()|Sort-Object)
if(!$ports.Count){throw 'No serial ports found. Plug in the board using a USB data cable.'}
Write-Host ('Available ports: '+($ports -join ', '))
Get-CimInstance Win32_PnPEntity -Filter "PNPClass='Ports'" -ErrorAction SilentlyContinue | ForEach-Object {Write-Host $_.Name}
$portName=(Read-Host 'Port that appeared when you plugged in the board (for example COM5)').Trim().ToUpperInvariant()
if($portName -notin $ports){throw 'Select a port in the list.'}
if($mode -eq '1'){Flash-Board $portName}
Pair-Board $portName -CheckDisplay:($mode -eq '1') -DisplayOnly:($mode -eq '3')
if($mode -eq '3'){return}
try{$app=Invoke-RestMethod "$base/v1/board" -TimeoutSec 2}catch{$app=$null}
if(!$app){
    try{$old=Invoke-RestMethod "$base/v1/sessions" -TimeoutSec 2}catch{$old=$null}
    if($old){Write-Host 'Quit your older Ghost Desk from its tray menu. Open the Ghost Desk.exe included in this kit.';return}
    $exe=Join-Path $PSScriptRoot 'Ghost Desk/Ghost Desk.exe'
    if(Test-Path -LiteralPath $exe){Start-Process -FilePath $exe}else{Write-Host 'Open the board-compatible Ghost Desk.exe on this PC.';return}
}
$until=[datetime]::UtcNow.AddSeconds(24)
do{
    try{if((Invoke-RestMethod "$base/v1/board" -TimeoutSec 2).connected){Write-Host 'Live display connected. USB can now be unplugged if the board has power.';return}}catch{}
    Start-Sleep -Seconds 1
}while([datetime]::UtcNow -lt $until)
Write-Host 'Pairing is saved. Waiting for the desktop link. See the network checks in START HERE.md.'
