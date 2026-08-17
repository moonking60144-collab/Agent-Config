#requires -Version 5.1
<#
.SYNOPSIS
  把本機現有設定回寫到本 repo（deploy.ps1 的反方向），方便把某臺機器的調整同步回版控。
.DESCRIPTION
  回寫 Claude Code 的 CLAUDE.md / settings.json / hooks、Codex AGENTS.md / repo 管理的 skills，
  以及 VS Code 的 settings / keybindings。會自動把機器特定 hook 絕對路徑還原成佔位符，
  並剔除已停用的 Gemini Code Assist 設定。回寫後請 git diff 檢視再 commit。
  Codex config.toml 只回寫可攜 summary / verbosity / personality / token 行為 key；目前模型與 reasoning effort 視為 runtime 選擇，不自動回寫。
.PARAMETER IncludeExtensions
  同步 `code --list-extensions` 到 vscode/extensions.txt。預設略過，避免某臺機器的臨時擴充污染 repo。
#>
[CmdletBinding()]
param(
  [switch]$IncludeExtensions
)

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$enc = New-Object System.Text.UTF8Encoding $false

$IsWindowsHost = if(Get-Variable IsWindows -ErrorAction SilentlyContinue){ $IsWindows } else { $true }
$IsMacOSHost = if(Get-Variable IsMacOS -ErrorAction SilentlyContinue){ $IsMacOS } else { $false }

function Ok($m){ Write-Host "  [OK] $m" -ForegroundColor Green }
function Skip($m){ Write-Host "  [跳過] $m" -ForegroundColor Yellow }
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
function Normalize-ClaudeSettingsTemplate {
  param([Parameter(Mandatory=$true)][string]$Text)

  $homeDir = Get-HomeDir
  $normalized = $Text.Replace(($homeDir -replace '\\','/'), '__USERPROFILE__').Replace($homeDir, '__USERPROFILE__')
  try {
    $obj = $normalized | ConvertFrom-Json
    foreach($stop in @($obj.hooks.Stop)){
      foreach($hook in @($stop.hooks)){
        $hookArgs = (@($hook.args) -join ' ')
        if((($hook.command -as [string]) -eq 'node') -and ($hookArgs -match 'check-traditional\.mjs')){
          $hook.args = @('__CLAUDE_STOP_HOOK_PATH__')
          $hook.statusMessage = '檢查繁體中文'
        }
      }
    }
    return (($obj | ConvertTo-Json -Depth 20) + "`n")
  } catch {
    return $normalized.Replace('__USERPROFILE__/.claude/hooks/check-traditional.mjs', '__CLAUDE_STOP_HOOK_PATH__')
  }
}

$U = Get-HomeDir

function Sync-CodexPortableConfig {
  param(
    [Parameter(Mandatory=$true)][string]$LocalPath,
    [Parameter(Mandatory=$true)][string]$RepoPath
  )

  if((-not (Test-Path $LocalPath)) -or (-not (Test-Path $RepoPath))){
    Skip 'Codex config.toml 不完整，略過可攜 key 回寫'
    return
  }

  $portableKeys = @(
    'model_context_window',
    'tool_output_token_limit',
    'model_reasoning_summary',
    'model_verbosity',
    'personality'
  )

  $localLines = Get-Content $LocalPath
  $repoLines = [System.Collections.Generic.List[string]]::new()
  Get-Content $RepoPath | ForEach-Object { [void]$repoLines.Add($_) }

  foreach($key in $portableKeys){
    $localLine = $localLines | Where-Object { $_ -match "^\s*$([regex]::Escape($key))\s*=" } | Select-Object -First 1
    if(-not $localLine){ continue }

    $idx = -1
    for($i = 0; $i -lt $repoLines.Count; $i++){
      if($repoLines[$i] -match "^\s*$([regex]::Escape($key))\s*="){ $idx = $i; break }
    }

    if($idx -ge 0){
      $repoLines[$idx] = $localLine
    }
  }

  [System.IO.File]::WriteAllText($RepoPath, (($repoLines -join "`n") + "`n"), $enc)
  Ok 'config.toml <- ~/.codex/config.toml（只回寫可攜 summary / verbosity / personality / token key）'
}

# Claude CLAUDE.md（可攜核心）
$cm = Join-Parts $U '.claude' 'CLAUDE.md'
if(Test-Path $cm){
  Copy-Item $cm (Join-Parts $src 'claude' 'CLAUDE.md') -Force
  Ok 'CLAUDE.md <- ~/.claude/CLAUDE.md'
} else { Skip "$cm 不存在（尚未 deploy 過？）" }

# Claude settings.json（把實際 hook 路徑換回佔位符）
$cs = Join-Parts $U '.claude' 'settings.json'
if(Test-Path $cs){
  $t = Get-Content $cs -Raw
  $t = Normalize-ClaudeSettingsTemplate $t
  [System.IO.File]::WriteAllText((Join-Parts $src 'claude' 'settings.json'), $t, $enc)
  Ok 'settings.json <- ~/.claude/settings.json（已還原跨平台 hook 佔位符）'
} else { Skip "$cs 不存在" }

# Claude canonical Stop hook
$hk = Join-Parts $U '.claude' 'hooks' 'check-traditional.mjs'
if(Test-Path $hk){
  Copy-Item $hk (Join-Parts $src 'claude' 'hooks' 'check-traditional.mjs') -Force
  Ok 'check-traditional.mjs <- ~/.claude/hooks/check-traditional.mjs'
} else { Skip "$hk 不存在" }

