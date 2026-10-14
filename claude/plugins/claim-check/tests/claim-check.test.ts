import { expect, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const ANSWER = '已驗證：所有測試都通過，部署也完成。'.repeat(12)
const LOG = '/home/tester/.claude/workflow/claim-check/session-1.jsonl'
const COUNTS = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }

const answered = (text: string) => ({ isAnswered: true as const, text, usage: COUNTS })
const unavailable = () => ({ isAnswered: false as const, reason: 'api-error' as const, status: 404, error: 'model_not_found', usage: COUNTS })

function turn(model: string, extra: Record<string, unknown> = {}) {
  return { answer: ANSWER, durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' as const, usage: { ...COUNTS, model }, ...extra }
}

// The engine below the plugin: canned checker replies, an in-memory file system and one failing test run.
// Calls the plugin makes on `$` are answered as `{ value }`, the way the engine's own bottom answers them.
function engine(on: On, reply: (model: string) => unknown) {
  const calls: { model: string; prompt: string }[] = []
  const files = new Map<string, string>()
  on('model.complete', ($, e) => {
    calls.push({ model: e.model, prompt: e.prompt })
    return { value: reply(e.model) }
  })
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('env.get', ($, e) => ({ value: e.name === 'HOME' ? '/home/tester' : undefined }))
  on('session.id', () => ({ value: 'session-1' }))
  on('fs.exists', ($, e) => ({ value: files.has(e.path) }))
  on('fs.read', ($, e) => ({ value: files.get(e.path) ?? '' }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('ui.status', () => ({ value: undefined }))
  on('tool.call', () => ({ result: { stdout: 'FAIL 3 tests' }, text: 'FAIL 3 tests, exit 1' }))
  return { calls, files }
}

test('An Opus answer is checked by Sonnet and flagged claims appear beneath it', async ($, on) => {
  const { calls } = engine(on, () => answered('- [超出證據] 所有測試都通過：工具輸出顯示 3 個測試失敗'))
  await $.tool.call({ tool: 'Bash', command: 'npm test' })
  const done = await $.turn.complete(turn('claude-opus-5-5'))
  expect(calls.map(call => call.model)).toEqual(['sonnet'])
  expect(calls[0].prompt).toContain('FAIL 3 tests, exit 1')
  expect(calls[0].prompt).toContain(ANSWER)
  expect(done.text).toStartWith('結論檢查（sonnet）：')
  expect(done.text).toContain('工具輸出顯示 3 個測試失敗')
})

test('Every tier is checked by the tier below it', async ($, on) => {
  const { calls } = engine(on, () => answered('OK'))
  for (const model of ['claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']) {
    await $.turn.complete(turn(model))
  }
  expect(calls.map(call => call.model)).toEqual(['opus', 'sonnet', 'haiku', 'haiku'])
})

test('A passing check leaves the answer as it was', async ($, on) => {
  engine(on, () => answered('OK'))
  const done = await $.turn.complete(turn('claude-opus-5-5'))
  expect(done.text).toBe(ANSWER)
})

test('A blocked checker falls back to the next tier down', async ($, on) => {
  const { calls } = engine(on, model => (model === 'sonnet' ? unavailable() : answered('OK')))
  const done = await $.turn.complete(turn('claude-opus-5-5'))
  expect(calls.map(call => call.model)).toEqual(['sonnet', 'haiku'])
  expect(done.text).toBe(ANSWER)
})

test('When no checker is available the answer says it was not checked', async ($, on) => {
  engine(on, () => unavailable())
  const done = await $.turn.complete(turn('claude-opus-5-5'))
  expect(done.text).toStartWith('結論檢查未執行：')
  expect(done.text).toContain('model_not_found')
})

test('Subagent turns and short answers are not checked', async ($, on) => {
  const { calls } = engine(on, () => answered('OK'))
  const subagent = await $.turn.complete(turn('claude-opus-5-5', { agentId: 'agent-1' }))
  const short = await $.turn.complete(turn('claude-opus-5-5', { answer: '好。' }))
  expect(calls).toHaveLength(0)
  expect(subagent.text).toBe(ANSWER)
  expect(short.text).toBe('好。')
})

test('A fixed checker setting overrides the automatic choice', { options: { checker: 'opus' } }, async ($, on) => {
  const { calls } = engine(on, () => answered('OK'))
  await $.turn.complete(turn('claude-opus-5-5'))
  expect(calls.map(call => call.model)).toEqual(['opus'])
})

test('Every check is appended to the session log', async ($, on) => {
  const { files } = engine(on, model => (model === 'sonnet' ? answered('OK') : answered('- [矛盾] x：y')))
  await $.turn.complete(turn('claude-opus-5-5'))
  await $.turn.complete(turn('claude-fable-5-1'))
  const lines = (files.get(LOG) ?? '').trim().split('\n').map(line => JSON.parse(line))
  expect(lines).toHaveLength(2)
  expect(lines[0]).toMatchObject({ answeredBy: 'claude-opus-5-5', kind: 'ok', checker: 'sonnet' })
  expect(lines[1]).toMatchObject({ answeredBy: 'claude-fable-5-1', kind: 'flagged', checker: 'opus' })
  expect(lines[0].usage).toEqual(COUNTS)
  expect(lines[0].ms).toBeGreaterThanOrEqual(0)
})
