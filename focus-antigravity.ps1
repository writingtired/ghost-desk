# Open the local Windows app and use its Conversations picker. Only the
# validated search field receives text. Invoke a result through Accessibility.
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes,System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class GhostDeskWindow {
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
}
'@
$title=$env:GHOST_DESK_CHAT_TITLE
$exe=Join-Path $env:USERPROFILE 'AppData\Local\Programs\antigravity\Antigravity.exe'
$element=[System.Windows.Automation.AutomationElement]
$types=[System.Windows.Automation.ControlType]
$tree=[System.Windows.Automation.TreeScope]::Descendants
$walker=[System.Windows.Automation.TreeWalker]::ControlViewWalker
function Find-SearchBox($window) {
    $combos=New-Object System.Windows.Automation.PropertyCondition($element::ControlTypeProperty,$types::ComboBox)
    foreach($box in $window.FindAll($tree,$combos)) {
        if (!$box.Current.IsOffscreen -and $box.Current.Name -match '^Search (for )?conversations\b') {return $box}
    }
}
function Find-Picker($box) {
    $node=$walker.GetParent($box)
    while ($null -ne $node -and $node.Current.ControlType -ne $types::Window) {$node=$walker.GetParent($node)}
    if ($null -ne $node -and $node.Current.NativeWindowHandle -eq 0) {return $node}
}
if (!(Test-Path -LiteralPath $exe)) {throw 'Antigravity executable unavailable'}
Start-Process -FilePath $exe
$limit=[datetime]::UtcNow.AddSeconds(6)
do {
    $main=Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Where-Object {$_.Path -eq $exe -and $_.MainWindowHandle -ne 0} | Select-Object -First 1
    if ($main) {break}
    Start-Sleep -Milliseconds 160
} while ([datetime]::UtcNow -lt $limit)
if (!$main) {throw 'Antigravity window unavailable'}
$handle=$main.MainWindowHandle
$shell=New-Object -ComObject WScript.Shell
[void]$shell.AppActivate($main.Id)
$window=$element::FromHandle($handle)
$box=Find-SearchBox $window
if (!$box) {
    $byName=New-Object System.Windows.Automation.PropertyCondition($element::NameProperty,'Search Conversations')
    $search=$window.FindFirst($tree,$byName)
    $action=$null
    if ($search -and $search.Current.ControlType -eq $types::Button -and $search.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$action)) {
        $action.Invoke()
    } elseif ([GhostDeskWindow]::GetForegroundWindow() -eq $handle) {
        [System.Windows.Forms.SendKeys]::SendWait('^k')
    } else {Write-Output 'application';exit 0}
    $limit=[datetime]::UtcNow.AddSeconds(3)
    do {
        Start-Sleep -Milliseconds 120
        $box=Find-SearchBox $window
    } while (!$box -and [datetime]::UtcNow -lt $limit)
}
if (!$box) {Write-Output 'application'; exit 0}
if ($env:GHOST_DESK_TITLE_UNIQUE -ne 'yes' -or !$title) {Write-Output 'picker';exit 0}
$picker=Find-Picker $box
if (!$picker) {Write-Output 'picker';exit 0}
$field=$box.GetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern)
$field.SetValue($title)
$items=New-Object System.Windows.Automation.PropertyCondition($element::ControlTypeProperty,$types::ListItem)
$limit=[datetime]::UtcNow.AddSeconds(3)
do {
    Start-Sleep -Milliseconds 200
    if ($field.Current.Value -cne $title) {break}
    $matches=@($picker.FindAll($tree,$items) | Where-Object {
        !$_.Current.IsOffscreen -and ($_.Current.Name -ceq $title -or $_.Current.Name.StartsWith($title+' ',[StringComparison]::Ordinal))
    })
    if ($matches.Count -eq 1) {
        $action=$null
        if ($matches[0].TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern,[ref]$action)) {
            $action.Invoke()
            $until=[datetime]::UtcNow.AddSeconds(2)
            do {
                Start-Sleep -Milliseconds 120
                if (!(Find-SearchBox $window)) {Write-Output 'session';exit 0}
            } while([datetime]::UtcNow -lt $until)
            break
        }
    }
} while ([datetime]::UtcNow -lt $limit)
Write-Output 'picker'
