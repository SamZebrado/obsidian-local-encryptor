import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const patterns = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\baxios\b/,
  /\brequest\b/,
  /\bhttps?:\/\//
];

function listTypeScriptFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = resolve(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listTypeScriptFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

let violations = 0;
for (const file of listTypeScriptFiles(resolve(root, "src"))) {
  const content = readFileSync(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.test(content)) {
      console.error(`Offline violation in ${file.replace(`${root}/`, "")}: ${pattern}`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  process.exit(1);
}

console.log("Offline scan passed.");
