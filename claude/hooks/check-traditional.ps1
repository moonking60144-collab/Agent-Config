# ============================================================================
#  Stop hook — 偵測最後一則 assistant 回覆是否含簡體字，有就擋下要求改繁體
#  必須用 Windows PowerShell 5.1 (.NET Framework) 執行：StrConv 的簡繁轉換
#  在 pwsh7/.NET Core 上會丟 PlatformNotSupportedException。
#  偵測原理：簡→繁轉換後若與原文不同 = 原文含簡體獨有字形。
# ============================================================================
$ErrorActionPreference = 'SilentlyContinue'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

# 讀 stdin 的 hook 輸入 JSON
try { $raw = [Console]::In.ReadToEnd(); $hook = $raw | ConvertFrom-Json } catch { exit 0 }

$tp = $hook.transcript_path
if (-not $tp -or -not (Test-Path -LiteralPath $tp)) { exit 0 }

# 從 transcript JSONL 撈最後一則「有文字」的 assistant 訊息
$lines = @(Get-Content -LiteralPath $tp -Encoding UTF8 -Tail 120)
$text = ''
for ($i = $lines.Count - 1; $i -ge 0; $i--) {
  if (-not $lines[$i]) { continue }
  try { $o = $lines[$i] | ConvertFrom-Json } catch { continue }
  if ($o.type -eq 'assistant' -and $o.message -and $o.message.content) {
    $buf = ''
    foreach ($c in $o.message.content) { if ($c.type -eq 'text' -and $c.text) { $buf += $c.text } }
    if ($buf.Trim().Length -gt 0) { $text = $buf; break }
  }
}
if ($text.Trim().Length -eq 0) { exit 0 }

# 簡→繁轉換比對
Add-Type -AssemblyName Microsoft.VisualBasic
$trad = [Microsoft.VisualBasic.Strings]::StrConv($text, [Microsoft.VisualBasic.VbStrConv]::TraditionalChinese, 1028)
if ($trad -and ($trad -ne $text)) {
  $ex = ''
  $n = [Math]::Min($text.Length, $trad.Length)
  for ($k = 0; $k -lt $n -and $ex.Length -lt 10; $k++) {
    if ($text[$k] -ne $trad[$k]) { $ex += $text[$k] }
  }
  $reason = "偵測到簡體字（例：$ex）。整則回覆請改用繁體中文（台灣用語）重新輸出，禁簡（含詞彙與字形）。"
  [pscustomobject]@{ decision = 'block'; reason = $reason } | ConvertTo-Json -Compress
  exit 0
}
exit 0
