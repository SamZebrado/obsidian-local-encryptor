import { copyFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const releaseDir = resolve(root, "release", "local-encryptor");

mkdirSync(releaseDir, { recursive: true });

for (const file of ["manifest.json", "main.js", "README.md"]) {
  copyFileSync(resolve(root, file), resolve(releaseDir, file));
}

console.log(`Packaged plugin to ${releaseDir}`);
