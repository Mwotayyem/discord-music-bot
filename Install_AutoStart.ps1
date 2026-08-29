$ErrorActionPreference = 'Stop'

$taskName = 'MohTayyemDiscordMusicBot'
$scriptPath = Join-Path $PSScriptRoot 'Start_Bot_Silent.vbs'
$shortcutName = 'MohTayyemDiscordMusicBot.lnk'

if (-not (Test-Path -LiteralPath $scriptPath)) {
    throw "Start_Bot_Silent.vbs was not found."
}

function Install-StartupShortcut {
    $startupFolder = [Environment]::GetFolderPath('Startup')
    $shortcutPath = Join-Path $startupFolder $shortcutName
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($shortcutPath)

    $shortcut.TargetPath = 'wscript.exe'
    $shortcut.Arguments = ('"{0}"' -f $scriptPath)
    $shortcut.WorkingDirectory = $PSScriptRoot
    $shortcut.WindowStyle = 7
    $shortcut.Description = 'Auto start Moh Tayyem Discord Music Bot'
    $shortcut.Save()

    Write-Host "Startup shortcut installed: $shortcutPath"
}

$action = New-ScheduledTaskAction `
    -Execute 'wscript.exe' `
    -Argument ('"{0}"' -f $scriptPath)

$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)

try {
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description 'Auto start Moh Tayyem Discord Music Bot when Windows user logs in.' `
        -Force | Out-Null

    Write-Host "Scheduled task installed: $taskName"
} catch {
    Write-Warning "Scheduled Task failed. Falling back to Startup folder shortcut."
    Install-StartupShortcut
}
