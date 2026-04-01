import test from "node:test";
import assert from "node:assert/strict";

import { buildFolderBatchManifest, buildTimestampManifest } from "../src/manifest";

test("buildTimestampManifest captures note and attachment times", () => {
  const manifest = buildTimestampManifest(
    "notes/plain.md",
    "notes/标题1.md",
    "plain",
    { mtime: 300, ctime: 200 },
    [
      { path: "assets/a.png", dataBase64: "AA==", mtime: 123, ctime: 100 }
    ],
    [{ target: "missing.png", reason: "image reference could not be resolved" }]
  );

  assert.equal(manifest.kind, "local-encryptor-timestamps");
  assert.equal(manifest.originalNotePath, "notes/plain.md");
  assert.equal(manifest.encryptedNotePath, "notes/标题1.md");
  assert.equal(manifest.originalTitle, "plain");
  assert.deepEqual(manifest.noteTimestamps, { mtime: 300, ctime: 200 });
  assert.deepEqual(manifest.attachments, [{ path: "assets/a.png", mtime: 123, ctime: 100 }]);
  assert.deepEqual(manifest.skippedAttachments, [{ target: "missing.png", reason: "image reference could not be resolved" }]);
});

test("buildFolderBatchManifest records encrypted folder placeholders", () => {
  const manifest = buildFolderBatchManifest("vault/root", [
    { originalRelativePath: "子目录", encryptedRelativePath: "目录1" }
  ]);

  assert.equal(manifest.kind, "local-encryptor-folder-manifest");
  assert.equal(manifest.rootFolderPath, "vault/root");
  assert.deepEqual(manifest.folderRenames, [
    { originalRelativePath: "子目录", encryptedRelativePath: "目录1" }
  ]);
});
