import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceFiles = [
  "scripts/deploy-claude.mjs", "scripts/claude-workflow.mjs", "claude/settings.json", "claude/CLAUDE.md",
  "claude/hooks/check-traditional.mjs", "claude/hooks/check-evidence.mjs", "claude/hooks/lib/prose.mjs",
  "claude/hooks/resume-handoff.mjs",
];

function run(script, args = [], input) {
  const result = spawnSync(process.execPath, [script, ...args], {
    input, encoding: "utf8", timeout: 20000, shell: false,
  });
  assert.ifError(result.error);
  return result;
}

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "claude-workflow-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const repo = path.join(root, "repo");
  const home = path.join(root, "home with spaces");
  const active = path.join(home, ".claude");
  for (const relative of sourceFiles) {
    await fs.mkdir(path.dirname(path.join(repo, relative)), { recursive: true });
    await fs.copyFile(path.join(repoRoot, relative), path.join(repo, relative));
  }
  for (const name of ["skills", "hooks", "agents"]) {
    await fs.cp(path.join(repoRoot, "codex", name), path.join(repo, "codex", name), { recursive: true });
  }
  await fs.mkdir(active, { recursive: true });
  await fs.writeFile(path.join(active, "settings.json"), JSON.stringify({
    model: "local-model-sentinel", permissions: { defaultMode: "auto", allow: ["Read"] },
    env: { WORKFLOW_TEST_SENTINEL: "preserve" },
  }));
  await fs.writeFile(path.join(active, "CLAUDE.md"), "existing instructions\n");
  return {
    repo, active,
    deploy: () => run(path.join(repo, "scripts/deploy-claude.mjs"), ["--home", home, "--backup-retention", "0"]),
  };
}

function hookDecision(script, message, extra = {}) {
  const result = run(script, [], JSON.stringify({ last_assistant_message: message, ...extra }));
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

const hookPaths = ["check-traditional.mjs", "check-evidence.mjs"];

test("Claude deployment preserves local settings, dependencies and repeatability", async (t) => {
  const { active, deploy } = await fixture(t);
  const result = deploy();
  assert.equal(result.status, 0, result.stderr);
  const settingsPath = path.join(active, "settings.json");
  const first = await fs.readFile(settingsPath, "utf8");
  const settings = JSON.parse(first);
  assert.equal(settings.model, "local-model-sentinel");
  assert.equal(settings.permissions.defaultMode, "auto");
  assert.deepEqual(settings.permissions.allow, ["Read"]);
  assert.equal(settings.env.WORKFLOW_TEST_SENTINEL, "preserve");
  assert.equal(settings.hooks.Stop[0].hooks.length, 3);
  for (const [index, name] of hookPaths.entries()) {
    const script = path.join(active, "hooks", name);
    assert.deepEqual(settings.hooks.Stop[0].hooks[index].args, [script]);
    assert.equal(hookDecision(script, "這是正體中文。", {}).decision, undefined);
  }
  for (const relative of ["CLAUDE.md", ...hookPaths.map(name => `hooks/${name}`), "hooks/lib/prose.mjs"]) {
    assert.deepEqual(await fs.readFile(path.join(active, relative)), await fs.readFile(path.join(repoRoot, "claude", relative)));
  }
  const backups = await fs.readdir(path.join(active, "backups/deploy-claude"));
  assert.ok(backups.some(name => name.startsWith("settings.json.") && name.endsWith(".bak")));
  assert.ok(backups.some(name => name.startsWith("CLAUDE.md.") && name.endsWith(".bak")));
  const repeat = deploy();
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.equal(await fs.readFile(settingsPath, "utf8"), first);
});

test("Claude deployment preserves legal handlers without args", async (t) => {
  const { repo, active, deploy } = await fixture(t);
  const templatePath = path.join(repo, "claude/settings.json");
  const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
  const extra = [
    { type: "command", command: "printf hook-complete" },
    { type: "prompt", prompt: "Check whether the requested work is complete." },
  ];
  template.hooks.Stop[0].hooks.push(...extra);
  await fs.writeFile(templatePath, JSON.stringify(template));
  const result = deploy();
  assert.equal(result.status, 0, result.stderr);
  const settingsPath = path.join(active, "settings.json");
  const first = await fs.readFile(settingsPath, "utf8");
  const settings = JSON.parse(first);
  assert.deepEqual(settings.hooks.Stop[0].hooks.slice(-extra.length), extra);
  const repeat = deploy();
  assert.equal(repeat.status, 0, repeat.stderr);
  assert.equal(await fs.readFile(settingsPath, "utf8"), first);
});

async function instructionFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== "vendor") files.push(...await instructionFiles(target));
    else if (entry.isFile() && entry.name.endsWith(".md") && entry.name !== "claude-code-mirror-audit.md") files.push(target);
  }
  return files;
}

