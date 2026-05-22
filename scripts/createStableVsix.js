const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8"));
const versionedVsixName = `codex-accounts-manager-${packageJson.version}.vsix`;
const versionedVsixPath = path.join(repoRoot, versionedVsixName);
const stableVsixPath = path.join(repoRoot, "codex-accounts-manager.vsix");

if (!fs.existsSync(versionedVsixPath)) {
  throw new Error(`Versioned VSIX not found: ${versionedVsixName}`);
}

fs.copyFileSync(versionedVsixPath, stableVsixPath);
console.log(`Created stable VSIX: ${path.basename(stableVsixPath)}`);
