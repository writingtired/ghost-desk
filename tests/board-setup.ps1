$ErrorActionPreference='Stop'
$script=Join-Path $PSScriptRoot '../hardware/windows/setup-board.ps1'
$errors=$null;$tokens=$null
$ast=[Management.Automation.Language.Parser]::ParseFile((Resolve-Path $script),[ref]$tokens,[ref]$errors)
if($errors.Count){throw 'Setup script did not parse.'}
# Load only the functions. The interactive entry point is never called here.
foreach($fn in $ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst]},$false)){
    . ([scriptblock]::Create($fn.Extent.Text))
}
$dir=Join-Path ([IO.Path]::GetTempPath()) ('ghostdesk-pair-test-'+[guid]::NewGuid().ToString('N'))
try {
    $serial=[pscustomobject]@{sent=''}
    $serial|Add-Member ScriptMethod WriteLine {param($line)$this.sent=$line}
    $serial|Add-Member ScriptMethod ReadLine {return 'GHOST1 ghostdesk-ffeeddccbbaa 192.0.2.1 1234567812345678'}
    $result=Get-Board $serial
    if($serial.sent -ne 'GHOST?' -or $result.ip -ne '192.0.2.1'){throw 'USB discovery failed'}
    1..2|ForEach-Object{
        $key=New-Hex 32
        if($key -notmatch '^[a-f0-9]{64}$'){throw 'Unexpected key shape'}
        Save-Link $result $key
        $file=Join-Path $dir 'board-v1.json'
        $saved=Get-Content $file -Raw|ConvertFrom-Json
        if($saved.key -ne $key -or $saved.name -ne $result.name){throw 'Pairing or re-pairing did not persist'}
        if(!(Get-Acl $file).AreAccessRulesProtected){throw 'Pairing permissions are inherited'}
    }
    'Passed USB probe parsing, per-user key storage and atomic re-pairing.'
}finally{
    $file=Join-Path $dir 'board-v1.json'
    if([IO.File]::Exists($file)){[IO.File]::Delete($file)}
    if([IO.Directory]::Exists($dir)){[IO.Directory]::Delete($dir)}
}