test("Claude deployment publishes the shared workflow and keeps foreign hooks", async (t) => {
  const { active, deploy } = await fixture(t);
  const settingsPath = path.join(active, "settings.json");
  const seeded = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  const foreign = { type: "command", command: "node", args: ["/opt/custom/foreign-hook.mjs"] };
  seeded.hooks = { PreToolUse: [{ matcher: "Bash", hooks: [foreign] }], Stop: [{ hooks: [foreign] }] };
  await fs.writeFile(settingsPath, JSON.stringify(seeded));
  const result = deploy();
  assert.equal(result.status, 0, result.stderr);
  const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  assert.deepEqual(settings.hooks.PreToolUse, [{ matcher: "Bash", hooks: [foreign] }]);
  assert.deepEqual(settings.hooks.Stop[0], { hooks: [foreign] });
  const registered = Object.values(settings.hooks).flat().flatMap((group) => group.hooks).flatMap((hook) => hook.args ?? []);
  for (const name of ["record-session-provenance.mjs", "resume-project-ledger.mjs", "guard-project-completion.mjs", "resume-handoff.mjs"]) {
    const script = path.join(active, "hooks", name);
    assert.ok(registered.includes(script), name);
    await fs.access(script);
  }
  const skills = ["agent-core-engine", "agent-core-lite", "agent-core-project", "agent-failure-debugging", "repo-onboarding-audit", "review", "frontend-ui-designer", "task-handoff"];
  for (const name of skills) await fs.access(path.join(active, "skills", name, "SKILL.md"));
  const handoff = await fs.readFile(path.join(active, "skills", "task-handoff", "SKILL.md"), "utf8");
  const handoffSource = await fs.readFile(path.join(repoRoot, "codex", "skills", "task-handoff", "SKILL.md"), "utf8");
  assert.ok(handoff.startsWith(handoffSource), "cross-agent skill must keep both Codex and Claude Code wording");
  for (const file of await instructionFiles(path.join(active, "skills"))) {
    const content = await fs.readFile(file, "utf8");
    assert.doesNotMatch(content, /~\/\.codex\//, file);
    if (!file.includes(`${path.sep}task-handoff${path.sep}`)) assert.doesNotMatch(content, /Codex|config\.toml|AGENTS(?!\.md)/, file);
  }
  for (const name of ["explorer", "reviewer"]) {
    assert.match(await fs.readFile(path.join(active, "agents", `${name}.md`), "utf8"), /^tools: Read, Glob, Grep$/m);
  }
});

function runHandoff(script, args, hostSession) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_HOST_SESSION_ID;
  if (hostSession) env.CLAUDE_CODE_HOST_SESSION_ID = hostSession;
  const result = spawnSync(process.execPath, [script, ...args], {
    input: JSON.stringify({ hook_event_name: "SessionStart", source: "startup" }),
    encoding: "utf8", timeout: 20000, shell: false, env,
  });
  assert.ifError(result.error);
  return result;
}

test("Handoff hook delivers a session's handoff once, only to that session, at any age", async (t) => {
  const { active, deploy } = await fixture(t);
  assert.equal(deploy().status, 0);
  const script = path.join(active, "hooks", "resume-handoff.mjs");
  const textFile = path.join(active, "..", "handoff.md");
  const owner = "local_handoff-owner";
  const handoff = path.join(active, "workflow", "handoffs", `${owner}.json`);
  const write = async (text) => {
    await fs.writeFile(textFile, text);
    const result = runHandoff(script, ["--write", textFile], owner);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(path.basename(result.stdout.trim()), `${owner}.json`);
    await fs.access(handoff);
  };
  const start = (hostSession) => {
    const result = runHandoff(script, [], hostSession);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim() ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : null;
  };
  const windowsPath = "C:\\Users\\moonk\\專案";
  await write(`FIRST_HANDOFF ${windowsPath}`);
  // Desktop cold-starts the cleared conversation only on the next message, so age must not matter.
  const old = new Date(Date.now() - 3 * 60 * 60 * 1000);
  await fs.utimes(handoff, old, old);
  assert.equal(start("local_other-session"), null);
  assert.equal(start(undefined), null);
  assert.ok(start(owner).includes(`FIRST_HANDOFF ${windowsPath}`));
  await fs.access(`${handoff}.consumed`);
  assert.equal(start(owner), null);
  await write("SECOND_HANDOFF");
  assert.match(start(owner), /SECOND_HANDOFF/);
});

