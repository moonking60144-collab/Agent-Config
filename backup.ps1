#requires -Version 5.1
<#
.SYNOPSIS
  把本機現有設定回寫到本 repo（deploy.ps1 的反方向），方便把某臺機器的調整同步回版控。
.DESCRIPTION
  回寫 Claude Code 的 CLAUDE.md / settings.json / hooks、Codex AGENTS.md / repo 管理的 skills，
  以及 VS Code 的 settings / keybindings / extensions 清單。會自動把機器特定值（hook 絕對路徑、GCP 專案 ID）
  還原成佔位符。回寫後請 git diff 檢視再 commit。
  Codex config.toml 與 profile.md 含機器特定內容，不自動回寫。
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$src = $PSScriptRoot
$U   = $env:USERPROFILE
$enc = New-Object System.Text.UTF8Encoding $false

function Ok($m){ Write-Host "  [OK] $m" -ForegroundColor Green }
function Skip($m){ Write-Host "  [跳過] $m" -ForegroundColor Yellow }

# Claude CLAUDE.md（可攜核心，含 @import 行）
$cm = Join-Path $U '.claude\CLAUDE.md'
if(Test-Path $cm){
  Copy-Item $cm (Join-Path $src 'claude\CLAUDE.md') -Force
  Ok 'CLAUDE.md <- ~/.claude/CLAUDE.md'
} else { Skip "$cm 不存在（尚未 deploy 過？）" }

# Claude settings.json（把實際 hook 路徑換回佔位符）
$cs = Join-Path $U '.claude\settings.json'
if(Test-Path $cs){
  $t = Get-Content $cs -Raw
  $t = $t.Replace(($U -replace '\\','/'), '__USERPROFILE__').Replace($U, '__USERPROFILE__')
  [System.IO.File]::WriteAllText((Join-Path $src 'claude\settings.json'), $t, $enc)
  Ok 'settings.json <- ~/.claude/settings.json（已還原佔位符）'
} else { Skip "$cs 不存在" }

# Claude hooks
$hk = Join-Path $U '.claude\hooks'
if(Test-Path $hk){
  Copy-Item (Join-Path $hk '*') (Join-Path $src 'claude\hooks') -Recurse -Force
  Ok 'hooks <- ~/.claude/hooks'
}

# Codex AGENTS.md（可攜全域指令）
$ca = Join-Path $U '.codex\AGENTS.md'
if(Test-Path $ca){
  Copy-Item $ca (Join-Path $src 'codex\AGENTS.md') -Force
  Ok 'AGENTS.md <- ~/.codex/AGENTS.md'
} else { Skip "$ca 不存在" }

# Codex skills（只回寫 repo 已管理的 skill，避免把系統或外掛 cache 掃進來）
$repoSkills = Join-Path $src 'codex\skills'
$localSkills = Join-Path $U '.codex\skills'
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

# VS Code settings（把 GCP 專案 ID 換回佔位符）
$vs = Join-Path $env:APPDATA 'Code\User\settings.json'
if(Test-Path $vs){
  $t = Get-Content $vs -Raw
  $t = [regex]::Replace($t, '("geminicodeassist\.project"\s*:\s*")[^"]*(")', '${1}your-gcp-project-id${2}')
  [System.IO.File]::WriteAllText((Join-Path $src 'vscode\settings.json'), $t, $enc)
  Ok 'settings.json <- VS Code（已遮蔽 GCP 專案 ID）'
} else { Skip "$vs 不存在" }

# VS Code keybindings
$kb = Join-Path $env:APPDATA 'Code\User\keybindings.json'
if(Test-Path $kb){
  Copy-Item $kb (Join-Path $src 'vscode\keybindings.json') -Force
  Ok 'keybindings.json <- VS Code'
}

# VS Code extensions
$code = Get-Command code -ErrorAction SilentlyContinue
if($code){
  $list = @(& code --list-extensions | Where-Object { $_.Trim() })
  [System.IO.File]::WriteAllText((Join-Path $src 'vscode\extensions.txt'), (($list -join "`n") + "`n"), $enc)
  Ok "extensions.txt <- code --list-extensions（$($list.Count) 個）"
}

Write-Host ''
Write-Host 'Codex config.toml 與 ~/.claude/profile.md 含機器特定內容，未自動回寫；需要時請手動處理。' -ForegroundColor Yellow
Write-Host "完成。請執行  git -C `"$src`" diff  檢視後再 commit。" -ForegroundColor Cyan
