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

function Test-JsonLinesParse($path, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $lineNumber = 0
  $caseCount = 0
  try {
    [System.IO.File]::ReadAllLines($path, [System.Text.Encoding]::UTF8) | ForEach-Object {
      $lineNumber++
      if(-not [string]::IsNullOrWhiteSpace($_)){
        $_ | ConvertFrom-Json -ErrorAction Stop | Out-Null
        $caseCount++
      }
    }
    if($caseCount -eq 0){
      Fail "$label 沒有任何 JSONL case"
    } else {
      Ok "$label JSONL parse OK（$caseCount cases）"
    }
  } catch {
    Fail "$label JSONL parse 失敗（line $lineNumber）：$($_.Exception.Message)"
  }
}

function Get-PythonCommand {
  foreach($name in @('python','python3')){
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if($cmd){ return $cmd.Source }
  }
  return $null
}

function Test-CodexSkills($skillsRoot, $label){
  if(-not(Test-Path -LiteralPath $skillsRoot -PathType Container)){
    Fail "$label 目錄不存在：$skillsRoot"
    return
  }

  $python = Get-PythonCommand
  if(-not $python){
    Warn "$label skill validation 未執行：找不到 python/python3"
    return
  }

  $validator = Join-Parts (Get-HomeDir) '.codex' 'skills' '.system' 'skill-creator' 'scripts' 'quick_validate.py'
  if(-not(Test-Path -LiteralPath $validator -PathType Leaf)){
    Warn "$label skill validation 未執行：找不到 bundled quick_validate.py"
    return
  }

  $skills = @(Get-ChildItem -LiteralPath $skillsRoot -Directory | Sort-Object Name)
  if($skills.Count -eq 0){
    Fail "$label 沒有 repo-managed skill"
    return
  }

  $hadPythonUtf8 = Test-Path Env:PYTHONUTF8
  $previousPythonUtf8 = $env:PYTHONUTF8
  try {
    $env:PYTHONUTF8 = '1'
    foreach($skill in $skills){
      $output = & $python $validator $skill.FullName 2>&1
      if($LASTEXITCODE -eq 0){
        Ok "$label/$($skill.Name) structure valid"
      } else {
        Fail "$label/$($skill.Name) structure invalid：$($output -join ' ')"
      }
    }
  } finally {
    if($hadPythonUtf8){
      $env:PYTHONUTF8 = $previousPythonUtf8
    } else {
      Remove-Item Env:PYTHONUTF8 -ErrorAction SilentlyContinue
    }
  }
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
    Ok "$label 必要 token/key 保留完整"
  } else {
    Fail "$label 缺少必要 token/key：$($missing -join ', ')"
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

function Test-TextDoesNotMatch($path, $patterns, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $text = Get-Content -LiteralPath $path -Raw
  $found = @($patterns | Where-Object { [regex]::IsMatch($text, $_) })
  if($found.Count -eq 0){
    Ok "$label 未含禁止的 pattern"
  } else {
    Fail "$label 含禁止的 pattern：$($found -join ', ')"
  }
}

function Get-TomlFeatureKeys($path, [switch]$EnabledOnly){
  $keys = @()
  $inFeatures = $false
  foreach($line in Get-Content -LiteralPath $path){
    if($line -match '^\s*\[features\]\s*$'){
      $inFeatures = $true
      continue
    }
    if($inFeatures -and $line -match '^\s*\['){ break }
    if($inFeatures -and $line -match '^\s*([A-Za-z0-9_.-]+)\s*=\s*(true|false)\s*(?:#.*)?$'){
      if(-not $EnabledOnly -or $Matches[2] -eq 'true'){
        $keys += $Matches[1]
      }
    }
  }
  return $keys
}

function Get-CodexCommand {
  if($IsWindowsHost -and $env:LOCALAPPDATA){
    $binRoot = Join-Parts $env:LOCALAPPDATA 'OpenAI' 'Codex' 'bin'
    if(Test-Path -LiteralPath $binRoot){
      $candidate = Get-ChildItem -LiteralPath $binRoot -Recurse -File -Filter 'codex.exe' |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
      if($candidate){ return $candidate.FullName }
    }
  }

  $command = Get-Command codex -ErrorAction SilentlyContinue
  if($command){ return $command.Source }
  return $null
}

function Test-CodexFeatureLifecycle($path, $label, [switch]$EnabledOnly){
  if(-not(Test-RequiredFile $path $label)){ return }
  $codex = Get-CodexCommand
  if(-not $codex){
    Warn "$label feature lifecycle 未執行：找不到 Codex CLI"
    return
  }

  $output = & $codex features list 2>&1
  if($LASTEXITCODE -ne 0){
    Warn "$label feature lifecycle 未執行：$($output -join ' ')"
    return
  }

  $removed = @{}
  $deprecated = @{}
  foreach($line in $output){
    if($line -match '^\s*(\S+)\s+(removed|deprecated)\s+(true|false)\s*$'){
      if($Matches[2] -eq 'removed'){
        $removed[$Matches[1]] = $true
      } else {
        $deprecated[$Matches[1]] = $true
      }
    }
  }

  $featureKeys = @(Get-TomlFeatureKeys $path -EnabledOnly:$EnabledOnly)
  $removedConfigured = @($featureKeys | Where-Object { $removed.ContainsKey($_) })
  $deprecatedConfigured = @($featureKeys | Where-Object { $deprecated.ContainsKey($_) })

  if($removedConfigured.Count -gt 0){
    Fail "$label 含 Codex 已移除 feature：$($removedConfigured -join ', ')"
  } else {
    Ok "$label 未啟用 Codex 已移除 feature"
  }

  if($deprecatedConfigured.Count -gt 0){
    Warn "$label 含 deprecated feature：$($deprecatedConfigured -join ', ')"
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

  $configPath = Join-Parts $RepoRoot 'codex' 'config.toml'
  $configText = Get-Content -LiteralPath $configPath -Raw
  if($configText -notmatch '@upstash/context7-mcp@[^"\s]+'){
    Fail 'codex/config.toml 找不到 pinned Context7 package'
    return
  }

  $package = $Matches[0]
  $output = & $npx -y $package --version 2>&1
  if($LASTEXITCODE -eq 0){
    Ok "Context7 MCP smoke test OK：$package -> $($output | Select-Object -First 1)"
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

function Test-CodexConfigSchema($path, $label){
  if(-not(Test-RequiredFile $path $label)){ return }
  $python = Get-PythonCommand
  if(-not $python){
    Warn "$label schema validation 未執行：找不到 python/python3"
    return
  }

  $code = @'
import json
import pathlib
import sys
import urllib.request

try:
    import tomllib
    import jsonschema
except ModuleNotFoundError as exc:
    print(f"DEPENDENCY_UNAVAILABLE: {exc.name}", file=sys.stderr)
    sys.exit(2)

config_path = pathlib.Path(sys.argv[1])
schema_url = sys.argv[2]

try:
    with urllib.request.urlopen(schema_url, timeout=30) as response:
        schema = json.load(response)
except Exception as exc:
    print(f"SCHEMA_UNAVAILABLE: {exc}", file=sys.stderr)
    sys.exit(3)

config = tomllib.loads(config_path.read_text(encoding="utf-8-sig"))
errors = sorted(
    jsonschema.Draft7Validator(schema).iter_errors(config),
    key=lambda error: list(error.path),
)

if errors:
    for error in errors[:8]:
        location = ".".join(str(part) for part in error.path) or "<root>"
        print(f"{location}: {error.message}", file=sys.stderr)
    sys.exit(1)
'@

  $schemaUrl = 'https://developers.openai.com/codex/config-schema.json'
  $output = $code | & $python - $path $schemaUrl 2>&1
  if($LASTEXITCODE -eq 0){
    Ok "$label official schema validation OK"
  } elseif($LASTEXITCODE -eq 2) {
    Warn "$label schema validation 未執行：$($output -join ' ')"
  } elseif($LASTEXITCODE -eq 3) {
    Warn "$label schema 暫時無法取得：$($output -join ' ')"
  } else {
    Fail "$label official schema validation 失敗：$($output -join ' ')"
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
$repoCodexSkills = Join-Parts $RepoRoot 'codex' 'skills'
$repoReadOnlyCases = Join-Parts $RepoRoot 'codex' 'evals' 'read-only-boundary.cases.jsonl'
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
Test-JsonLinesParse $repoReadOnlyCases 'codex/evals/read-only-boundary.cases.jsonl'
Test-TomlParse $repoCodexConfig 'codex/config.toml'
Test-CodexConfigSchema $repoCodexConfig 'codex/config.toml'
Test-CodexFeatureLifecycle $repoCodexConfig 'codex/config.toml'
Test-CodexSkills $repoCodexSkills 'codex/skills'
Write-Host ''

Info '[2/6] Repo template 邊界'
Test-TextContains $repoCodexConfig @('__NPX_COMMAND__','__SYSTEM_ROOT__','__CODEX_TERMINAL_SHELL__') 'codex/config.toml'
Test-TextContains $repoCodexConfig @('model_context_window = 1000000') 'codex/config.toml'
Test-TextContains $repoCodexAgents @('[MODE: UNRESTRICTED]','CORE DIRECTIVES:','EXECUTION BOUNDARY:') 'codex/AGENTS.md'
Test-TextContains $repoClaudeSettings @('__CLAUDE_STOP_HOOK_COMMAND__') 'claude/settings.json'
Test-TextDoesNotContain $repoCodexConfig @('model_catalog_json','model_auto_compact_token_limit =','model_instructions_file','consolidation_model','extract_model','[agents.worker]') 'codex/config.toml'
Test-TextDoesNotMatch $repoCodexConfig @('(?m)^\s*model\s*=','(?m)^\s*review_model\s*=') 'codex/config.toml'
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
  $activeClaudeSettings = Join-Parts $homeDir '.claude' 'settings.json'
  $activeClaudeHook = Join-Parts $homeDir '.claude' 'hooks' 'check-traditional.ps1'

  Info '[4/6] Active 設定展開狀態'
  Test-TomlParse $activeCodexConfig '~/.codex/config.toml'
  Test-CodexConfigSchema $activeCodexConfig '~/.codex/config.toml'
  Test-CodexFeatureLifecycle $activeCodexConfig '~/.codex/config.toml' -EnabledOnly
  Test-JsonParse $activeClaudeSettings '~/.claude/settings.json'
  Test-Utf8Bom $activeClaudeHook '~/.claude/hooks/check-traditional.ps1'
  Test-TextDoesNotContain $activeCodexConfig @('__NPX_COMMAND__','__SYSTEM_ROOT__','__CODEX_TERMINAL_SHELL__') '~/.codex/config.toml'
  Test-TextContains $activeCodexConfig @('model_context_window = 1000000') '~/.codex/config.toml'
  Test-TextDoesNotContain $activeCodexConfig @('model_catalog_json','model_auto_compact_token_limit =','model_instructions_file','consolidation_model','extract_model','[agents.worker]') '~/.codex/config.toml'
  Test-TextDoesNotMatch $activeCodexConfig @('(?m)^\s*review_model\s*=') '~/.codex/config.toml'
  Test-TextDoesNotContain $activeClaudeSettings @('__CLAUDE_STOP_HOOK_COMMAND__') '~/.claude/settings.json'
  Write-Host ''

  Info '[5/6] Active Codex instruction surface'
  Test-FileSync $repoCodexAgents $activeCodexAgents 'codex/AGENTS.md'
  Write-Host ''

  Info '[6/6] Repo-managed Codex skills'
  Get-ChildItem -LiteralPath $repoCodexSkills -Directory | ForEach-Object {
    Test-DirectorySync $_.FullName (Join-Parts $homeDir '.codex' 'skills' $_.Name) "skills/$($_.Name)"
  }
  Write-Host ''
}

if($script:Failures -gt 0){
  Write-Host "驗證失敗：$script:Failures 個問題" -ForegroundColor Red
  exit 1
}

Write-Host '驗證通過。' -ForegroundColor Green
