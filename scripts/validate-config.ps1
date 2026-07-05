#requires -Version 5.1
<#
.SYNOPSIS
  驗證 config repo 與目前機器上的 deployed 設定是否處於可同步狀態。
.DESCRIPTION
  本腳本只讀取檔案與執行輕量 smoke test，不會修改 repo 或使用者設定。
  預設會檢查 active ~/.codex / ~/.claude；在新機器還沒 deploy 前可加 -SkipActive。
.PARAMETER SkipActive
  略過目前機器上的 ~/.codex / ~/.claude 檢查，只驗 repo 內容。
.PARAMETER SkipContext7
  略過 Context7 MCP smoke test。
#>
[CmdletBinding()]
param(
  [switch]$SkipActive,
  [switch]$SkipContext7
)

$ErrorActionPreference = 'Stop'
$script:Failures = 0
$RepoRoot = Split-Path -Parent $PSScriptRoot
$IsWindowsHost = if(Get-Variable IsWindows -ErrorAction SilentlyContinue){ $IsWindows } else { $true }

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

function Info($m){ Write-Host $m -ForegroundColor Cyan }
function Ok($m){ Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  [略過] $m" -ForegroundColor Yellow }
function Fail($m){
  $script:Failures++
  Write-Host "  [FAIL] $m" -ForegroundColor Red
}

function Test-RequiredFile($path, $label){
  if(Test-Path -LiteralPath $path){
    Ok "$label 存在"
    return $true
  }
  Fail "$label 不存在：$path"
  return $false
}

function Test-Utf8Bom($path, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $bytes = [System.IO.File]::ReadAllBytes($path)
  if($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF){
    Ok "$label 使用 UTF-8 BOM"
  } else {
    Fail "$label 未使用 UTF-8 BOM；Windows PowerShell 5.1 可能讀壞中文"
  }
}

function Test-PowerShellParse($path, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path -LiteralPath $path).ProviderPath, [ref]$tokens, [ref]$errors) | Out-Null
  if($errors.Count -eq 0){
    Ok "$label PowerShell parse OK"
  } else {
    Fail "$label PowerShell parse 失敗：$($errors[0].Message)"
  }
}

function Test-JsonParse($path, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  try {
    Get-Content -LiteralPath $path -Raw | ConvertFrom-Json | Out-Null
    Ok "$label JSON parse OK"
  } catch {
    Fail "$label JSON parse 失敗：$($_.Exception.Message)"
  }
}

function Get-PythonCommand {
  foreach($name in @('python','python3')){
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){ return $cmd.Source }
  }
  return $null
}

function Test-TomlParse($path, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $python = Get-PythonCommand
  if(-not $python){
    Warn "$label TOML parse 未執行：找不到 python/python3"
    return
  }

  $code = @'
import pathlib
import sys

try:
    import tomllib
except ModuleNotFoundError:
    print("tomllib is unavailable", file=sys.stderr)
    sys.exit(2)

for raw_path in sys.argv[1:]:
    text = pathlib.Path(raw_path).read_text(encoding="utf-8-sig")
    tomllib.loads(text)
'@

  $output = $code | & $python - $path 2>&1
  if($LASTEXITCODE -eq 0){
    Ok "$label TOML parse OK"
  } elseif($LASTEXITCODE -eq 2) {
    Warn "$label TOML parse 未執行：python 沒有 tomllib"
  } else {
    Fail "$label TOML parse 失敗：$($output -join ' ')"
  }
}

function Test-TextContains($path, $tokens, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $text = Get-Content -LiteralPath $path -Raw
  $missing = @($tokens | Where-Object { -not $text.Contains($_) })
  if($missing.Count -eq 0){
    Ok "$label template tokens 保留完整"
  } else {
    Fail "$label 缺少 template token：$($missing -join ', ')"
  }
}

function Test-TextDoesNotContain($path, $tokens, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $text = Get-Content -LiteralPath $path -Raw
  $found = @($tokens | Where-Object { $text.Contains($_) })
  if($found.Count -eq 0){
    Ok "$label 未含不應出現的 token/key"
  } else {
    Fail "$label 含不應出現的 token/key：$($found -join ', ')"
  }
}

function Get-NpxCommand {
  foreach($name in @('npx.cmd','npx')){
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){ return $cmd.Source }
  }
  return $null
}

function Test-Context7Smoke {
  if($SkipContext7){
    Warn 'Context7 smoke test 已略過'
    return
  }
  $npx = Get-NpxCommand
  if(-not $npx){
    Fail '找不到 npx，Context7 MCP 無法啟動'
    return
  }
  $output = & $npx -y '@upstash/context7-mcp' --version 2>&1
  if($LASTEXITCODE -eq 0){
    Ok "Context7 MCP smoke test OK：$($output | Select-Object -First 1)"
  } else {
    Fail "Context7 MCP smoke test 失敗：$($output -join ' ')"
  }
}

function Get-FileHashMap($root){
  $map = @{}
  $rootFull = ((Resolve-Path -LiteralPath $root).ProviderPath -replace '[\\/]+$','')
  Get-ChildItem -LiteralPath $rootFull -Recurse -File | Sort-Object FullName | ForEach-Object {
    $rel = $_.FullName.Substring($rootFull.Length) -replace '^[\\/]+',''
    $rel = $rel -replace '\\','/'
    $map[$rel] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
  }
  return $map
}

