import test from "node:test";
import assert from "node:assert/strict";

import {
  BLOCK_END,
  BLOCK_START,
  containsEncryptedBlock,
  FILE_HEADER,
  hasEncryptedNoteHeader,
  isEncryptedNoteContent,
  unwrapEncryptedNote,
  unwrapEncryptedPayload,
  wrapEncryptedNote,
  wrapEncryptedPayload
} from "../src/encryptedBlock";

test("wrapEncryptedPayload produces the expected block markers", () => {
  const payload = "{\"ciphertext\":\"abc\"}";
  const wrapped = wrapEncryptedPayload(payload);

  assert.equal(wrapped.startsWith(BLOCK_START), true);
  assert.equal(wrapped.endsWith(BLOCK_END), true);
  assert.equal(unwrapEncryptedPayload(wrapped), payload);
});

test("containsEncryptedBlock only matches complete encrypted blocks", () => {
  const block = wrapEncryptedPayload("{\"ciphertext\":\"abc\"}");

  assert.equal(containsEncryptedBlock(block), true);
  assert.equal(containsEncryptedBlock("plain text"), false);
});

test("unwrapEncryptedPayload rejects malformed selections", () => {
  assert.throws(() => unwrapEncryptedPayload("not a block"), /not a supported encrypted block/i);
});

test("wrapEncryptedNote adds a file-level encrypted marker", () => {
  const payload = "{\"ciphertext\":\"abc\"}";
  const wrapped = wrapEncryptedNote(payload);

  assert.equal(wrapped.startsWith(FILE_HEADER), true);
  assert.equal(hasEncryptedNoteHeader(wrapped), true);
  assert.equal(isEncryptedNoteContent(wrapped), true);
  assert.equal(unwrapEncryptedNote(wrapped), payload);
});
