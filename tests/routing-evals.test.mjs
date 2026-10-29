import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { evaluateResult, modelProvenanceForExec, validateCases } from '../scripts/run-codex-evals.mjs';

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
