#requires -Version 5.1
<#
.SYNOPSIS
  把本 repo 的 Claude Code / Codex / VS Code 設定部署到目前這臺機器。
.DESCRIPTION
  將 agent 規範、繁中 Stop hook、編輯器設定還原到正確路徑，並探測本機硬體
  生成 ~/.claude/profile.md。被覆蓋的既有檔會先備份成 .bak.<時間戳>。
.PARAMETER SkipExtensions
  不安裝 vscode/extensions.txt 列出的 VS Code 擴充套件。
.PARAMETER ForceCodex
  覆蓋既有的 ~/.codex/config.toml（預設不覆蓋，避免蓋掉機器特定的 node_repl）。
.PARAMETER BackupRetention
  每個被部署目標保留的備份數量；設為 0 可停用舊備份清理。
.EXAMPLE
  pwsh -File deploy.ps1
.EXAMPLE
  pwsh -File deploy.ps1 -SkipExtensions
#>
[CmdletBinding()]
param(
  [switch]$SkipExtensions,
  [switch]$ForceCodex,
  [int]$BackupRetention = 5
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$enc = New-Object System.Text.UTF8Encoding $false

$IsWindowsHost = if(Get-Variable IsWindows -ErrorAction SilentlyContinue){ $IsWindows } else { $true }
$IsMacOSHost = if(Get-Variable IsMacOS -ErrorAction SilentlyContinue){ $IsMacOS } else { $false }
$IsLinuxHost = if(Get-Variable IsLinux -ErrorAction SilentlyContinue){ $IsLinux } else { $false }

function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Ok($m){ Write-Host "  [OK] $m" -ForegroundColor Green }
function Skip($m){ Write-Host "  [跳過] $m" -ForegroundColor Yellow }
function Ensure-Dir($p){ if(-not(Test-Path $p)){ New-Item -ItemType Directory -Force -Path $p | Out-Null } }
function Join-Parts {
  param(
    [Parameter(Mandatory=$true)][string]$Base,
    [Parameter(ValueFromRemainingArguments=$true)][string[]]$Parts
  )
  $path = $Base
  foreach($part in $Parts){ $path = Join-Path $path $part }
  return $path
}
function Get-HomeDir {
  if($env:USERPROFILE){ return $env:USERPROFILE }
  if($HOME){ return $HOME }
  return [Environment]::GetFolderPath('UserProfile')
}
function Get-VSCodeUserDir {
  if($IsWindowsHost -and $env:APPDATA){ return (Join-Parts $env:APPDATA 'Code' 'User') }
  if($IsMacOSHost){ return (Join-Parts (Get-HomeDir) 'Library' 'Application Support' 'Code' 'User') }
  return (Join-Parts (Get-HomeDir) '.config' 'Code' 'User')
}
function Get-CommandPathOrFallback($names, $fallback){
  foreach($name in $names){
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){ return $cmd.Source }
  }
  return $fallback
}
function Escape-JsonStringValue($value){
  $json = ConvertTo-Json $value -Compress
  return $json.Substring(1, $json.Length - 2)
}
function Get-ClaudeStopHookCommand($homeDir){
  $hookPath = (Join-Parts $homeDir '.claude' 'hooks' 'check-traditional.ps1') -replace '\\','/'
  if($IsWindowsHost){
    return "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$hookPath`""
  }
  $pwsh = Get-CommandPathOrFallback @('pwsh') 'pwsh'
  return "$pwsh -NoProfile -File `"$hookPath`""
}
function Get-NpxCommand {
  if($IsWindowsHost){
    return Get-CommandPathOrFallback @('npx.cmd','npx') 'npx.cmd'
  }
  return Get-CommandPathOrFallback @('npx') 'npx'
}
function Get-CodexTerminalShell {
  if($IsWindowsHost){ return 'powershell' }
  if($IsMacOSHost){ return 'zsh' }
  return 'bash'
}
function Resolve-CodexConfigTemplate($templatePath){
  $text = Get-Content $templatePath -Raw
  $text = $text.Replace('__NPX_COMMAND__', (Get-NpxCommand))
  $text = $text.Replace('__CODEX_TERMINAL_SHELL__', (Get-CodexTerminalShell))
  if($IsWindowsHost){
    $systemRoot = if($env:SystemRoot){ $env:SystemRoot } else { 'C:\Windows' }
    $text = $text.Replace('__SYSTEM_ROOT__', $systemRoot)
  } else {
    $text = [regex]::Replace($text, "(?m)^SystemRoot\s*=\s*'__SYSTEM_ROOT__'\r?\n?", '')
    $text = [regex]::Replace($text, "(?m)^runCodexInWindowsSubsystemForLinux\s*=\s*false\r?\n?", '')
  }
  return $text
}
function Backup-IfExists($p, $backupRoot = $null){
  if(Test-Path $p){
    $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
    $item = Get-Item $p
    if($backupRoot){
      Ensure-Dir $backupRoot
      $backupPath = Join-Path $backupRoot "$($item.Name).bak.$ts"
    } else {
      $backupPath = "$p.bak.$ts"
    }
    if($item.PSIsContainer){
      Copy-Item $p $backupPath -Recurse -Force
    } else {
      Copy-Item $p $backupPath -Force
    }
    Ok "已備份 $(Split-Path $p -Leaf) -> $backupPath"
    Prune-Backups $p $backupRoot
  }
}

function Test-IsPathInside($childPath, $parentPath){
  $parentFull = [System.IO.Path]::GetFullPath($parentPath) -replace '[\\/]+$',''
  $childFull = [System.IO.Path]::GetFullPath($childPath)
  $comparison = if($IsWindowsHost){ [System.StringComparison]::OrdinalIgnoreCase } else { [System.StringComparison]::Ordinal }
  return $childFull.StartsWith(($parentFull + [System.IO.Path]::DirectorySeparatorChar), $comparison)
}

function Prune-Backups($p, $backupRoot = $null){
  if($BackupRetention -lt 1){ return }

  $backupDir = if($backupRoot){ $backupRoot } else { Split-Path $p -Parent }
  if(-not(Test-Path $backupDir)){ return }

  $itemName = Split-Path $p -Leaf
  $escapedName = [regex]::Escape($itemName)
  $backupNamePattern = "^$escapedName\.bak\.\d{8}_\d{6}(\.moved\.\d{8}_\d{6})?$"
  $backupDirFull = (Resolve-Path -LiteralPath $backupDir).ProviderPath

  $oldBackups = Get-ChildItem -LiteralPath $backupDir -Force |
    Where-Object { $_.Name -match $backupNamePattern } |
    Sort-Object Name -Descending |
    Select-Object -Skip $BackupRetention

  foreach($backup in $oldBackups){
    $backupFull = (Resolve-Path -LiteralPath $backup.FullName).ProviderPath
    if(-not(Test-IsPathInside $backupFull $backupDirFull)){
      throw "拒絕清理非預期備份路徑：$backupFull"
    }
    Remove-Item -LiteralPath $backup.FullName -Recurse -Force
    Skip "已清理舊備份 $backupFull"
  }
}

function Move-CodexSkillBackupsOutOfRegistry($skillsDir, $backupRoot){
  if(-not(Test-Path $skillsDir)){ return }
  Ensure-Dir $backupRoot
  Get-ChildItem $skillsDir -Directory | Where-Object { $_.Name -match '\.bak\.\d{8}_\d{6}$' } | ForEach-Object {
    $dest = Join-Path $backupRoot $_.Name
    if(Test-Path $dest){
      $ts = Get-Date -Format 'yyyyMMdd_HHmmss'
      $dest = Join-Path $backupRoot "$($_.Name).moved.$ts"
    }
    Move-Item -LiteralPath $_.FullName -Destination $dest
    Ok "已移出舊 skill 備份 $($_.Name) -> $dest"
  }
}

function Invoke-FirstLine($exe, $argList = @()){
  try {
    $out = & $exe @argList 2>&1 | Select-Object -First 1
    if($out){ return $out.ToString().Trim() }
  } catch {}
  return '(未安裝)'
}

function Build-WindowsProfile {
  $os  = Get-CimInstance Win32_OperatingSystem
  $cs  = Get-CimInstance Win32_ComputerSystem
  $cpu = @(Get-CimInstance Win32_Processor)[0].Name.Trim()
  $gpus = @(Get-CimInstance Win32_VideoController | Where-Object Name | Select-Object -ExpandProperty Name)
  $ramGB = [math]::Round($cs.TotalPhysicalMemory/1GB)
  $diskLines = (Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' | ForEach-Object {
    "- **{0}**：總 {1} GB / 可用 {2} GB" -f $_.DeviceID, [math]::Round($_.Size/1GB), [math]::Round($_.FreeSpace/1GB)
  }) -join "`n"
  function _v($exe, $arg){ try { (& $exe $arg 2>&1 | Select-Object -First 1).ToString().Trim() } catch { '(未安裝)' } }
  $git  = _v git '--version'
  $node = _v node '--version'
  $py   = _v python '--version'
  $psv  = $PSVersionTable.PSVersion.ToString()
  $date = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $gpuStr = ($gpus -join ' + ')
@"
# 環境 Profile（$($cs.Name)）

> 由 deploy.ps1 於 $date 自動探測產生。重跑 deploy.ps1 會覆蓋本檔；
> 需要常用指令模板（UWP 捷徑修復 / System Info / Software Management）時，
> 從 repo 的 claude/profile.example.md 複製進來。

## Hardware
- **型號**：$($cs.Manufacturer) $($cs.Model)
- **CPU**：$cpu
- **RAM**：$ramGB GB
- **GPU**：$gpuStr

## Disk
$diskLines

## OS & Shell
- **OS**：$($os.Caption)（$($os.Version)）$($os.OSArchitecture)
- **PowerShell（執行 deploy 的版本）**：$psv
- **WSL**：(deploy 未自動探測，請執行 `wsl -l -v` 補上)

## Dev Tools
- **Git**：$git
- **Node.js**：$node
- **Python**：$py
"@
}

