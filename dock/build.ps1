param([string]$OutputFile=(Join-Path (Split-Path -Parent $PSScriptRoot) 'Ghost Desk.exe'))
$ErrorActionPreference='Stop'
$framework=Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319'
$references=@('System.dll','System.Core.dll','System.Xaml.dll','System.Windows.Forms.dll','System.Drawing.dll','System.Net.Http.dll','System.Web.Extensions.dll',
              'WPF/WindowsBase.dll','WPF/PresentationCore.dll','WPF/PresentationFramework.dll','WPF/UIAutomationTypes.dll','WPF/UIAutomationProvider.dll')
$compilerArgs=@('/nologo','/target:winexe','/optimize+','/utf8output',('/win32manifest:'+(Join-Path $PSScriptRoot 'GhostDock.manifest')),('/win32icon:'+(Join-Path $PSScriptRoot 'ghost.ico')),('/out:'+$OutputFile),('/resource:'+(Join-Path (Split-Path -Parent $PSScriptRoot) 'sprites.json')+',GhostSprites'))
foreach($reference in $references){$compilerArgs+='/reference:'+(Join-Path $framework $reference)}
& (Join-Path $framework 'csc.exe') @compilerArgs (Join-Path $PSScriptRoot 'GhostDock.cs') (Join-Path $PSScriptRoot 'AppHost.cs') (Join-Path $PSScriptRoot 'DockPlacement.cs') (Join-Path $PSScriptRoot 'ActivityControls.cs')
if($LASTEXITCODE){throw 'Ghost Desk dock build failed'}
