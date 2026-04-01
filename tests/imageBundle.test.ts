import test from "node:test";
import assert from "node:assert/strict";

import { buildStandaloneImageBundle, parseStandaloneImageBundle } from "../src/imageBundle";

test("standalone image bundle round-trips path, bytes, and times", () => {
  const serialized = buildStandaloneImageBundle(
    "vault/folder/pic.png",
    "pic.png",
    "YWJjZA==",
    { mtime: 111, ctime: 100 }
  );

  const parsed = parseStandaloneImageBundle(serialized);
  assert.equal(parsed.originalPath, "vault/folder/pic.png");
  assert.equal(parsed.originalName, "pic.png");
  assert.equal(parsed.dataBase64, "YWJjZA==");
  assert.equal(parsed.mtime, 111);
  assert.equal(parsed.ctime, 100);
});