function Build-PortableProfile {
  $homeDir = Get-HomeDir
  $hostName = [System.Net.Dns]::GetHostName()
  $date = Get-Date -Format 'yyyy-MM-dd HH:mm'
  $psv = $PSVersionTable.PSVersion.ToString()
  $git = Invoke-FirstLine git @('--version')
  $node = Invoke-FirstLine node @('--version')
  $py = Invoke-FirstLine python @('--version')
  if($py -eq '(未安裝)'){ $py = Invoke-FirstLine python3 @('--version') }

  if($IsMacOSHost){
    $os = (Invoke-FirstLine sw_vers @('-productName')) + ' ' + (Invoke-FirstLine sw_vers @('-productVersion'))
    $model = Invoke-FirstLine sysctl @('-n','hw.model')
    $cpu = Invoke-FirstLine sysctl @('-n','machdep.cpu.brand_string')
    $memRaw = Invoke-FirstLine sysctl @('-n','hw.memsize')
    $ramGB = if($memRaw -match '^\d+$'){ [math]::Round([double]$memRaw/1GB) } else { '(未探測)' }
    $diskLines = Invoke-FirstLine df @('-h', $homeDir)
  } elseif($IsLinuxHost){
    $os = Invoke-FirstLine uname @('-a')
    $model = Invoke-FirstLine hostnamectl @('chassis')
    $cpu = if(Test-Path '/proc/cpuinfo'){ (Select-String -Path '/proc/cpuinfo' -Pattern 'model name' | Select-Object -First 1).ToString().Split(':',2)[1].Trim() } else { '(未探測)' }
    $ramGB = if(Test-Path '/proc/meminfo'){ [math]::Round(([double]((Select-String -Path '/proc/meminfo' -Pattern '^MemTotal:' | Select-Object -First 1).ToString() -replace '\D+',''))/1MB) } else { '(未探測)' }
    $diskLines = Invoke-FirstLine df @('-h', $homeDir)
  } else {
    $os = "$($PSVersionTable.Platform) $($PSVersionTable.OS)"
    $model = '(未探測)'
    $cpu = '(未探測)'
    $ramGB = '(未探測)'
    $diskLines = Invoke-FirstLine df @('-h', $homeDir)
  }

@"
# 環境 Profile（$hostName）

> 由 deploy.ps1 於 $date 自動探測產生。重跑 deploy.ps1 會覆蓋本檔；
> 需要常用指令模板時，從 repo 的 claude/profile.example.md 複製進來。

## Hardware
- **型號**：$model
- **CPU**：$cpu
- **RAM**：$ramGB GB
- **GPU**：(非 Windows deploy 未自動探測)

## Disk
```text
$diskLines
```

## OS & Shell
- **OS**：$os
- **PowerShell（執行 deploy 的版本）**：$psv

## Dev Tools
- **Git**：$git
- **Node.js**：$node
- **Python**：$py
"@
}