function Test-DirectorySync($repoDir, $activeDir, $label){
  if(-not(Test-Path -LiteralPath $repoDir)){
    Warn "$label repo 目錄不存在"
    return
  }
  if(-not(Test-Path -LiteralPath $activeDir)){
    Fail "$label active 目錄不存在：$activeDir"
    return
  }
  $repoHashes = Get-FileHashMap $repoDir
  $activeHashes = Get-FileHashMap $activeDir
  $allKeys = (@($repoHashes.Keys) + @($activeHashes.Keys)) | Sort-Object -Unique
  $diffs = @()
  foreach($key in $allKeys){
    if(-not $repoHashes.ContainsKey($key)){
      $diffs += "active 多出 $key"
    } elseif(-not $activeHashes.ContainsKey($key)){
      $diffs += "active 缺少 $key"
    } elseif($repoHashes[$key] -ne $activeHashes[$key]){
      $diffs += "hash 不同 $key"
    }
  }
  if($diffs.Count -eq 0){
    Ok "$label 與 active 內容一致"
  } else {
    $preview = ($diffs | Select-Object -First 5) -join '; '
    Fail "$label 與 active 不一致：$preview"
  }
}

function Test-FileSync($repoFile, $activeFile, $label){
  if(-not(Test-Path -LiteralPath $repoFile)){
    Warn "$label repo 檔案不存在"
    return
  }
  if(-not(Test-Path -LiteralPath $activeFile)){
    Fail "$label active 檔案不存在：$activeFile"
    return
  }
  $repoHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $repoFile).Hash
  $activeHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $activeFile).Hash
  if($repoHash -eq $activeHash){
    Ok "$label 與 active 內容一致"
  } else {
    Fail "$label 與 active 不一致：repo=$($repoHash.Substring(0,12)) active=$($activeHash.Substring(0,12))"
  }
}

$repoCodexConfig = Join-Parts $RepoRoot 'codex' 'config.toml'
$repoCodexAgents = Join-Parts $RepoRoot 'codex' 'AGENTS.md'
$repoCodexBaseInstructions = Join-Parts $RepoRoot 'codex' 'base-instructions.md'
$repoCodexModelCatalog = Join-Parts $RepoRoot 'codex' 'model-catalog.json'
$repoClaudeSettings = Join-Parts $RepoRoot 'claude' 'settings.json'
$repoPowerShellFiles = @(
  (Join-Path $RepoRoot 'deploy.ps1'),
  (Join-Path $RepoRoot 'backup.ps1'),
  (Join-Parts $RepoRoot 'scripts' 'validate-config.ps1'),
  (Join-Parts $RepoRoot 'claude' 'hooks' 'check-traditional.ps1')
)

Info '[1/6] Repo 檔案格式'
foreach($file in $repoPowerShellFiles){
  Test-Utf8Bom $file (Split-Path $file -Leaf)
  Test-PowerShellParse $file (Split-Path $file -Leaf)
}
Test-JsonParse $repoClaudeSettings 'claude/settings.json'
Test-TomlParse $repoCodexConfig 'codex/config.toml'
Write-Host ''

Info '[2/6] Repo template 邊界'
Test-TextContains $repoCodexConfig @('__NPX_COMMAND__','__SYSTEM_ROOT__','__CODEX_TERMINAL_SHELL__') 'codex/config.toml'
Test-TextContains $repoClaudeSettings @('__CLAUDE_STOP_HOOK_COMMAND__') 'claude/settings.json'
Test-TextDoesNotContain $repoCodexConfig @('model_catalog_json','model_auto_compact_token_limit =') 'codex/config.toml'
Write-Host ''

Info '[3/6] Context7'
Test-Context7Smoke
Write-Host ''

if($SkipActive){
  Warn 'active ~/.codex / ~/.claude 檢查已略過'
} else {
  $homeDir = Get-HomeDir
  $activeCodexConfig = Join-Parts $homeDir '.codex' 'config.toml'
  $activeCodexAgents = Join-Parts $homeDir '.codex' 'AGENTS.md'
  $activeCodexBaseInstructions = Join-Parts $homeDir '.codex' 'base-instructions.md'
  $activeCodexModelCatalog = Join-Parts $homeDir '.codex' 'model-catalog.json'
  $activeClaudeSettings = Join-Parts $homeDir '.claude' 'settings.json'
  $activeClaudeHook = Join-Parts $homeDir '.claude' 'hooks' 'check-traditional.ps1'

  Info '[4/6] Active 設定展開狀態'
  Test-TomlParse $activeCodexConfig '~/.codex/config.toml'
  Test-JsonParse $activeClaudeSettings '~/.claude/settings.json'
  Test-Utf8Bom $activeClaudeHook '~/.claude/hooks/check-traditional.ps1'
  Test-TextDoesNotContain $activeCodexConfig @('__NPX_COMMAND__','__SYSTEM_ROOT__','__CODEX_TERMINAL_SHELL__') '~/.codex/config.toml'
  Test-TextDoesNotContain $activeClaudeSettings @('__CLAUDE_STOP_HOOK_COMMAND__') '~/.claude/settings.json'
  Write-Host ''

  Info '[5/6] Active Codex prompt surface'
  Test-FileSync $repoCodexAgents $activeCodexAgents 'codex/AGENTS.md'
  Test-FileSync $repoCodexBaseInstructions $activeCodexBaseInstructions 'codex/base-instructions.md'
  Test-FileSync $repoCodexModelCatalog $activeCodexModelCatalog 'codex/model-catalog.json'
  Write-Host ''

  Info '[6/6] Repo-managed Codex skills'
  Get-ChildItem -LiteralPath (Join-Parts $RepoRoot 'codex' 'skills') -Directory | ForEach-Object {
    Test-DirectorySync $_.FullName (Join-Parts $homeDir '.codex' 'skills' $_.Name) "skills/$($_.Name)"
  }
  Write-Host ''
}

if($script:Failures -gt 0){
  Write-Host "驗證失敗：$script:Failures 個問題" -ForegroundColor Red
  exit 1
}

Write-Host '驗證通過。' -ForegroundColor Green
