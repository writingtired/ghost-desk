param([Parameter(Mandatory=$true)][string]$Zip)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$temp=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$root=Join-Path $temp ('ghostdesk-first-run-'+[guid]::NewGuid().ToString('N'))
$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0)
$listener.Start();$port=$listener.LocalEndpoint.Port;$listener.Stop()
$base="http://127.0.0.1:$port"
$p=$null
try{
    [IO.Compression.ZipFile]::ExtractToDirectory((Resolve-Path -LiteralPath $Zip).Path,$root)
    $app=Join-Path $root 'Ghost Desk'
    $info=[Diagnostics.ProcessStartInfo]::new((Join-Path $app 'Ghost Desk.exe'))
    $info.UseShellExecute=$false;$info.WorkingDirectory=$app
    $info.EnvironmentVariables['GHOST_DESK_PORT']=[string]$port
    $info.EnvironmentVariables['GHOST_DESK_DATA']=Join-Path $root 'data'
    $info.EnvironmentVariables['CODEX_HOME']=Join-Path $root 'codex'
    $info.EnvironmentVariables['USERPROFILE']=Join-Path $root 'profile'
    $info.EnvironmentVariables['LOCALAPPDATA']=Join-Path $root 'local'
    $info.EnvironmentVariables['APPDATA']=Join-Path $root 'roaming'
    $info.EnvironmentVariables['PATH']="$env:WINDIR\System32;$env:WINDIR"
    $p=[Diagnostics.Process]::Start($info)
    $until=[datetime]::UtcNow.AddSeconds(25)
    do{try{$d=Invoke-RestMethod "$base/v1/diagnostics" -TimeoutSec 2;if($d.desktop){break}}catch{};Start-Sleep -Milliseconds 200}while(!$p.HasExited -and [datetime]::UtcNow -lt $until)
    if($d.desktop -ne '0.1.0' -or $d.connected){throw 'First-run status unavailable or unexpected'}
    $fields=@($d.psobject.Properties.Name|Sort-Object)
    if(($fields -join ',') -ne 'antigravity,browser,claude,codex,connected,desktop,firmware,lastSeen'){throw 'Unexpected diagnostics fields'}
    $second=[Diagnostics.Process]::Start($info)
    if(!$second.WaitForExit(6000)){throw 'A second launch did not hand off'}
    $asset=Invoke-WebRequest "$base/ghost-mark.png" -UseBasicParsing
    if($asset.StatusCode -ne 200){throw 'Portable web assets missing'}
    'Passed extracted v0.1.0 startup, status allowlist, empty profiles, bundled runtime and duplicate launch.'
}finally{
    if($p -and !$p.HasExited){[void]$p.CloseMainWindow();if(!$p.WaitForExit(4000)){$p.Kill();[void]$p.WaitForExit(4000)}}
    $target=[IO.Path]::GetFullPath($root)
    if([IO.Path]::GetDirectoryName($target) -eq $temp -and [IO.Path]::GetFileName($target) -match '^ghostdesk-first-run-[a-f0-9]{32}$' -and (Test-Path -LiteralPath $target)){
        for($i=0;$i -lt 5;$i++){try{Remove-Item -LiteralPath $target -Recurse -Force;break}catch{if($i -eq 4){throw};Start-Sleep -Milliseconds 400}}
    }
}
