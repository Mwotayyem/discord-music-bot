$ErrorActionPreference = 'SilentlyContinue'

$taskName = 'MohTayyemDiscordMusicBot'
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'MohTayyemDiscordMusicBot.lnk'

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false

if (Test-Path -LiteralPath $shortcutPath) {
    Remove-Item -LiteralPath $shortcutPath -Force
}

Write-Host 'Auto start removed.'
