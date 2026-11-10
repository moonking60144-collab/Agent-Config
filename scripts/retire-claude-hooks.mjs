import { readFileSync } from "node:fs";
import { removeRetiredClaudeHooks } from "./claude-workflow.mjs";

try {
  const index = process.argv.indexOf("--target-dir");
  if (index < 0 || !process.argv[index + 1]) throw new Error("usage: retire-claude-hooks.mjs --target-dir <active-claude-directory>");
  const settings = JSON.parse(readFileSync(0, "utf8").replace(/^\uFEFF/, ""));
  if (settings.hooks) settings.hooks = removeRetiredClaudeHooks(settings.hooks, process.argv[index + 1]);
  // ASCII JSON survives legacy PowerShell stdout decoding; parsing restores Unicode values.
  process.stdout.write(JSON.stringify(settings).replace(/[\u007f-\uffff]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`) + "\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
