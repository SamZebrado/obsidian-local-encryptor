import test from "node:test";
import assert from "node:assert/strict";

import { decryptText, encryptText, getCryptoPolicy } from "../src/crypto";

test("encryptText and decryptText round-trip plaintext", async () => {
  const plaintext = "private note\nsecond line";
  const password = "correct horse battery staple";

  const encrypted = await encryptText(plaintext, password);
  const parsed = JSON.parse(encrypted) as Record<string, unknown>;

  assert.equal(parsed.algorithm, "AES-GCM");
  assert.equal(parsed.kdf, "PBKDF2");
  assert.equal(typeof parsed.iv, "string");
  assert.equal(typeof parsed.salt, "string");
  assert.equal(typeof parsed.ciphertext, "string");

  const decrypted = await decryptText(encrypted, password);
  assert.equal(decrypted, plaintext);
});

test("decryptText rejects a wrong password", async () => {
  const encrypted = await encryptText("top secret", "password-1");

  await assert.rejects(
    () => decryptText(encrypted, "password-2"),
    /incorrect or the data is corrupted/i
  );
});

test("crypto policy enforces a modern PBKDF2 iteration count", () => {
  const policy = getCryptoPolicy();
  assert.equal(policy.algorithm, "AES-GCM");
  assert.equal(policy.hash, "SHA-256");
  assert.ok(policy.iterations >= 100_000);
});

test("encryptText and decryptText support randomized multilingual plaintext", async () => {
  const latin = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const hanzi = "隐私安全加密恢复验证文件夹笔记测试随机中文内容苹果钥匙串";
  const hiraganaKatakana = "こんにちはありがとうテストノートカギ";
  const hangul = "안전암호화복구검증파일메모테스트";
  const cyrillic = "Безопасностьшифрованиепроверказаметка";
  const arabic = "خصوصيةتشفيراستعادةتحققملفمجلد";
  const accents = "áéíóúñüçàèìòù";
  const punctuation = " ，。！？;:-_[](){}«»\n\t";
  const pools = [latin, hanzi, hiraganaKatakana, hangul, cyrillic, arabic, accents, punctuation];

  for (let index = 0; index < 18; index += 1) {
    const length = 40 + Math.floor(Math.random() * 60);
    let plaintext = "";
    for (let cursor = 0; cursor < length; cursor += 1) {
      const pool = pools[Math.floor(Math.random() * pools.length)];
      plaintext += pool[Math.floor(Math.random() * pool.length)];
    }

    const password = `pw-${index}-${Math.random().toString(36).slice(2)}-混合-암호`;
    const encrypted = await encryptText(plaintext, password);
    const decrypted = await decryptText(encrypted, password);
    assert.equal(decrypted, plaintext);
  }
});
