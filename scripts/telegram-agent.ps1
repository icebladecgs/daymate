param(
    [Parameter(Position = 0)]
    [ValidateSet('start', 'stop', 'restart', 'status')]
    [string]$Action = 'status'
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
$pythonExe = Join-Path $rootDir '.venv\Scripts\python.exe'
$agentFile = Join-Path $rootDir 'telegram_agent.py'
$logDir = Join-Path $rootDir 'logs'
$stdoutLogFile = Join-Path $logDir 'telegram-agent.stdout.log'
$stderrLogFile = Join-Path $logDir 'telegram-agent.stderr.log'

function Get-AgentProcesses {
    Get-CimInstance Win32_Process |
        Where-Object {
            $_.Name -eq 'python.exe' -and
            $_.CommandLine -and
            $_.CommandLine.Contains('telegram_agent.py') -and
            $_.CommandLine.Contains($rootDir)
        }
}

function Show-AgentStatus {
    $procs = @(Get-AgentProcesses)
    if ($procs.Count -eq 0) {
        Write-Output 'Telegram agent is stopped.'
        return
    }

    Write-Output "Telegram agent is running ($($procs.Count) process(es))."
    $procs | Select-Object ProcessId, Name, CommandLine | Format-Table -AutoSize | Out-String | Write-Output
}

function Stop-Agent {
    $procs = @(Get-AgentProcesses)
    if ($procs.Count -eq 0) {
        Write-Output 'Telegram agent is already stopped.'
        return
    }

    $procs | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Output "Stopped $($procs.Count) Telegram agent process(es)."
}

function Start-Agent {
    if (-not (Test-Path $pythonExe)) {
        throw "Python executable not found: $pythonExe"
    }
    if (-not (Test-Path $agentFile)) {
        throw "telegram_agent.py not found: $agentFile"
    }
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir | Out-Null
    }

    $procs = @(Get-AgentProcesses)
    if ($procs.Count -gt 0) {
        Write-Output 'Telegram agent is already running.'
        Show-AgentStatus
        return
    }

    Start-Process -FilePath $pythonExe -ArgumentList 'telegram_agent.py' -WorkingDirectory $rootDir -WindowStyle Minimized -RedirectStandardOutput $stdoutLogFile -RedirectStandardError $stderrLogFile | Out-Null
    Start-Sleep -Seconds 2

    $started = @(Get-AgentProcesses | Sort-Object ProcessId)
    if ($started.Count -gt 1) {
        $started | Select-Object -SkipLast 1 | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
        Start-Sleep -Seconds 1
    }

    $started = @(Get-AgentProcesses | Sort-Object ProcessId)
    if ($started.Count -eq 0) {
        Write-Output 'Telegram agent failed to stay running. Recent log:'
        if (Test-Path $stderrLogFile) {
            Get-Content $stderrLogFile -Tail 20 | Out-String | Write-Output
        }
        elseif (Test-Path $stdoutLogFile) {
            Get-Content $stdoutLogFile -Tail 20 | Out-String | Write-Output
        }
        return
    }

    Show-AgentStatus
}

switch ($Action) {
    'status' { Show-AgentStatus }
    'stop' { Stop-Agent }
    'start' { Start-Agent }
    'restart' {
        Stop-Agent
        Start-Agent
    }
}