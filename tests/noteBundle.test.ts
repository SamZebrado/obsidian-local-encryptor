import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAttachmentLookupCandidates,
  buildNoteBundle,
  extractLocalImagePaths,
  extractLocalImageTargets,
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

test("extractLocalImageTargets preserves raw local targets for later vault resolution", () => {
  const content = [
    "![[Pasted image 2026-04-01 10.00.00.png]]",
    "[[相册/封面.webp]]",
    "![alt](../assets/%E5%9B%BE%E7%89%87%201.png)"
  ].join("\n");

  assert.deepEqual(extractLocalImageTargets(content), [
    { source: "wiki", target: "Pasted image 2026-04-01 10.00.00.png" },
    { source: "wiki", target: "相册/封面.webp" },
    { source: "markdown", target: "../assets/%E5%9B%BE%E7%89%87%201.png" }
  ]);
});

test("extractLocalImagePaths also accepts plain wiki links to image files", () => {
  const content = [
    "[[gallery/photo.jpeg]]",
    "[[docs/readme]]"
  ].join("\n");

  assert.deepEqual(extractLocalImagePaths("notes/daily/today.md", content), [
    "notes/daily/gallery/photo.jpeg"
  ]);
});

test("buildNoteBundle and parseDecryptedNoteBundle round-trip title, content, and attachments", () => {
  const serialized = buildNoteBundle("原始标题", "# 内容", [
    { path: "assets/photo.png", dataBase64: "YWJj", mtime: 111, ctime: 100 }
  ], { mtime: 333, ctime: 222 });

  const parsed = parseDecryptedNoteBundle(serialized);
  assert.equal(parsed.title, "原始标题");
  assert.equal(parsed.content, "# 内容");
  assert.deepEqual(parsed.attachments, [{ path: "assets/photo.png", dataBase64: "YWJj", mtime: 111, ctime: 100 }]);
  assert.deepEqual(parsed.noteTimestamps, { mtime: 333, ctime: 222 });
});

test("parseDecryptedNoteBundle falls back to raw text for legacy payloads", () => {
  const parsed = parseDecryptedNoteBundle("legacy plaintext");
  assert.equal(parsed.title, null);
  assert.equal(parsed.content, "legacy plaintext");
  assert.deepEqual(parsed.attachments, []);
  assert.deepEqual(parsed.noteTimestamps, {});
});

test("sanitizeNoteBasename removes illegal filename characters", () => {
  assert.equal(sanitizeNoteBasename('A:B/C*D?"E<F>G|'), "A_B_C_D__E_F_G_");
  assert.equal(sanitizeNoteBasename("   "), "Untitled");
});

test("buildAttachmentLookupCandidates includes metadata and relative candidates", () => {
  assert.deepEqual(
    buildAttachmentLookupCandidates(
      "notes/daily/today.md",
      "../assets/%E5%9B%BE%E7%89%87%201.png",
      "Attachments/图片 1.png"
    ),
    [
      "Attachments/图片 1.png",
      "../assets/图片 1.png",
      "notes/assets/图片 1.png"
    ]
  );
});

test("attachment bytes survive bundle serialization exactly", () => {
  const bytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3, 4]);
  const base64 = Buffer.from(bytes).toString("base64");
  const serialized = buildNoteBundle("图", "正文", [
    { path: "assets/test.png", dataBase64: base64, mtime: 999 }
  ]);

  const parsed = parseDecryptedNoteBundle(serialized);
  const restored = Uint8Array.from(Buffer.from(parsed.attachments[0].dataBase64, "base64"));
  assert.deepEqual([...restored], [...bytes]);
  assert.equal(parsed.attachments[0].mtime, 999);
});
