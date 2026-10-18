import { promises as fs } from "node:fs";
import path from "node:path";

const skillNames = [
  "agent-core-engine", "agent-core-lite", "agent-core-project",
  "agent-failure-debugging", "repo-onboarding-audit", "review", "frontend-ui-designer",
  "task-handoff",
];
// These skills describe Codex and Claude Code side by side, so product names and paths are published verbatim.
const crossAgentSkills = new Set(["task-handoff"]);
const generatedNote = "\n<!-- Generated from Config/codex/skills; edit the shared source, then deploy. -->\n";
const projectHooks = [
  "project-ledger-lib.mjs", "record-session-provenance.mjs",
  "resume-project-ledger.mjs", "guard-project-completion.mjs",
  "validate-project-ledger.mjs", "project-ledger-completion.schema.json",
];

function replaceRequired(text, from, to) {
  if (!text.includes(from)) throw new Error(`Claude adapter source changed: ${from}`);
  return text.replaceAll(from, to);
}

function adaptInstructions(text, relativePath) {
  if (crossAgentSkills.has(relativePath.split("/")[0])) {
    return relativePath.endsWith("/SKILL.md") ? text + generatedNote : text;
  }
  if (relativePath === "repo-onboarding-audit/SKILL.md") {
    text = replaceRequired(text,
      "- 先讀 AGENTS.md、README 與鄰近專案規則。只有使用者明確要求比較或匯入其他 agent 慣例時才讀 CLAUDE.md；不能把它當成 Codex 的適用規範。",
      "- 先讀 CLAUDE.md、README 與本次實際載入的專案規則。AGENTS.md 只有載入鏈確實包含，或使用者明確要求比較其他 agent 慣例時才參考；未載入的文件不自動視為適用規範。");
  }
  if (relativePath === "agent-core-engine/SKILL.md") {
    text = replaceRequired(text, "更新全域 AGENTS／skills／templates", "更新全域 CLAUDE.md／skills／templates");
    text = replaceRequired(text, "3. config.toml 只更新簡短的 skill 路由指令。",
      "3. settings.json 不放 skill 路由；路由只靠 skill description 與 CLAUDE.md 的簡短規則。");
  }
  text = text.replaceAll("~/.codex/projects/", "~/.claude/workflow/projects/")
    .replaceAll("~/.codex/skills/", "~/.claude/skills/")
    .replaceAll("~/.codex/hooks/", "~/.claude/hooks/")
    .replaceAll("~/.codex/AGENTS.md", "~/.claude/CLAUDE.md");
  if (relativePath !== "repo-onboarding-audit/SKILL.md") {
    text = text.replaceAll("AGENTS.md", "CLAUDE.md");
  }
  text = text.replaceAll("Codex", "Claude Code");
  if (relativePath.endsWith("/SKILL.md")) text += generatedNote;
  return text;
}

function adaptProjectHook(text, name) {
  if (name === "project-ledger-lib.mjs") {
    text = replaceRequired(text, 'import path from "node:path";',
      'import path from "node:path";\nimport { fileURLToPath } from "node:url";\nconst workflowProjects = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "workflow", "projects");');
    text = replaceRequired(text, 'path.join(os.homedir(), ".codex", "projects", slug)', 'path.join(workflowProjects, slug)');
    text = replaceRequired(text, 'path.join(os.homedir(), ".codex", "projects")', 'workflowProjects');
    text = text.replaceAll('", ".codex", "ledgers"', '", ".claude", "ledgers"')
      .replaceAll(', ".codex", "ledgers"', ', ".claude", "ledgers"')
      .replaceAll(', "codex", "ledgers"', ', "claude", "ledgers"');
  }
  if (name === "record-session-provenance.mjs") {
    text = replaceRequired(text, 'import os from "node:os";', 'import { fileURLToPath } from "node:url";');
    text = replaceRequired(text, 'process.env.CODEX_HOME || path.join(os.homedir(), ".codex")',
      'path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")');
    text = replaceRequired(text, '["AGENTS.override.md", "AGENTS.md"]', '["CLAUDE.md", ".claude/CLAUDE.md"]');
    text = replaceRequired(text, 'execFileSync("codex",', 'execFileSync("claude",');
    text = text.replaceAll("codexVersion", "claudeCliVersion")
      .replaceAll('"config.toml"', '"settings.json"')
      .replaceAll('"hooks.json"', '"settings.json"')
      .replaceAll("Codex hooks expose active files and lifecycle input, not native skill/reference activation telemetry.",
        "Observed standard instruction files are candidates, not the complete resolved instruction chain. The CLI version is not proof of the Desktop runtime version. Hook input does not prove skill/reference activation.");
  }
  return text;
}

