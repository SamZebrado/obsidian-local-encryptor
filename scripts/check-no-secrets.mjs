import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(process.cwd());
const includeDirs = ["src", "scripts", "tests", ".github"];
const includeFiles = ["README.md", "package.json", "manifest.json", "LICENSE", "SECURITY.md", "CONTRIBUTING.md"];
const patterns = [
  { name: "AWS access key", regex: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: "GitHub token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { name: "OpenAI key", regex: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { name: "Slack token", regex: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "Private key block", regex: /-----BEGIN (?:RSA|DSA|EC|OPENSSH|PGP) PRIVATE KEY-----/ }
];

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = resolve(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const filesToCheck = [
  ...includeDirs.flatMap((dir) => listFiles(resolve(root, dir))),
  ...includeFiles.map((file) => resolve(root, file)).filter((file) => {
    try {
      statSync(file);
      return true;
    } catch {
      return false;
    }
  })
];

let violations = 0;
for (const file of filesToCheck) {
  const content = readFileSync(file, "utf8");
  for (const pattern of patterns) {
    if (pattern.regex.test(content)) {
      console.error(`Potential secret detected in ${file.replace(`${root}/`, "")}: ${pattern.name}`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  process.exit(1);
}

console.log("Secret scan passed.");
