import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const wasmOut = join(root, "public", "lighter.wasm");
const signerDir = join(root, "signer-wasm");
const goBuildCache = join(root, ".cache", "go-build");
const goModCache = join(root, ".cache", "go-mod");
const checkDir = join(root, ".cache", "wasm-check");
const checkOut = join(checkDir, "lighter.wasm");

if (!existsSync(wasmOut)) {
  throw new Error("public/lighter.wasm does not exist. Run npm run build:wasm first.");
}

mkdirSync(goBuildCache, { recursive: true });
mkdirSync(goModCache, { recursive: true });
mkdirSync(checkDir, { recursive: true });

const goCheck = spawnSync("go", ["version"], { stdio: "ignore" });
if (goCheck.error?.code === "ENOENT") {
  throw new Error("Go is required to verify public/lighter.wasm provenance.");
}
if (goCheck.status !== 0) {
  throw new Error("Go is installed but `go version` failed.");
}

execFileSync("go", ["build", "-trimpath", "-buildvcs=false", "-ldflags=-buildid=", "-o", checkOut, "."], {
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

const committed = readFileSync(wasmOut);
const rebuilt = readFileSync(checkOut);
if (!committed.equals(rebuilt)) {
  throw new Error("public/lighter.wasm does not match a deterministic rebuild of signer-wasm.");
}

console.log("public/lighter.wasm matches a deterministic signer-wasm rebuild.");
