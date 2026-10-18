import { spawnSync } from "node:child_process";
import path from "node:path";

export function spawnRipgrep(args, options = {}) {
  const configured = (options.env ?? process.env).VERIFICATION_RG;
  if (configured && !path.isAbsolute(configured)) {
    throw new Error("VERIFICATION_RG must be an absolute path to the ripgrep executable.");
  }

  const candidates = configured
    ? [configured]
    : ["rg", ...(process.platform === "darwin" ? ["/opt/homebrew/bin/rg", "/usr/local/bin/rg"] : [])];

  for (const executable of candidates) {
    const result = spawnSync(executable, args, { ...options, shell: false });
    if (result.error?.code !== "ENOENT") return result;
  }

  const install = process.platform === "darwin"
    ? "Install ripgrep with brew install ripgrep."
    : process.platform === "win32"
      ? "Install ripgrep with winget install --id BurntSushi.ripgrep.MSVC -e, then restart the launching app so it inherits the new PATH."
      : "Install ripgrep using your system package manager.";
  throw new Error(
    `Ripgrep executable not found. ${install} ` +
    "Set VERIFICATION_RG to its absolute executable path if it is installed elsewhere. " +
    "Shell aliases and functions are not executable dependencies. " +
    `Attempted: ${candidates.join(", ")}`
  );
}