test("Handoff writer refuses without a host session or handoff text", async (t) => {
  const { active, deploy } = await fixture(t);
  assert.equal(deploy().status, 0);
  const script = path.join(active, "hooks", "resume-handoff.mjs");
  const textFile = path.join(active, "..", "handoff.md");
  await fs.writeFile(textFile, "HANDOFF");
  assert.notEqual(runHandoff(script, ["--write", textFile], undefined).status, 0);
  await fs.writeFile(textFile, "  \n");
  assert.notEqual(runHandoff(script, ["--write", textFile], "local_handoff-owner").status, 0);
  await assert.rejects(fs.access(path.join(active, "workflow", "handoffs")));
});

test("A missing Claude helper fails before publishing active settings", async (t) => {
  const { repo, active, deploy } = await fixture(t);
  const before = await fs.readFile(path.join(active, "settings.json"), "utf8");
  await fs.rm(path.join(repo, "claude/hooks/lib/prose.mjs"));
  const result = deploy();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT/);
  assert.equal(await fs.readFile(path.join(active, "settings.json"), "utf8"), before);
  assert.equal(await fs.readFile(path.join(active, "CLAUDE.md"), "utf8"), "existing instructions\n");
});

test("Malformed Claude settings do not replace existing instructions", async (t) => {
  const { active, deploy } = await fixture(t);
  await fs.writeFile(path.join(active, "settings.json"), "{");
  const result = deploy();
  assert.notEqual(result.status, 0);
  assert.equal(await fs.readFile(path.join(active, "CLAUDE.md"), "utf8"), "existing instructions\n");
});

const tick = String.fromCharCode(96);
const t3 = tick.repeat(3);
const t4 = tick.repeat(4);
const flagged = "简体，建議改成 12 支。";
const fences = [
  ["tilde outside backticks", ["~~~markdown", t3 + "text", flagged, t3, "~~~"], false],
  ["backticks outside tildes", [t3 + "markdown", "~~~text", flagged, "~~~", t3], false],
  ["shorter backticks are not a closing fence", [t4 + "markdown", t3, flagged, t3, t4], false],
  ["shorter tildes are not a closing fence", ["~~~~markdown", "~~~", flagged, "~~~", "~~~~"], false],
  ["closing fence cannot have an info string", [t3 + "text", t3 + "not-a-close", flagged, t3], false],
  ["outside prose remains checked", [t3, "code", t3, flagged], true],
  ["longer closing fence is accepted", [t3, "code", t4, flagged], true],
  ["closing whitespace is accepted", ["~~~text", "code", "  ~~~~ \t", flagged], true],
  ["four-space indentation cannot close backticks", [t3 + "text", "    " + t3, flagged, t3], false],
  ["four-space indentation cannot close tildes", ["~~~text", "    ~~~", flagged, "~~~"], false],
  ["tab indentation cannot close a fence", [t3 + "text", "\t" + t3, flagged, t3], false],
  ["three-space indentation can close a fence", [t3, "code", "   " + t3, flagged], true],
  ["unclosed fence retains existing fail-open behavior", [t3 + "text", flagged], false],
];
for (const hook of hookPaths) {
  for (const [name, lines, blocked] of fences) {
    test(`${hook}: ${name}`, () => {
      const result = hookDecision(path.join(repoRoot, "claude/hooks", hook), lines.join("\n"));
      assert.equal(result.decision === "block", blocked);
    });
  }
  test(`${hook}: stop continuation cannot loop`, () => {
    const result = hookDecision(path.join(repoRoot, "claude/hooks", hook), flagged, { stop_hook_active: true });
    assert.equal(result.decision, undefined);
  });
}

test("Traditional hook accepts legitimate Traditional characters", () => {
  const result = hookDecision(path.join(repoRoot, "claude/hooks/check-traditional.mjs"), "這個方案划算，但資金拮据。");
  assert.equal(result.decision, undefined);
});

test("Evidence heuristic requires attribution in the action paragraph", () => {
  const script = path.join(repoRoot, "claude/hooks/check-evidence.mjs");
  for (const message of ["建議改成 12 支。", "這是公式欄位，建議改成 12 支。", "建議改成 12 支。\n\n已確認事實：其他欄位正常。"]) {
    assert.equal(hookDecision(script, message).decision, "block");
  }
  for (const message of ["依欄位定義，建議改成 12 支。", "這是推論，建議改成 12 支。", "目前共有 12 支。"]) {
    assert.equal(hookDecision(script, message).decision, undefined);
  }
});
