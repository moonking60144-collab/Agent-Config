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
.EXAMPLE
  pwsh -File deploy.ps1
.EXAMPLE
  pwsh -File deploy.ps1 -SkipExtensions
#>
[CmdletBinding()]
param(
  [switch]$SkipExtensions,
  [switch]$ForceCodex
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$U   = $env:USERPROFILE
$enc = New-Object System.Text.UTF8Encoding $false

function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Ok($m){ Write-Host "  [OK] $m" -ForegroundColor Green }
function Skip($m){ Write-Host "  [跳過] $m" -ForegroundColor Yellow }
function Ensure-Dir($p){ if(-not(Test-Path $p)){ New-Item -ItemType Directory -Force -Path $p | Out-Null } }
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

function Build-Profile {
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

Info "部署來源: $src"
Info "目標使用者: $U"
Write-Host ''

# ---------------------------------------------------------------------------
Info '[1/4] Claude Code'
$claudeDir = Join-Path $U '.claude'
Ensure-Dir $claudeDir
Ensure-Dir (Join-Path $claudeDir 'hooks')

Backup-IfExists (Join-Path $claudeDir 'CLAUDE.md')
Copy-Item (Join-Path $src 'claude\CLAUDE.md') (Join-Path $claudeDir 'CLAUDE.md') -Force
Ok 'CLAUDE.md -> ~/.claude/CLAUDE.md'

$st = Get-Content (Join-Path $src 'claude\settings.json') -Raw
$st = $st.Replace('__USERPROFILE__', ($U -replace '\\','/'))
Backup-IfExists (Join-Path $claudeDir 'settings.json')
[System.IO.File]::WriteAllText((Join-Path $claudeDir 'settings.json'), $st, $enc)
Ok 'settings.json -> ~/.claude/settings.json（已套用本機 hook 路徑）'

Copy-Item (Join-Path $src 'claude\hooks\*') (Join-Path $claudeDir 'hooks') -Recurse -Force
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
Copy-Item (Join-Path $src 'codex\AGENTS.md') $codexAgents -Force
Ok 'AGENTS.md -> ~/.codex/AGENTS.md'

$codexCatalogSrc = Join-Path $src 'codex\model-catalog.json'
if(Test-Path $codexCatalogSrc){
  Copy-Item $codexCatalogSrc (Join-Path $codexDir 'model-catalog.json') -Force
  Ok 'model-catalog.json -> ~/.codex/model-catalog.json'
}

$codexCompactPromptsSrc = Join-Path $src 'codex\compact-prompts'
if(Test-Path $codexCompactPromptsSrc){
  $codexCompactPromptsDir = Join-Path $codexDir 'compact-prompts'
  Ensure-Dir $codexCompactPromptsDir
  Copy-Item (Join-Path $codexCompactPromptsSrc '*') $codexCompactPromptsDir -Recurse -Force
  Ok 'compact-prompts/* -> ~/.codex/compact-prompts/'
}

$codexProfilesSrc = Join-Path $src 'codex\profiles'
if(Test-Path $codexProfilesSrc){
  Get-ChildItem $codexProfilesSrc -Filter '*.config.toml' -File | ForEach-Object {
    Copy-Item $_.FullName (Join-Path $codexDir $_.Name) -Force
    Ok "profiles/$($_.Name) -> ~/.codex/$($_.Name)"
  }
}

$codexSkillsSrc = Join-Path $src 'codex\skills'
if(Test-Path $codexSkillsSrc){
  $codexSkillsDir = Join-Path $codexDir 'skills'
  $codexSkillBackupDir = Join-Path $codexDir 'backups\skills'
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

$codexCfg = Join-Path $codexDir 'config.toml'
if((Test-Path $codexCfg) -and -not $ForceCodex){
  Skip 'config.toml 已存在，保留現有（含機器特定 node_repl）。要覆蓋請加 -ForceCodex'
} else {
  Backup-IfExists $codexCfg
  Copy-Item (Join-Path $src 'codex\config.toml') $codexCfg -Force
  Ok 'config.toml -> ~/.codex/config.toml'
}
Write-Host ''

# ---------------------------------------------------------------------------
Info '[3/4] VS Code 設定'
$code = Get-Command code -ErrorAction SilentlyContinue
$vsUser = Join-Path $env:APPDATA 'Code\User'
if(Test-Path $vsUser){
  Backup-IfExists (Join-Path $vsUser 'settings.json')
  Copy-Item (Join-Path $src 'vscode\settings.json') (Join-Path $vsUser 'settings.json') -Force
  Ok 'settings.json -> %APPDATA%/Code/User/'
  Backup-IfExists (Join-Path $vsUser 'keybindings.json')
  Copy-Item (Join-Path $src 'vscode\keybindings.json') (Join-Path $vsUser 'keybindings.json') -Force
  Ok 'keybindings.json -> %APPDATA%/Code/User/'
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
  $exts = @(Get-Content (Join-Path $src 'vscode\extensions.txt') | Where-Object { $_.Trim() })
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
Write-Host '  3. VS Code 的 geminicodeassist.project 目前是佔位字串，請改回你的 GCP 專案 ID' -ForegroundColor White