# Codex AGENTS.md（可攜全域指令）
$ca = Join-Parts $U '.codex' 'AGENTS.md'
if(Test-Path $ca){
  Copy-Item $ca (Join-Parts $src 'codex' 'AGENTS.md') -Force
  Ok 'AGENTS.md <- ~/.codex/AGENTS.md'
} else { Skip "$ca 不存在" }

# Codex skills（只回寫 repo 已管理的 skill，避免把系統或外掛 cache 掃進來）
$repoSkills = Join-Parts $src 'codex' 'skills'
$localSkills = Join-Parts $U '.codex' 'skills'
if((Test-Path $repoSkills) -and (Test-Path $localSkills)){
  Get-ChildItem $repoSkills -Directory | ForEach-Object {
    $localSkill = Join-Path $localSkills $_.Name
    if(Test-Path $localSkill){
      Copy-Item (Join-Path $localSkill '*') $_.FullName -Recurse -Force
      Ok "skills/$($_.Name) <- ~/.codex/skills/$($_.Name)"
    } else {
      Skip "$localSkill 不存在"
    }
  }
} elseif(Test-Path $repoSkills){
  Skip "$localSkills 不存在"
}

# Codex compact prompts（只回寫 repo 已管理的 prompt 檔）
$repoCompactPrompts = Join-Parts $src 'codex' 'compact-prompts'
$localCompactPrompts = Join-Parts $U '.codex' 'compact-prompts'
if((Test-Path $repoCompactPrompts) -and (Test-Path $localCompactPrompts)){
  Get-ChildItem $repoCompactPrompts -File | ForEach-Object {
    $localPrompt = Join-Path $localCompactPrompts $_.Name
    if(Test-Path $localPrompt){
      Copy-Item $localPrompt $_.FullName -Force
      Ok "compact-prompts/$($_.Name) <- ~/.codex/compact-prompts/$($_.Name)"
    } else {
      Skip "$localPrompt 不存在"
    }
  }
} elseif(Test-Path $repoCompactPrompts){
  Skip "$localCompactPrompts 不存在"
}

# Codex profiles（只回寫 repo 已管理的 profile 檔）
$repoProfiles = Join-Parts $src 'codex' 'profiles'
if(Test-Path $repoProfiles){
  Get-ChildItem $repoProfiles -Filter '*.config.toml' -File | ForEach-Object {
    $localProfile = Join-Parts $U '.codex' $_.Name
    if(Test-Path $localProfile){
      Copy-Item $localProfile $_.FullName -Force
      Ok "profiles/$($_.Name) <- ~/.codex/$($_.Name)"
    } else {
      Skip "$localProfile 不存在"
    }
  }
}

Sync-CodexPortableConfig `
  -LocalPath (Join-Parts $U '.codex' 'config.toml') `
  -RepoPath (Join-Parts $src 'codex' 'config.toml')

# VS Code settings（剔除已停用的 Gemini Code Assist 設定）
$vsUser = Get-VSCodeUserDir
$vs = Join-Path $vsUser 'settings.json'
if(Test-Path $vs){
  $t = Get-Content $vs -Raw
  try {
    $settings = $t | ConvertFrom-Json
    @($settings.PSObject.Properties | Where-Object { $_.Name -like 'geminicodeassist.*' }) | ForEach-Object {
      $settings.PSObject.Properties.Remove($_.Name)
    }
    $t = ($settings | ConvertTo-Json -Depth 20) + "`n"
  } catch {
    $t = [regex]::Replace($t, '(?m)^\s*"geminicodeassist\.[^"]+"\s*:\s*("[^"]*"|true|false|null|[0-9]+)\s*,?\r?\n?', '')
  }
  [System.IO.File]::WriteAllText((Join-Parts $src 'vscode' 'settings.json'), $t, $enc)
  Ok 'settings.json <- VS Code（已剔除 Gemini Code Assist 設定）'
} else { Skip "$vs 不存在" }

# VS Code keybindings
$kb = Join-Path $vsUser 'keybindings.json'
if(Test-Path $kb){
  Copy-Item $kb (Join-Parts $src 'vscode' 'keybindings.json') -Force
  Ok 'keybindings.json <- VS Code'
}

# VS Code extensions
if($IncludeExtensions){
  $code = Get-Command code -ErrorAction SilentlyContinue
  if($code){
    $list = @(& code --list-extensions | Where-Object { $_.Trim() })
    [System.IO.File]::WriteAllText((Join-Parts $src 'vscode' 'extensions.txt'), (($list -join "`n") + "`n"), $enc)
    Ok "extensions.txt <- code --list-extensions（$($list.Count) 個）"
  } else {
    Skip '找不到 code 指令，略過 extensions.txt 回寫'
  }
} else {
  Skip '未指定 -IncludeExtensions，略過 extensions.txt 回寫'
}

Write-Host ''
Write-Host 'Codex config.toml 只回寫可攜 summary / verbosity / personality / token key；目前模型、reasoning effort 與 ~/.claude/profile.md 未自動回寫。' -ForegroundColor Yellow
Write-Host "完成。請執行  git -C `"$src`" diff  檢視後再 commit。" -ForegroundColor Cyan
