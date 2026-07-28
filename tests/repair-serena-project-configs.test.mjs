import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  detectExpectedLanguageKey,
  parseRegisteredProjects,
  repairProjectConfigText,
} from "../scripts/repair-serena-project-configs.mjs";

const repoRoot = fileURLToPath(new URL("../", import.meta.url));
const scriptPath = path.join(repoRoot, "scripts", "repair-serena-project-configs.mjs");

test("detects the stable languages key from Serena template", () => {
  assert.equal(detectExpectedLanguageKey("project_name: test\nlanguages: [python]\n"), "languages");
});

test("detects the renamed language_servers key from Serena template", () => {
  assert.equal(
    detectExpectedLanguageKey("project_name: test\nlanguage_servers: [python]\n"),
    "language_servers",
  );
});

test("rejects an ambiguous Serena template", () => {
  assert.throws(
    () => detectExpectedLanguageKey("languages: [python]\nlanguage_servers: [python]\n"),
    /exactly one language key/,
  );
});

test("parses registered project paths until the next root key", () => {
  const projects = parseRegisteredProjects(
    [
      "projects:",
      "- /tmp/one",
      '- "/tmp/two with spaces"',
      "",
      "trusted_hosts:",
      "- localhost",
    ].join("\n"),
  );
  assert.deepEqual(projects, ["/tmp/one", "/tmp/two with spaces"]);
});

test("rewrites language_servers to languages without changing values", () => {
  const result = repairProjectConfigText(
    'project_name: "demo"\nlanguage_servers:\n- typescript\n',
    "languages",
  );
  assert.equal(result.changed, true);
  assert.equal(result.text, 'project_name: "demo"\nlanguages:\n- typescript\n');
});

test("rewrites languages to language_servers for a future Serena template", () => {
  const result = repairProjectConfigText(
    'project_name: "demo"\nlanguages:\n- typescript\n',
    "language_servers",
  );
  assert.equal(result.changed, true);
  assert.equal(result.text, 'project_name: "demo"\nlanguage_servers:\n- typescript\n');
});

test("leaves an already compatible project config unchanged", () => {
  const config = 'project_name: "demo"\nlanguages:\n- typescript\n';
  assert.deepEqual(repairProjectConfigText(config, "languages"), {
    changed: false,
    text: config,
  });
});

test("CLI repairs every registered project using the installed template schema", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "repair-serena-configs-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const templatePath = path.join(root, "project.template.yml");
  const registryPath = path.join(root, "serena_config.yml");
  const projectOne = path.join(root, "project-one");
  const projectTwo = path.join(root, "project two");

  await fs.mkdir(path.join(projectOne, ".serena"), { recursive: true });
  await fs.mkdir(path.join(projectTwo, ".serena"), { recursive: true });
  await fs.writeFile(templatePath, "project_name: test\nlanguages: [python]\n", "utf8");
  await fs.writeFile(
    registryPath,
    `projects:\n- ${projectOne}\n- "${projectTwo}"\n\ntrusted_hosts:\n- localhost\n`,
    "utf8",
  );
  await fs.writeFile(
    path.join(projectOne, ".serena", "project.yml"),
    "project_name: one\nlanguage_servers:\n- typescript\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(projectTwo, ".serena", "project.yml"),
    "project_name: two\nlanguages:\n- typescript\n",
    "utf8",
  );

  const execution = spawnSync(
    process.execPath,
    [scriptPath, "--template", templatePath, "--registry", registryPath],
    { encoding: "utf8" },
  );
  assert.equal(execution.status, 0, execution.stderr);

  const result = JSON.parse(execution.stdout);
  assert.equal(result.expectedKey, "languages");
  assert.deepEqual(result.updated, [path.join(projectOne, ".serena", "project.yml")]);
  assert.deepEqual(result.unchanged, [path.join(projectTwo, ".serena", "project.yml")]);
  assert.match(
    await fs.readFile(path.join(projectOne, ".serena", "project.yml"), "utf8"),
    /^languages:/m,
  );
});
