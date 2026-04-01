export const BLOCK_START = "%%ENCRYPTED_START%%";
export const BLOCK_END = "%%ENCRYPTED_END%%";
export const FILE_HEADER = "%%LOCAL_ENCRYPTOR_FILE: 已加密%%";

const blockPattern = new RegExp(
  `^\\s*${escapeForRegExp(BLOCK_START)}\\n([\\s\\S]*?)\\n${escapeForRegExp(BLOCK_END)}\\s*$`
);

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function wrapEncryptedPayload(payload: string): string {
  return `${BLOCK_START}\n${payload.trim()}\n${BLOCK_END}`;
}

export function wrapEncryptedNote(payload: string): string {
  return `${FILE_HEADER}\n${wrapEncryptedPayload(payload)}`;
}

export function unwrapEncryptedPayload(value: string): string {
  const match = value.match(blockPattern);
  if (!match) {
    throw new Error("The selected text is not a supported encrypted block.");
  }

  return match[1].trim();
}

export function containsEncryptedBlock(value: string): boolean {
  return blockPattern.test(value);
}

export function hasEncryptedNoteHeader(value: string): boolean {
  return value.trimStart().startsWith(FILE_HEADER);
}

export function isEncryptedNoteContent(value: string): boolean {
  return hasEncryptedNoteHeader(value) && containsEncryptedBlock(stripEncryptedNoteHeader(value));
}

export function stripEncryptedNoteHeader(value: string): string {
  if (!hasEncryptedNoteHeader(value)) {
    return value;
  }

  const trimmed = value.trimStart();
  return trimmed.slice(FILE_HEADER.length).trimStart();
}

export function unwrapEncryptedNote(value: string): string {
  if (!hasEncryptedNoteHeader(value)) {
    throw new Error("The current note is not marked as an encrypted note.");
  }

  return unwrapEncryptedPayload(stripEncryptedNoteHeader(value));
}
