export interface StandaloneImageBundle {
  kind: "local-encryptor-standalone-image";
  version: 1;
  originalPath: string;
  originalName: string;
  dataBase64: string;
  mtime?: number;
  ctime?: number;
}

export const STANDALONE_IMAGE_EXTENSION = "local-encryptor-image";

export function buildStandaloneImageBundle(
  originalPath: string,
  originalName: string,
  dataBase64: string,
  times: { mtime?: number; ctime?: number } = {}
): string {
  const payload: StandaloneImageBundle = {
    kind: "local-encryptor-standalone-image",
    version: 1,
    originalPath,
    originalName,
    dataBase64,
    mtime: times.mtime,
    ctime: times.ctime
  };

  return JSON.stringify(payload);
}

export function parseStandaloneImageBundle(value: string): StandaloneImageBundle {
  const parsed = JSON.parse(value) as Partial<StandaloneImageBundle>;
  if (
    parsed.kind !== "local-encryptor-standalone-image" ||
    parsed.version !== 1 ||
    typeof parsed.originalPath !== "string" ||
    typeof parsed.originalName !== "string" ||
    typeof parsed.dataBase64 !== "string"
  ) {
    throw new Error("Invalid standalone image bundle.");
  }

  return {
    kind: parsed.kind,
    version: parsed.version,
    originalPath: parsed.originalPath,
    originalName: parsed.originalName,
    dataBase64: parsed.dataBase64,
    mtime: parsed.mtime,
    ctime: parsed.ctime
  };
}
