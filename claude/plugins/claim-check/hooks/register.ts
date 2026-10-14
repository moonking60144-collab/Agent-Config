import type { EngineInterface, Register } from 'claude-code'

// Ascending capability; the checker is the tier below the model that answered.
const TIERS = ['haiku', 'sonnet', 'opus', 'fable'] as const
type Tier = (typeof TIERS)[number]
const CHECKERS: readonly string[] = ['haiku', 'sonnet', 'opus']

const MIN_ANSWER_CHARS = 200
const INPUT_CHARS = 300
const OUTPUT_CHARS = 1_500
const EVIDENCE_CHARS = 60_000
const REPORT_CHARS = 2_000
const SKIPPED_INPUT_KEYS = new Set(['tool', 'tool_use_id', 'agentId', 'requestMeta'])

const SYSTEM = [
  '你是結論查核員。你會收到 AI 助理在一個回合的最終回覆，以及它執行過的工具呼叫與輸出摘錄。',
  '只檢查一件事：回覆裡的結論是否超出證據。',
  '要標記：',
  '1. 回覆說已驗證、已完成、已通過、已確認，或用一定、全部、沒有等全稱說法，但提供的證據不支持。',
  '2. 回覆的說法與證據矛盾。',
  '3. 把推測、可能性或相關性寫成確定的事實或因果。',
  '不要標記：措辭、格式與風格；建議與計畫本身。證據不在摘錄中、可能出自更早對話的內容，改標為「無法確認」，而且只在結論語氣很強時才列。',
  '輸出規則：沒有問題時只輸出 OK。有問題時最多列 5 點，每點一行，格式為「- [超出證據|矛盾|無法確認] 結論摘要：理由」，使用繁體中文，不要輸出其他內容。',
].join('\n')

type Outcome =
  | { kind: 'ok' | 'flagged'; checker: string; text: string; usage: unknown }
  | { kind: 'skipped'; checker: string | null; text: string }

// Main-loop tool evidence, oldest first, kept across turns so an answer citing an earlier result is not misjudged.
const evidence: string[] = []

function clip(text: string, limit: number): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}…（已截短，原長 ${text.length} 字元）`
}

function remember(entry: string): void {
  evidence.push(entry)
  let total = evidence.reduce((sum, item) => sum + item.length, 0)
  while (total > EVIDENCE_CHARS && evidence.length > 1) total -= evidence.shift()!.length
}

function tierOf(model: string): Tier | undefined {
  const id = model.toLowerCase()
  if (id.includes('mythos')) return 'fable'
  return TIERS.find(tier => id.includes(tier))
}

function checkersFor(answeredBy: string, setting: unknown): string[] {
  if (typeof setting === 'string' && CHECKERS.includes(setting)) return [setting]
  const tier = tierOf(answeredBy)
  const top = tier === undefined ? CHECKERS.indexOf('sonnet') : Math.max(0, TIERS.indexOf(tier) - 1)
  return CHECKERS.slice(0, top + 1).reverse()
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function check($: EngineInterface, prompt: string, checkers: string[]): Promise<Outcome> {
  let reason = '沒有可用的檢查模型'
  for (const checker of checkers) {
    // The engine rejects a model the plan or allowlist blocks; that tier is skipped for the next one down.
    const reply = await $.model
      .complete({ model: checker, system: SYSTEM, prompt, maxTokens: 4_000, effort: 'low', timeoutMs: 90_000 })
      .catch((error: unknown) => describe(error))
    if (typeof reply === 'string') {
      reason = `${checker} 無法使用：${reply}`
      continue
    }
    if (reply.isAnswered) {
      const text = reply.text.trim()
      return { kind: /^OK\.?$/i.test(text) ? 'ok' : 'flagged', checker, text, usage: reply.usage }
    }
    reason = `${checker} 沒有回覆（${reply.reason === 'api-error' ? reply.error : reply.reason}）`
    const isUnavailable = reply.reason === 'api-error' && (reply.error === 'model_not_found' || reply.error === 'invalid_request')
    if (!isUnavailable) return { kind: 'skipped', checker, text: reason }
  }
  return { kind: 'skipped', checker: null, text: reason }
}

async function record($: EngineInterface, entry: Record<string, unknown>): Promise<void> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (!home) throw new Error('找不到家目錄')
  const path = `${home}/.claude/workflow/claim-check/${await $.session.id()}.jsonl`
  const previous = (await $.fs.exists(path)) ? ((await $.fs.read(path)) as string) : ''
  await $.fs.write(path, `${previous}${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`)
}

export const register: Register = (on, options) => {
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (e.agentId === undefined) {
      const args = Object.fromEntries(Object.entries(e).filter(([key]) => !SKIPPED_INPUT_KEYS.has(key)))
      const output = result.deny !== undefined ? `已拒絕：${result.deny}` : `${result.isError ? '錯誤：' : ''}${result.text ?? ''}`
      remember(`### ${e.tool}\n輸入：${clip(JSON.stringify(args), INPUT_CHARS)}\n輸出：${clip(output, OUTPUT_CHARS)}`)
    }
    return result
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId !== undefined || e.reason !== 'answer' || e.answer.length < MIN_ANSWER_CHARS) return done
    const answeredBy = e.usage?.model ?? 'unknown'
    const prompt = [
      `## 最終回覆（${answeredBy}）`,
      e.answer,
      '',
      '## 工具證據（由舊到新，已截短）',
      evidence.length > 0 ? evidence.join('\n\n') : '（本段對話沒有記錄到工具呼叫）',
    ].join('\n')
    const started = Date.now()
    const outcome = await check($, prompt, checkersFor(answeredBy, options.checker))
    const logFailure = await record($, { answeredBy, ms: Date.now() - started, ...outcome }).then(
      () => '',
      (error: unknown) => `（檢查紀錄寫入失敗：${describe(error)}）`,
    )
    if (outcome.kind === 'ok') {
      $.ui.status(`結論檢查：通過（${outcome.checker}）${logFailure}`)
      return done
    }
    $.ui.status(undefined)
    const heading = outcome.kind === 'flagged' ? `結論檢查（${outcome.checker}）：` : '結論檢查未執行：'
    return { ...done, text: [heading, clip(outcome.text, REPORT_CHARS), logFailure].filter(Boolean).join('\n') }
  }).catch(($, e, next) => next(e))
}