function Build-Profile {
  if($IsWindowsHost){ return Build-WindowsProfile }
  return Build-PortableProfile
}

$U = Get-HomeDir

Info "部署來源: $src"
Info "目標使用者: $U"
Write-Host ''

# ---------------------------------------------------------------------------
Info '[1/4] Claude Code'
$claudeDir = Join-Path $U '.claude'
Ensure-Dir $claudeDir
Ensure-Dir (Join-Path $claudeDir 'hooks')

Backup-IfExists (Join-Path $claudeDir 'CLAUDE.md')
Copy-Item (Join-Parts $src 'claude' 'CLAUDE.md') (Join-Path $claudeDir 'CLAUDE.md') -Force
Ok 'CLAUDE.md -> ~/.claude/CLAUDE.md'

$st = Get-Content (Join-Parts $src 'claude' 'settings.json') -Raw
$st = $st.Replace('__USERPROFILE__', ($U -replace '\\','/'))
$st = $st.Replace('__CLAUDE_STOP_HOOK_COMMAND__', (Escape-JsonStringValue (Get-ClaudeStopHookCommand $U)))
Backup-IfExists (Join-Path $claudeDir 'settings.json')
[System.IO.File]::WriteAllText((Join-Path $claudeDir 'settings.json'), $st, $enc)
Ok 'settings.json -> ~/.claude/settings.json（已套用本機 hook command）'

