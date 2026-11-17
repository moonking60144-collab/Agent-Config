import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { evaluateResult, modelProvenanceForExec, parseArgs, resolveCodexRuntime, runCase, validateCases } from '../scripts/run-codex-evals.mjs';

const cases = (await readFile(new URL('../codex/evals/workflow-routing.cases.jsonl', import.meta.url), 'utf8')).trim().split('\n').map(line => JSON.parse(line));
const base = cases.find(item => item.id === 'simple_question_no_process');

function scenario(expected = [], allowed) {
  const item = { ...base, must_include: [], must_not_include: [], expected_preflight_checks: expected };
  if (allowed !== undefined) item.allowed_preflight_checks = allowed;
  return item;
}

function result(item, checks) {
  return {
    selected_process: item.expected_process,
    would_write: false,
    requires_confirmation: false,
    preflight_checks: checks,
    first_action: 'Answer the question.',
    rationale: 'Bounded task.',
  };
}

test('simple questions reject unrelated Git preflight', () => {
  const item = scenario();
  assert.deepEqual(evaluateResult(item, result(item, []), []), []);
  for (const check of ['branch', 'remote', 'uncommitted_diff', 'rollback']) {
    assert.ok(evaluateResult(item, result(item, [check]), []).includes('unexpected_preflight=' + check));
  }
});

test('required checks accept any order, reject missing and duplicate checks', () => {
  const item = scenario(['branch', 'remote']);
  assert.deepEqual(evaluateResult(item, result(item, ['remote', 'branch']), []), []);
  assert.ok(evaluateResult(item, result(item, ['branch']), []).length > 0);
  assert.ok(evaluateResult(item, result(item, ['branch', 'remote', 'branch']), []).length > 0);
});

test('bounded optional checks do not erase required checks', () => {
  const item = scenario(['uncommitted_diff'], ['branch', 'uncommitted_diff']);
  assert.deepEqual(evaluateResult(item, result(item, ['uncommitted_diff']), []), []);
  assert.deepEqual(evaluateResult(item, result(item, ['branch', 'uncommitted_diff']), []), []);
  assert.ok(evaluateResult(item, result(item, ['branch']), []).length > 0);
  assert.ok(evaluateResult(item, result(item, ['uncommitted_diff', 'remote']), []).includes('unexpected_preflight=remote'));
});

test('malformed checks fail instead of acting like an empty list', () => {
  const item = scenario();
  for (const checks of [undefined, null, 'branch', {}]) {
    assert.ok(evaluateResult(item, result(item, checks), []).includes('invalid_preflight_checks'));
  }
});

test('case contract rejects unknown, duplicate and contradictory expectations', () => {
  assert.doesNotThrow(() => validateCases(cases));
  for (const item of [scenario(['bogus']), scenario(['branch', 'branch']), scenario(['branch'], []), scenario([], ['bogus']), scenario([], ['branch', 'branch'])]) {
    assert.throws(() => validateCases([item]));
  }
});

test('review and commit cases require their actual Git baseline', () => {
  assert.deepEqual(cases.find(item => item.id === 'review_read_only').expected_preflight_checks, ['uncommitted_diff']);
  assert.deepEqual(cases.find(item => item.id === 'explicit_commit_push').expected_preflight_checks, ['branch', 'remote', 'uncommitted_diff']);
});

test('requested model aliases remain requests, never observations', () => {
  assert.deepEqual(modelProvenanceForExec('requested-alias'), {
    requested_model: 'requested-alias',
    resolved_model: 'unknown',
    model_observation_source: 'exec_jsonl_model_not_exposed',
  });
  assert.equal(modelProvenanceForExec(undefined).requested_model, null);
  assert.equal(modelProvenanceForExec(undefined).resolved_model, 'unknown');
});

test('binary override requires a value and preserves a path containing spaces', () => {
  assert.equal(parseArgs(['--run', '--codex-bin', '/App Resources/codex']).codexBin, '/App Resources/codex');
  for (const args of [['--codex-bin'], ['--codex-bin', ''], ['--codex-bin', '--run']]) {
    assert.throws(() => parseArgs(args), /--codex-bin/);
  }
});

test('missing binary overrides fail instead of using another installed Codex', async () => {
  await assert.rejects(resolveCodexRuntime('/missing-eval-runtime/codex'), /--codex-bin/);
  await assert.rejects(resolveCodexRuntime('missing-codex-runtime', { PATH: '' }), /--codex-bin/);
});

async function fakeCodex(t, { versionExit = 0 } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'codex eval '));
  t.after(() => rm(root, { recursive: true, force: true }));
  const program = path.join(root, 'runtime.mjs');
  const binary = path.join(root, 'codex');
  const expected = result(scenario(), []);
  await writeFile(program, `import fs from 'node:fs';
if (process.argv.includes('--version')) {
  console.log('codex-cli fixture-selected'); process.exit(${versionExit});
}
const output = process.argv[process.argv.indexOf('-o') + 1];
fs.writeFileSync(output, ${JSON.stringify(JSON.stringify(expected))});
console.log(JSON.stringify({type:'turn.completed'}));
`);
  const quote = value => "'" + value.replaceAll("'", "'\\''") + "'";
  await writeFile(binary, '#!/bin/sh\nexec ' + quote(process.execPath) + ' ' + quote(program) + ' "$@"\n');
  await chmod(binary, 0o755);
  return { root, binary };
}

test('version probe and eval execute the selected binary, not PATH Codex', { skip: process.platform === 'win32' }, async t => {
  const fixture = await fakeCodex(t);
  const alias = path.join(fixture.root, 'desktop-alias');
  await symlink(fixture.binary, alias);
  const decoy = path.join(fixture.root, 'decoy');
  await mkdir(decoy);
  await writeFile(path.join(decoy, 'codex'), '#!/bin/sh\nexit 79\n', { mode: 0o755 });
  const originalPath = process.env.PATH;
  t.after(() => { if (originalPath === undefined) delete process.env.PATH; else process.env.PATH = originalPath; });
  process.env.PATH = decoy;
  const runtime = await resolveCodexRuntime(alias);
  assert.equal(runtime.binary_path, await realpath(fixture.binary));
  assert.equal(runtime.version, 'codex-cli fixture-selected');
  const observed = await runCase(scenario(), 1, { timeoutMs: 10000 }, runtime);
  assert.equal(observed.pass, true, observed.failures.join('; '));
  assert.equal(observed.codex_binary, runtime.binary_path);
  assert.equal(observed.codex_version, runtime.version);
  assert.equal(observed.resolved_model, 'unknown');
});

test('default binary discovery resolves PATH and rejects a failed version probe', { skip: process.platform === 'win32' }, async t => {
  const fixture = await fakeCodex(t);
  const runtime = await resolveCodexRuntime('codex', { ...process.env, PATH: fixture.root });
  assert.equal(runtime.binary_path, await realpath(fixture.binary));
  const failing = await fakeCodex(t, { versionExit: 7 });
  await assert.rejects(resolveCodexRuntime(failing.binary), /版本查詢失敗/);
  await assert.rejects(resolveCodexRuntime(fixture.root), /找不到 Codex/);
});
