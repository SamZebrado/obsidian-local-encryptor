import test from "node:test";
import assert from "node:assert/strict";

import {
  buildNoteBundle,
  extractLocalImagePaths,
  parseDecryptedNoteBundle,
  sanitizeNoteBasename
} from "../src/noteBundle";

test("extractLocalImagePaths finds local markdown and wiki image references", () => {
  const content = [
    "![alt](./assets/pic one.png)",
    "![[../shared/图像.jpg|200]]",
    "![skip](https://example.com/image.png)",
    "![[note.md]]"
  ].join("\n");

  assert.deepEqual(extractLocalImagePaths("notes/daily/today.md", content), [
    "notes/daily/assets/pic one.png",
    "notes/shared/图像.jpg"
  ]);
});

test("buildNoteBundle and parseDecryptedNoteBundle round-trip title, content, and attachments", () => {
  const serialized = buildNoteBundle("原始标题", "# 内容", [
    { path: "assets/photo.png", dataBase64: "YWJj" }
  ]);

  const parsed = parseDecryptedNoteBundle(serialized);
  assert.equal(parsed.title, "原始标题");
  assert.equal(parsed.content, "# 内容");
  assert.deepEqual(parsed.attachments, [{ path: "assets/photo.png", dataBase64: "YWJj" }]);
});

test("parseDecryptedNoteBundle falls back to raw text for legacy payloads", () => {
  const parsed = parseDecryptedNoteBundle("legacy plaintext");
  assert.equal(parsed.title, null);
  assert.equal(parsed.content, "legacy plaintext");
  assert.deepEqual(parsed.attachments, []);
});

test("sanitizeNoteBasename removes illegal filename characters", () => {
  assert.equal(sanitizeNoteBasename('A:B/C*D?"E<F>G|'), "A_B_C_D__E_F_G_");
  assert.equal(sanitizeNoteBasename("   "), "Untitled");
});
