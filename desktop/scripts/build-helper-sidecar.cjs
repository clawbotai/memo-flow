const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "../..");
const binariesDir = path.join(projectRoot, "src-tauri", "binaries");
const helperEntry = path.join(projectRoot, "helper", "server.js");

function getRustTarget() {
  return execFileSync("rustc", ["--print", "host-tuple"], {
    cwd: projectRoot,
    encoding: "utf8",
  }).trim();
}

function getPkgTarget(rustTarget) {
  switch (rustTarget) {
    case "aarch64-apple-darwin":
      return "node18-macos-arm64";
    case "x86_64-apple-darwin":
      return "node18-macos-x64";
    default:
      throw new Error(`Unsupported desktop target: ${rustTarget}`);
  }
}

function buildSidecar() {
  const rustTarget = getRustTarget();
  const pkgTarget = getPkgTarget(rustTarget);
  const outputPath = path.join(binariesDir, `memoflow-helper-${rustTarget}`);

  fs.mkdirSync(binariesDir, { recursive: true });
  fs.rmSync(outputPath, { force: true });

  execFileSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["pkg", helperEntry, "--targets", pkgTarget, "--output", outputPath],
    {
      cwd: projectRoot,
      stdio: "inherit",
    },
  );

  fs.chmodSync(outputPath, 0o755);
  console.log(`[desktop] built helper sidecar: ${outputPath}`);
}

buildSidecar();