$claudeHooksSrc = Join-Parts $src 'claude' 'hooks'
Copy-Item (Join-Path $claudeHooksSrc '*') (Join-Path $claudeDir 'hooks') -Recurse -Force
Ok 'hooks/* -> ~/.claude/hooks/'

$profileMd = Build-Profile
[System.IO.File]::WriteAllText((Join-Path $claudeDir 'profile.md'), $profileMd, $enc)
Ok 'profile.md -> ~/.claude/profile.md（已探測本機硬體）'
Write-Host ''

# ---------------------------------------------------------------------------
Info '[2/4] Codex'
$codexDir = Join-Path $U '.codex'
Ensure-Dir $codexDir

$codexAgents = Join-Path $codexDir 'AGENTS.md'
Backup-IfExists $codexAgents
Copy-Item (Join-Parts $src 'codex' 'AGENTS.md') $codexAgents -Force
Ok 'AGENTS.md -> ~/.codex/AGENTS.md'

$codexCompactPromptsSrc = Join-Parts $src 'codex' 'compact-prompts'
if(Test-Path $codexCompactPromptsSrc){
  $codexCompactPromptsDir = Join-Path $codexDir 'compact-prompts'
  Ensure-Dir $codexCompactPromptsDir
  Copy-Item (Join-Path $codexCompactPromptsSrc '*') $codexCompactPromptsDir -Recurse -Force
  Ok 'compact-prompts/* -> ~/.codex/compact-prompts/'
}

$codexProfilesSrc = Join-Parts $src 'codex' 'profiles'
if(Test-Path $codexProfilesSrc){
  Get-ChildItem $codexProfilesSrc -Filter '*.config.toml' -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $codexDir $_.Name) -Force
    Ok "profiles/$($_.Name) -> ~/.codex/$($_.Name)"
  }
}

$codexSkillsSrc = Join-Parts $src 'codex' 'skills'
if(Test-Path $codexSkillsSrc){
  $codexSkillsDir = Join-Path $codexDir 'skills'
  $codexSkillBackupDir = Join-Parts $codexDir 'backups' 'skills'
  Ensure-Dir $codexSkillsDir
  Move-CodexSkillBackupsOutOfRegistry $codexSkillsDir $codexSkillBackupDir
  Get-ChildItem $codexSkillsSrc -Directory | ForEach-Object {
    $target = Join-Path $codexSkillsDir $_.Name
    Backup-IfExists $target $codexSkillBackupDir
    Ensure-Dir $target
    Copy-Item (Join-Path $_.FullName '*') $target -Recurse -Force
    Ok "skills/$($_.Name) -> ~/.codex/skills/$($_.Name)"
  }
}

