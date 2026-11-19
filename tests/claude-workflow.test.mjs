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
  "claude/hooks/check-traditional.mjs", "claude/hooks/lib/prose.mjs",
  "claude/hooks/lib/vendor/markdown-it-15.0.3.mjs", "claude/hooks/lib/vendor/LICENSE.txt", "claude/hooks/resume-handoff.mjs",
];

function run(script, args = [], input) {
  const result = spawnSync(process.execPath, [script, ...args], {
    input, encoding: "utf8", timeout: 20000, shell: false,
  });
  assert.ifError(result.error);
  return result;
}

async function fixture(t, { sourceEntrypoint = false } = {}) {
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
    deploy: () => run(path.join(sourceEntrypoint ? repoRoot : repo, "scripts/deploy-claude.mjs"), ["--home", home, "--backup-retention", "0"]),
  };
}

function hookDecision(script, message, extra = {}) {
  const result = run(script, [], JSON.stringify({ last_assistant_message: message, ...extra }));
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout) : {};
}

const hookPaths = ["check-traditional.mjs"];

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
  assert.equal(settings.hooks.Stop[0].hooks.length, 2);
  for (const name of hookPaths) {
    const script = path.join(active, "hooks", name);
    assert.deepEqual(settings.hooks.Stop[0].hooks[0].args, [script]);
    assert.equal(hookDecision(script, "這是正體中文。", {}).decision, undefined);
  }
  for (const relative of ["CLAUDE.md", ...hookPaths.map(name => `hooks/${name}`), "hooks/lib/prose.mjs", "hooks/lib/vendor/markdown-it-15.0.3.mjs", "hooks/lib/vendor/LICENSE.txt"]) {
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

function runHandoff(script, args, hostSession, event = { hook_event_name: "SessionStart", source: "startup" }) {
  const env = { ...process.env };
  delete env.CLAUDE_CODE_HOST_SESSION_ID;
  if (hostSession) env.CLAUDE_CODE_HOST_SESSION_ID = hostSession;
  const result = spawnSync(process.execPath, [script, ...args], {
    input: JSON.stringify(event),
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
  const write = async (text) => {
    await fs.writeFile(textFile, text);
    const result = runHandoff(script, ["--write", textFile], owner);
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
  const send = (host, event) => {
    const result = runHandoff(script, [], host, event);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout ? JSON.parse(result.stdout).hookSpecificOutput.additionalContext : null;
  };
  const settings = JSON.parse(await fs.readFile(path.join(active, "settings.json"), "utf8"));
  const registered = (event) => settings.hooks[event].flatMap(g => g.hooks).some(h => h.args?.includes(script));
  assert.equal(registered("UserPromptSubmit"), true);
  assert.equal(registered("SessionStart"), false);
  const abandoned = await write("ABANDONED SUMMARY");
  const wanted = await write("USE ONLY THIS SUMMARY");
  const prompt = { hook_event_name: "UserPromptSubmit", prompt: wanted.resumePrompt };
  for (const source of ["startup", "clear"]) {
    assert.equal(send(owner, { ...prompt, hook_event_name: "SessionStart", source }), null);
  }
  assert.equal(send(owner, { ...prompt, prompt: "繼續" }), null);
  assert.equal(send(owner, { ...prompt, prompt: "example: " + wanted.resumePrompt }), null);
  assert.doesNotMatch(send("another-host", prompt), /USE ONLY THIS SUMMARY/);
  assert.equal(send(undefined, prompt), null);
  await fs.utimes(wanted.path, new Date(1000), new Date(1000));
  const restored = send(owner, prompt);
  assert.match(restored, /USE ONLY THIS SUMMARY/);
  assert.doesNotMatch(restored, /ABANDONED SUMMARY/);
  // Simulate the first hook response being discarded by another blocking prompt hook.
  const retry = send(owner, prompt);
  assert.doesNotMatch(retry, /USE ONLY THIS SUMMARY/);
  assert.ok(retry.includes(JSON.stringify(wanted.path + ".consumed")));
  assert.ok(!retry.includes(abandoned.path));
  assert.equal(JSON.parse(await fs.readFile(wanted.path + ".consumed", "utf8")).content, "USE ONLY THIS SUMMARY");
  assert.ok(!send("another-host", prompt).includes(wanted.path));
  await fs.access(wanted.path + ".consumed");
  await fs.access(abandoned.path);
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
  ["four-space list fence ends before prose", ["1. item", "", "    " + t3, "    " + flagged, "    " + t3, "", flagged], true],
  ["four-space list fence protects code", ["1. item", "", "    " + t3, "    " + flagged, "    " + t3, "", "正常"], false],
  ["lazy list paragraph retains the base of a following fence", ["1. item", "lazy continuation", "", "    " + t3 + "text", "   简体代码", "    " + t3, "", "正常"], false],
  ["an empty bullet cannot interrupt running prose", ["Report", "*", "      " + flagged], true],
  ["a setext underline ends the paragraph", ["Report", "-", "    ~~~text", "   " + flagged, "    ~~~"], true],
  ["a reference-only list item has no lazy paragraph", ["- [docs]: /link", "Next paragraph", "", "    " + flagged], false],
  ["text after a reference starts a real list paragraph", ["- [docs]: /link", "  note", "Next paragraph", "", "    " + flagged], true],
  ["lazy paragraph text remains visible from its first character", ["1. item", "简體", "", "    " + t3, "   code", "    " + t3], true],
  ["prose after a lazy list fence is still checked", ["1. item", "lazy", "", "    " + t3, "   code", "    " + t3, "", flagged], true],
  ["dedented heading ends the list paragraph", ["1. item", "# Heading", "", "    " + t3, "   " + flagged, "    " + t3], true],
  ["dedented thematic break ends the list paragraph", ["1. item", "***", "", "    " + t3, "   " + flagged, "    " + t3], true],
  ["a quoted paragraph can continue after leaving a list", ["1. item", "> quote", "    " + flagged], true],
  ["a blank ends an empty item before a top-level indented block", ["1. item", "-", "", "    " + t3 + "text", "   " + flagged, "    " + t3], true],
  ["an empty item can contain an immediately following fence", ["1. item", "-", "    " + t3 + "text", "   " + flagged, "    " + t3], false],
  ["a list heading cannot start a lazy paragraph", ["1. # Heading", "outside", "", "    " + t3, "   " + flagged, "    " + t3], true],
  ["indented code does not open a top-level fence", ["    " + t3, "    " + flagged, "", flagged], true],
  ["indented continuation of a paragraph is prose", ["Paragraph wrapped manually", "    " + flagged], true],
  ["indented code after a blank line stays exempt", ["Paragraph", "", "    " + flagged], false],
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
      assert.equal(result.decision === "block", blocked, "PROSE_VISIBILITY: " + name);
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

test("Claude sync retires the previous global evidence gate and preserves foreign hooks", async (t) => {
  const { active, deploy } = await fixture(t, { sourceEntrypoint: true });
  const settingsPath = path.join(active, "settings.json");
  const settings = JSON.parse(await fs.readFile(settingsPath, "utf8"));
  const oldHook = { type: "command", command: "node", args: [path.join(active, "hooks/check-evidence.mjs")] };
  const foreign = { type: "command", command: "custom-review" };
  const oldCommand = { type: "command", command: `node "${oldHook.args[0]}"` };
  settings.hooks = { Stop: [{ hooks: [oldHook, oldCommand, foreign] }] };
  await fs.mkdir(path.dirname(oldHook.args[0]), { recursive: true });
  await fs.writeFile(oldHook.args[0], "legacy evidence sentinel\n");
  await fs.writeFile(settingsPath, JSON.stringify(settings));
  assert.equal(deploy().status, 0);
  const hooks = JSON.parse(await fs.readFile(settingsPath, "utf8")).hooks.Stop.flatMap((group) => group.hooks);
  assert.ok(hooks.some((hook) => hook.command === foreign.command));
  assert.ok(!hooks.some((hook) => hook.args?.includes(oldHook.args[0])));
  assert.ok(!hooks.some((hook) => hook.command === oldCommand.command));
  await assert.rejects(fs.access(oldHook.args[0]), { code: "ENOENT" });
  const backupDir = path.join(active, "backups", "deploy-claude");
  const backups = (await fs.readdir(backupDir)).filter(name => name.startsWith(encodeURIComponent(path.join("hooks", "check-evidence.mjs")) + "."));
  assert.equal(backups.length, 1);
  assert.equal(await fs.readFile(path.join(backupDir, backups[0]), "utf8"), "legacy evidence sentinel\n");
  assert.equal(deploy().status, 0);
  await assert.rejects(fs.access(oldHook.args[0]), { code: "ENOENT" });
});

test("Windows backup JSON retires escaped paths before a cross-machine deployment", async (t) => {
  const { active, repo, deploy } = await fixture(t);
  const targetDir = "C:\\Users\\Alice\\.claude";
  const script = `${targetDir}\\hooks\\check-evidence.mjs`;
  const foreign = { type: "command", command: "node", args: ["C:\\foreign\\check-evidence.mjs"] };
  const settings = {
    env: { SENTINEL: "正體中文資料" },
    hooks: { Stop: [{ matcher: "", hooks: [
      { type: "command", command: "node", args: [script] },
      { type: "command", command: `node "${script}"` },
      { type: "command", shell: "powershell", command: `node --no-warnings ${script}` },
      { type: "command", shell: "powershell", command: `node --no-warnings '${script}'` },
      { type: "command", command: "node", args: [script.toUpperCase()] },
      foreign,
    ] }] },
  };
  const result = run(path.join(repoRoot, "scripts", "retire-claude-hooks.mjs"), ["--target-dir", targetDir], JSON.stringify(settings));
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stdout, /[^\x00-\x7f]/);
  const cleaned = JSON.parse(result.stdout);
  assert.equal(cleaned.env.SENTINEL, settings.env.SENTINEL);
  assert.deepEqual(cleaned.hooks.Stop, [{ matcher: "", hooks: [foreign] }]);
  const templatePath = path.join(repo, "claude", "settings.json");
  const template = JSON.parse(await fs.readFile(templatePath, "utf8"));
  template.hooks.Stop.push(...cleaned.hooks.Stop, { hooks: [{ type: "command", command: "node", args: ["__CLAUDE_EVIDENCE_HOOK_PATH__"] }] });
  await fs.writeFile(templatePath, JSON.stringify(template));
  assert.equal(deploy().status, 0);
  const deployed = JSON.parse(await fs.readFile(path.join(active, "settings.json"), "utf8"));
  const registered = deployed.hooks.Stop.flatMap((group) => group.hooks);
  assert.ok(registered.some((hook) => hook.args?.includes(foreign.args[0])));
  assert.ok(!registered.some((hook) => hook.args?.includes("__CLAUDE_EVIDENCE_HOOK_PATH__")));
  await assert.rejects(fs.access(path.join(active, "hooks", "check-evidence.mjs")), { code: "ENOENT" });
});

test("backup and deployment preserve foreign same-name hooks and managed arguments", async (t) => {
  const { active, repo, deploy } = await fixture(t);
  const script = path.join(repoRoot, "scripts", "retire-claude-hooks.mjs");
  const home = path.dirname(active);
  const foreign = { type: "command", command: "node", args: [path.join(home, "personal", "check-traditional.mjs"), "--verify"] };
  const managed = { type: "command", command: process.platform === "win32" ? "NODE" : "node", args: ["--no-warnings", "--import=node:fs", "--", path.join(active, "hooks", "check-traditional.mjs"), "--flag"] };
  const argumentOnly = { type: "command", command: "node", args: ["other-tool.mjs", ...managed.args] };
  const shellManaged = { type: "command", command: `node --no-lazy "${managed.args[3]}" --after` };
  const normalized = { type: "command", command: "node", args: ["--no-lazy", "__CLAUDE_STOP_HOOK_PATH__", "--after"] };
  const input = { hooks: { Stop: [{ hooks: [foreign, managed, argumentOnly, shellManaged] }] } };
  const settings = path.join(repo, "claude", "settings.json");
  if (process.platform === "win32") {
    for (const name of ["backup.ps1", "scripts/retire-claude-hooks.mjs"]) await fs.copyFile(path.join(repoRoot, name), path.join(repo, name));
    await fs.writeFile(path.join(active, "settings.json"), JSON.stringify(input));
    const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", path.join(repo, "backup.ps1")], {
      cwd: repo, encoding: "utf8", env: { ...process.env, USERPROFILE: home, HOME: home, APPDATA: path.join(home, "AppData") },
    });
    assert.equal(result.status, 0, result.stderr);
  } else {
    const result = run(script, ["--target-dir", active], JSON.stringify(input));
    assert.equal(result.status, 0, result.stderr);
    await fs.writeFile(settings, result.stdout);
  }
  const backed = JSON.parse((await fs.readFile(settings, "utf8")).replace(/^\uFEFF/, ""));
  assert.deepEqual(backed.hooks.Stop[0].hooks, [foreign, { ...managed, args: ["--no-warnings", "--import=node:fs", "--", "__CLAUDE_STOP_HOOK_PATH__", "--flag"] }, argumentOnly, normalized]);
  // Deploy with the ordinary full template plus the exported Stop group.
  const template = JSON.parse(await fs.readFile(path.join(repoRoot, "claude/settings.json"), "utf8"));
  template.hooks.Stop = backed.hooks.Stop;
  await fs.writeFile(settings, JSON.stringify(template));
  const published = deploy();
  assert.equal(published.status, 0, published.stderr);
  const hooks = JSON.parse(await fs.readFile(path.join(active, "settings.json"), "utf8")).hooks.Stop.flatMap((g) => g.hooks);
  for (const expected of [foreign, managed, argumentOnly, { ...normalized, args: ["--no-lazy", managed.args[3], "--after"] }]) assert.equal(hooks.filter((h) => JSON.stringify(h.args) === JSON.stringify(expected.args)).length, 1);
});

test("Backup hook retirement refuses malformed JSON without partial output", () => {
  const result = run(path.join(repoRoot, "scripts", "retire-claude-hooks.mjs"), ["--target-dir", "/home/user/.claude"], "{");
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
});

test("flagged Node hooks are retired or merged by their entry script", async (t) => {
  const { active, deploy } = await fixture(t, { sourceEntrypoint: true });
  const settingsPath = path.join(active, "settings.json");
  const retired = path.join(active, "hooks", "check-evidence.mjs");
  const current = path.join(active, "hooks", "check-traditional.mjs");
  const node = (...args) => ({ type: "command", command: "node", args });
  const legacy = node("--no-warnings", retired);
  const shell = command => ({ type: "command", command });
  const old = [legacy, node("--stack-size=1536", retired), node("--no-lazy", retired), node("--trace-gc", retired),
    shell(`node --no-warnings "${retired}"`), shell(`node --stack-size=1536 "${retired}"`)];
  const foreign = [
    shell(`node "${retired}" && echo other`), shell(`node -r "${retired}" foreign.mjs`),
    node("--trace-gc=true", current), node("--help", current), node("foreign.mjs", retired), node("--require", retired, "foreign.mjs"),
    node("-e", "void 0", current), node("--check", current), node("--prof-process=yes", current),
    { type: "command", command: "other", args: ["--", retired] },
  ];
  await fs.mkdir(path.dirname(retired), { recursive: true });
  await fs.writeFile(retired, "console.log('legacy ok')");
  const before = spawnSync(process.execPath, legacy.args, { encoding: "utf8" });
  assert.equal(before.status, 0, before.stderr);
  await fs.writeFile(settingsPath, JSON.stringify({ hooks: { Stop: [{ hooks: [
    ...old, node("--no-lazy", current), shell(`node --no-warnings "${current}"`), node("--no-warnings", current), node("--require", "node:fs", "--", current),
    node("--expose-gc", "--title", "test hook", "--dns-result-order", "ipv4first", current), ...foreign,
  ] }] } }));
  for (let i = 0; i < 2; i++) {
    const result = deploy();
    assert.equal(result.status, 0, result.stderr);
    const hooks = JSON.parse(await fs.readFile(settingsPath, "utf8")).hooks.Stop.flatMap(group => group.hooks);
    assert.ok(old.every(oldHook => !hooks.some(h => JSON.stringify(h) === JSON.stringify(oldHook))), "RETIRED_SCRIPT_STILL_REGISTERED");
    assert.ok(!hooks.some(h => h.command === `node --no-warnings "${current}"`));
    assert.equal(hooks.filter(h => h.args?.includes(current) && !foreign.some(f => JSON.stringify(f) === JSON.stringify(h))).length, 1);
    for (const entry of foreign) assert.ok(hooks.some(h => JSON.stringify(h) === JSON.stringify(entry)));
    await assert.rejects(fs.access(retired), { code: "ENOENT" });
  }
});
