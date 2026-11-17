import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAgentDefinition } from '../scripts/validate-codex.mjs';

const base = { name: 'reviewer', description: 'Bounded read-only review.', developer_instructions: 'Do not edit files.' };

test('minimal agents and supported model settings are accepted', () => {
  assert.deepEqual(validateAgentDefinition(base), []);
  assert.deepEqual(validateAgentDefinition({ ...base, model: 'model-alias', model_reasoning_effort: 'high', model_reasoning_summary: 'auto', model_verbosity: 'low' }), []);
});

test('required agent fields must be nonempty strings', () => {
  for (const field of ['name', 'description', 'developer_instructions']) {
    for (const value of [undefined, '', '  ', false, 7]) {
      assert.ok(validateAgentDefinition({ ...base, [field]: value }).some(issue => issue.startsWith(field)));
    }
  }
});

test('parent-only settings and misspelled fields are rejected', () => {
  for (const field of ['sandbox_mode', 'approval_policy', 'model_provider', 'mcp_servers', 'service_tier', 'model_reasoning_effrot']) {
    assert.ok(validateAgentDefinition({ ...base, [field]: 'read-only' }).includes('unsupported custom-agent field: ' + field));
  }
});

test('feature overrides can only disable supported inherited capabilities', () => {
  const features = { shell_tool: false, apps: false, plugins: false, memories: false, request_permissions_tool: false };
  assert.deepEqual(validateAgentDefinition({ ...base, features }), []);
  for (const name of Object.keys(features)) {
    assert.ok(validateAgentDefinition({ ...base, features: { [name]: true } }).length > 0);
  }
  assert.ok(validateAgentDefinition({ ...base, features: { unknown: false } }).length > 0);
});

test('supported skill restrictions are checked structurally', () => {
  assert.deepEqual(validateAgentDefinition({ ...base, skills: { config: [{ path: '/skills/example', enabled: false }], bundled: { enabled: false }, include_instructions: false } }), []);
  for (const skills of [{ config: 'invalid' }, { config: [{ path: '/skills/example', enabled: 'false' }] }, { bundled: { enabled: true } }, { include_instructions: true }, { unknown: false }]) {
    assert.ok(validateAgentDefinition({ ...base, skills }).length > 0);
  }
});
