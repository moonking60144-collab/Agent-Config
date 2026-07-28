import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LANGUAGE_KEYS = ["languages", "language_servers"];

export function detectExpectedLanguageKey(templateText) {
  const matches = LANGUAGE_KEYS.filter((key) =>
    new RegExp(`^${key}:`, "m").test(templateText),
  );

  if (matches.length !== 1) {
    throw new Error(
      `Serena template must contain exactly one language key; found: ${matches.join(", ") || "none"}`,
    );
  }

  return matches[0];
}

function parseYamlScalar(rawValue) {
  const value = rawValue.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseRegisteredProjects(configText) {
  const lines = configText.split(/\r?\n/);
  const startIndex = lines.findIndex((line) => /^projects:\s*$/.test(line));
  if (startIndex < 0) return [];

  const projects = [];
  for (const line of lines.slice(startIndex + 1)) {
    if (/^[A-Za-z_][\w-]*:\s*/.test(line)) break;
    if (/^\s*(?:#.*)?$/.test(line)) continue;

    const match = line.match(/^\s*-\s+(.+?)\s*$/);
    if (!match) break;
    projects.push(parseYamlScalar(match[1]));
  }

  return projects;
}

export function repairProjectConfigText(configText, expectedKey) {
  if (!LANGUAGE_KEYS.includes(expectedKey)) {
    throw new Error(`Unsupported Serena language key: ${expectedKey}`);
  }

  const otherKey = LANGUAGE_KEYS.find((key) => key !== expectedKey);
  const hasExpected = new RegExp(`^${expectedKey}:`, "m").test(configText);
  const hasOther = new RegExp(`^${otherKey}:`, "m").test(configText);

  if (hasExpected && hasOther) {
    throw new Error(`Project config contains both ${expectedKey} and ${otherKey}`);
  }
  if (hasExpected) {
    return { changed: false, text: configText };
  }
  if (!hasOther) {
    throw new Error(`Project config contains neither ${expectedKey} nor ${otherKey}`);
  }

  return {
    changed: true,
    text: configText.replace(new RegExp(`^${otherKey}:`, "m"), `${expectedKey}:`),
  };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || !value) {
      throw new Error("Usage: repair-serena-project-configs.mjs --template <path> --registry <path>");
    }
    args[key.slice(2)] = value;
  }
  if (!args.template || !args.registry) {
    throw new Error("Both --template and --registry are required");
  }
  return args;
}

export async function repairRegisteredProjects({ templatePath, registryPath }) {
  const [templateText, registryText] = await Promise.all([
    fs.readFile(templatePath, "utf8"),
    fs.readFile(registryPath, "utf8"),
  ]);
  const expectedKey = detectExpectedLanguageKey(templateText);
  const projects = parseRegisteredProjects(registryText);
  const result = { expectedKey, updated: [], unchanged: [], missing: [] };

  for (const projectPath of projects) {
    const configPath = path.join(projectPath, ".serena", "project.yml");
    let configText;
    try {
      configText = await fs.readFile(configPath, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        result.missing.push(configPath);
        continue;
      }
      throw error;
    }

    const repaired = repairProjectConfigText(configText, expectedKey);
    if (repaired.changed) {
      await fs.writeFile(configPath, repaired.text, "utf8");
      result.updated.push(configPath);
    } else {
      result.unchanged.push(configPath);
    }
  }

  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await repairRegisteredProjects({
    templatePath: path.resolve(args.template),
    registryPath: path.resolve(args.registry),
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