export async function prepareClaudeWorkflow(repoRoot, targetDir) {
  const files = [];
  async function collect(directory, relativeDirectory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      const source = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Refusing shared skill symlink: ${source}`);
      if (entry.isDirectory()) {
        await collect(source, relativePath);
      } else if (entry.isFile()) {
        let content = await fs.readFile(source);
        // Upstream vendor assets and historical evidence remain byte-for-byte intact.
        if (relativePath.endsWith(".md") && !relativePath.includes("/vendor/") &&
            !relativePath.endsWith("/claude-code-mirror-audit.md")) {
          content = adaptInstructions(content.toString("utf8"), relativePath);
        }
        files.push({ target: path.join(targetDir, "skills", relativePath), content });
      }
    }
  }
  for (const name of skillNames) await collect(path.join(repoRoot, "codex", "skills", name), name);
  for (const name of projectHooks) {
    const source = await fs.readFile(path.join(repoRoot, "codex", "hooks", name), "utf8");
    files.push({ target: path.join(targetDir, "hooks", name), content: adaptProjectHook(source, name) });
  }
  for (const name of ["explorer", "reviewer"]) {
    const source = await fs.readFile(path.join(repoRoot, "codex", "agents", `${name}.toml`), "utf8");
    const description = source.match(/^description = (".*")$/m)?.[1];
    const instructions = source.match(/developer_instructions = """\r?\n([\s\S]*?)"""/)?.[1];
    if (!description || !instructions) throw new Error(`Cannot adapt agent: ${name}`);
    files.push({ target: path.join(targetDir, "agents", `${name}.md`), content:
      `---\nname: ${name}\ndescription: ${description}\ntools: Read, Glob, Grep\n---\n\n${instructions.trim()}\n\nUse the supplied artifacts for command/runtime evidence; ask the parent to obtain any missing evidence. Do not claim commands were executed.\n` });
  }
  return { files, skillNames };
}

export function mergeClaudeHooks(existing, managed, targetDir) {
  const owned = new Set([
    "check-traditional.mjs", "check-evidence.mjs", "record-session-provenance.mjs",
    "resume-project-ledger.mjs", "guard-project-completion.mjs",
  ].map((name) => path.join(targetDir, "hooks", name)));
  // Hooks identical to a template entry were published by an earlier deploy, even without args.
  const templateHooks = new Set(Object.values(managed).flat().flatMap((group) => group.hooks).map((hook) => JSON.stringify(hook)));
  const result = {};
  for (const [event, groups] of Object.entries(existing ?? {})) {
    result[event] = groups.map((group) => ({ ...group, hooks: group.hooks.filter((hook) => {
      if (templateHooks.has(JSON.stringify(hook))) return false;
      if (Array.isArray(hook.args)) return !hook.args.some((argument) => owned.has(argument));
      return ![...owned].some((file) => hook.command === `node "${file}"`);
    }) })).filter((group) => group.hooks.length);
  }
  for (const [event, groups] of Object.entries(managed)) {
    result[event] = [...(result[event] ?? []), ...groups];
  }
  return result;
}
