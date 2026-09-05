import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { discover, runPlan } from "../../codex/skills/agent-core-lite/scripts/verify-change.mjs";
import { digest } from "../../codex/skills/agent-core-lite/scripts/verification-contract.mjs";

export async function attachVerification(repo, contractPath, { gitMode = "commit", useCli = false } = {}) {
  await fs.writeFile(path.join(repo, "verification-spec.md"), "The fixture marker must be healthy.\n");
  await fs.writeFile(path.join(repo, "verification-marker.txt"), "healthy");
  await fs.writeFile(path.join(repo, "verification-probe.mjs"), 'import assert from "node:assert/strict"; import fs from "node:fs"; assert.equal(fs.readFileSync("verification-marker.txt","utf8"),"healthy","FIXTURE_MARKER_ASSERT");');
  const gitSteps = gitMode === "none" ? [] : [["init", "-q"]];
  if (gitMode === "commit") gitSteps.push(["add", "."], ["-c", "user.name=fixture", "-c", "user.email=fixture@example.test", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]);
  for (const args of gitSteps) {
    const result = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
  }
  const cli = fileURLToPath(new URL("../../codex/skills/agent-core-lite/scripts/verify-change.mjs", import.meta.url));
  let discovery;
  if (useCli) {
    const discoveryPath = contractPath.replace(/\.completion\.json$/, ".discovery.json");
    const result = spawnSync(process.execPath, [cli, "discover", "--repo", repo, "--output", discoveryPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    discovery = JSON.parse(await fs.readFile(discoveryPath, "utf8"));
  } else discovery = await discover(repo);
  const plan = { version: 1, discovery, limitations: discovery.limitations, coverage: discovery.candidates.map((name) => ({ path: name, checks: name === "verification-probe.mjs" ? ["fixture-marker"] : [], reason: "Fixture data/oracle files are consumed by the marker check or separate completion evidence validation, not claimed as executable consumers." })), checks: [{
    id: "fixture-marker", kind: "integration", command: [process.execPath, "verification-probe.mjs"], invariants: ["fixture marker persists and is read by the process consumer"], oracle: { basis: "spec", source: "verification-spec.md", reason: "Fixture control is independent of completion implementation." }, challenges: [{ id: "unhealthy", file: "verification-marker.txt", find: "healthy", replace: "broken", assertion: "FIXTURE_MARKER_ASSERT" }],
  }] };
  const receiptPath = contractPath.replace(/\.completion\.json$/, ".verification.json");
  let receipt;
  if (useCli) {
    const planPath = contractPath.replace(/\.completion\.json$/, ".verification.plan.json");
    await fs.writeFile(planPath, JSON.stringify(plan));
    const result = spawnSync(process.execPath, [cli, "run", "--repo", repo, "--plan", planPath, "--output", receiptPath], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    receipt = JSON.parse(await fs.readFile(receiptPath, "utf8"));
  } else receipt = await runPlan(plan, repo);
  assert.equal(receipt.status, "passed", receipt.errors.join("\n"));
  const serialized = JSON.stringify(receipt);
  await fs.writeFile(receiptPath, serialized);
  const contract = JSON.parse(await fs.readFile(contractPath, "utf8"));
  for (const item of contract.requiredEvidence) if (["local", "cross-boundary"].includes(item.claimScope)) item.verificationChecks = ["fixture-marker"];
  contract.verification = { artifactBase: "contract", artifact: path.basename(receiptPath), artifactSha256: digest(serialized) };
  await fs.writeFile(contractPath, JSON.stringify(contract));
  return contract.verification;
}