$codexCustomAgentsSrc = Join-Parts $src 'codex' 'agents'
if(Test-Path $codexCustomAgentsSrc){
  $codexCustomAgentsDir = Join-Path $codexDir 'agents'
  Ensure-Dir $codexCustomAgentsDir
  Get-ChildItem $codexCustomAgentsSrc -Filter '*.toml' -File | ForEach-Object {
    $target = Join-Path $codexCustomAgentsDir $_.Name
    Backup-IfExists $target
    Copy-Item $_.FullName $target -Force
    Ok "agents/$($_.Name) -> ~/.codex/agents/$($_.Name)"
  }
}

$codexHooksScriptsSrc = Join-Parts $src 'codex' 'hooks'
if(Test-Path $codexHooksScriptsSrc){
  $codexHooksScriptsDir = Join-Path $codexDir 'hooks'
  Ensure-Dir $codexHooksScriptsDir
  Get-ChildItem $codexHooksScriptsSrc -File | ForEach-Object {
    $target = Join-Path $codexHooksScriptsDir $_.Name
    Backup-IfExists $target
    Copy-Item $_.FullName $target -Force
    Ok "hooks/$($_.Name) -> ~/.codex/hooks/$($_.Name)"
  }
}

$codexHooksTemplate = Join-Parts $src 'codex' 'hooks.json'
if(Test-Path $codexHooksTemplate){
  $codexHooksTarget = Join-Path $codexDir 'hooks.json'
  $codexHomeForHooks = $codexDir -replace '\\','/'
  $codexHooksText = (Get-Content $codexHooksTemplate -Raw).Replace('__CODEX_HOME__', $codexHomeForHooks)
  Backup-IfExists $codexHooksTarget
  [System.IO.File]::WriteAllText($codexHooksTarget, $codexHooksText, $enc)
  Ok 'hooks.json -> ~/.codex/hooks.json（已套用本機 Codex home）'
}

$codexCfg = Join-Path $codexDir 'config.toml'
if((Test-Path $codexCfg) -and -not $ForceCodex){
  Skip 'config.toml 已存在，保留現有（含機器特定 node_repl）。要覆蓋請加 -ForceCodex'
} else {
  Backup-IfExists $codexCfg
  $codexConfigText = Resolve-CodexConfigTemplate (Join-Parts $src 'codex' 'config.toml')
  [System.IO.File]::WriteAllText($codexCfg, $codexConfigText, $enc)
  Ok 'config.toml -> ~/.codex/config.toml（已套用本機 MCP command）'
}
Write-Host ''

# ---------------------------------------------------------------------------
Info '[3/4] VS Code 設定'
$code = Get-Command code -ErrorAction SilentlyContinue
$vsUser = Get-VSCodeUserDir
if(Test-Path $vsUser){
  Backup-IfExists (Join-Path $vsUser 'settings.json')
  Copy-Item (Join-Parts $src 'vscode' 'settings.json') (Join-Path $vsUser 'settings.json') -Force
  Ok "settings.json -> $vsUser"
  Backup-IfExists (Join-Path $vsUser 'keybindings.json')
  Copy-Item (Join-Parts $src 'vscode' 'keybindings.json') (Join-Path $vsUser 'keybindings.json') -Force
  Ok "keybindings.json -> $vsUser"
} else {
  Skip "找不到 $vsUser（VS Code 可能未安裝），略過設定"
}
Write-Host ''

# ---------------------------------------------------------------------------
Info '[4/4] VS Code 擴充套件'
if($SkipExtensions){
  Skip '已指定 -SkipExtensions'
} elseif(-not $code){
  Skip '找不到 code 指令，略過擴充安裝'
} else {
  $exts = @(Get-Content (Join-Parts $src 'vscode' 'extensions.txt') | Where-Object { $_.Trim() })
  $n=0; $okc=0; $fail=0; $failed=@()
  foreach($e in $exts){
    $n++
    Write-Host ("  [{0}/{1}] {2}" -f $n, $exts.Count, $e)
    & code --install-extension $e *> $null
    if($LASTEXITCODE -eq 0){ $okc++ } else { $fail++; $failed += $e }
  }
  Ok "擴充安裝：成功 $okc / 失敗 $fail（共 $($exts.Count)）"
  if($fail -gt 0){ Skip ('失敗清單: ' + ($failed -join ', ')) }
}
Write-Host ''

Info '部署完成。'
Write-Host '  1. 完全重啟 Claude Code 與 VS Code 以套用設定' -ForegroundColor White
Write-Host '  2. 首次啟動 Claude Code 會跳出 profile.md 的 import 批准對話，按核准' -ForegroundColor White
