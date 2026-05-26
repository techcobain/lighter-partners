import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const publicDir = join(root, "public");
const wasmOut = join(publicDir, "lighter.wasm");
const signerDir = join(root, "signer-wasm");
const goBuildCache = join(root, ".cache", "go-build");
const goModCache = join(root, ".cache", "go-mod");

mkdirSync(publicDir, { recursive: true });
mkdirSync(goBuildCache, { recursive: true });
mkdirSync(goModCache, { recursive: true });

const goCheck = spawnSync("go", ["version"], { stdio: "ignore" });
if (goCheck.error?.code === "ENOENT") {
  if (existsSync(wasmOut) && existsSync(join(publicDir, "wasm_exec.js"))) {
    console.log("Go is not installed; using committed public/lighter.wasm and public/wasm_exec.js.");
    process.exit(0);
  }

  throw new Error("Go is required to build public/lighter.wasm, but no committed WASM assets were found.");
}
if (goCheck.status !== 0) {
  throw new Error("Go is installed but `go version` failed.");
}

const goRoot = execFileSync("go", ["env", "GOROOT"], { encoding: "utf8" }).trim();
copyFileSync(join(goRoot, "lib", "wasm", "wasm_exec.js"), join(publicDir, "wasm_exec.js"));

execFileSync("go", ["build", "-trimpath", "-buildvcs=false", "-ldflags=-buildid=", "-o", wasmOut, "."], {
  cwd: signerDir,
  stdio: "inherit",
  env: {
    ...process.env,
    CGO_ENABLED: "0",
    GOCACHE: goBuildCache,
    GOMODCACHE: goModCache,
    SOURCE_DATE_EPOCH: "0",
    GOOS: "js",
    GOARCH: "wasm"
  }
});
