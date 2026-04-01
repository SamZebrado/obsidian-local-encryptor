import { webcrypto } from "node:crypto";

const ALGORITHM = "AES-GCM";
const KEY_LENGTH = 256;
const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_HASH = "SHA-256";
const FORMAT_VERSION = 1;

export interface EncryptedPayload {
  version: number;
  algorithm: typeof ALGORITHM;
  kdf: "PBKDF2";
  hash: typeof PBKDF2_HASH;
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
}

const subtle = (globalThis.crypto ?? webcrypto).subtle;

function getCryptoSource(): Crypto {
  return globalThis.crypto ?? (webcrypto as unknown as Crypto);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getCryptoSource().getRandomValues(bytes);
  return bytes;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function encodeBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function decodeBase64(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value, "base64"));
}

async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const passwordBytes = new TextEncoder().encode(password);
  const baseKey = await subtle.importKey("raw", toArrayBuffer(passwordBytes), "PBKDF2", false, ["deriveKey"]);

  return subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(salt),
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH
    },
    baseKey,
    {
      name: ALGORITHM,
      length: KEY_LENGTH
    },
    false,
    ["encrypt", "decrypt"]
  );
}

function normalizePayload(payload: EncryptedPayload): EncryptedPayload {
  if (
    payload.version !== FORMAT_VERSION ||
    payload.algorithm !== ALGORITHM ||
    payload.kdf !== "PBKDF2" ||
    payload.hash !== PBKDF2_HASH ||
    payload.iterations < 100_000 ||
    !payload.salt ||
    !payload.iv ||
    !payload.ciphertext
  ) {
    throw new Error("Encrypted payload format is invalid.");
  }

  return payload;
}

export async function encryptText(text: string, password: string): Promise<string> {
  if (!password) {
    throw new Error("Password is required for encryption.");
  }

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);
  const plainBytes = new TextEncoder().encode(text);
  const ciphertext = await subtle.encrypt(
    {
      name: ALGORITHM,
      iv: toArrayBuffer(iv)
    },
    key,
    toArrayBuffer(plainBytes)
  );

  const payload: EncryptedPayload = {
    version: FORMAT_VERSION,
    algorithm: ALGORITHM,
    kdf: "PBKDF2",
    hash: PBKDF2_HASH,
    iterations: PBKDF2_ITERATIONS,
    salt: encodeBase64(salt),
    iv: encodeBase64(iv),
    ciphertext: encodeBase64(new Uint8Array(ciphertext))
  };

  return JSON.stringify(payload, null, 2);
}

export async function decryptText(encryptedData: string, password: string): Promise<string> {
  if (!password) {
    throw new Error("Password is required for decryption.");
  }

  let parsed: EncryptedPayload;
  try {
    parsed = normalizePayload(JSON.parse(encryptedData) as EncryptedPayload);
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message === "Encrypted payload format is invalid."
        ? error.message
        : "Encrypted payload is not valid JSON."
    );
  }

  const key = await deriveKey(password, decodeBase64(parsed.salt));
  try {
    const plaintext = await subtle.decrypt(
      {
        name: ALGORITHM,
        iv: toArrayBuffer(decodeBase64(parsed.iv))
      },
      key,
      toArrayBuffer(decodeBase64(parsed.ciphertext))
    );

    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Decryption failed. The password is incorrect or the data is corrupted.");
  }
}

export function getCryptoPolicy(): { iterations: number; algorithm: string; hash: string } {
  return {
    iterations: PBKDF2_ITERATIONS,
    algorithm: ALGORITHM,
    hash: PBKDF2_HASH
  };
}
