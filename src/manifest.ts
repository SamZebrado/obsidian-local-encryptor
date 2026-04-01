import type { Plugin } from "obsidian";

import type { BundledAttachment, BundledTimestamps } from "./noteBundle";

export interface SkippedAttachmentRecord {
  target: string;
  reason: string;
}

export interface TimestampManifestRecord {
  kind: "local-encryptor-timestamps";
  version: 1;
  originalNotePath: string;
  encryptedNotePath: string;
  originalTitle: string;
  noteTimestamps: BundledTimestamps;
  attachments: Array<{
    path: string;
    mtime?: number;
    ctime?: number;
  }>;
  skippedAttachments: SkippedAttachmentRecord[];
  createdAt: string;
}

export interface FolderRenameRecord {
  originalRelativePath: string;
  encryptedRelativePath: string;
}

export interface FolderBatchManifestRecord {
  kind: "local-encryptor-folder-manifest";
  version: 1;
  rootFolderPath: string;
  folderRenames: FolderRenameRecord[];
  createdAt: string;
}

function sanitizeFilePath(path: string): string {
  return path.replace(/[\\/]/g, "__").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\/+/, "");
}

function dirname(path: string): string {
  const normalized = normalizeVaultPath(path);
  const lastSlash = normalized.lastIndexOf("/");
  return lastSlash >= 0 ? normalized.slice(0, lastSlash) : "";
}

function basenameWithoutExtension(path: string): string {
  const normalized = normalizeVaultPath(path);
  const filename = normalized.slice(normalized.lastIndexOf("/") + 1);
  const lastDot = filename.lastIndexOf(".");
  return lastDot >= 0 ? filename.slice(0, lastDot) : filename;
}

async function ensureDirectory(plugin: Plugin, path: string): Promise<void> {
  const segments = path.split("/");
  let current = "";
  for (const segment of segments) {
    current = current ? normalizeVaultPath(`${current}/${segment}`) : segment;
    if (!(await plugin.app.vault.adapter.exists(current))) {
      await plugin.app.vault.adapter.mkdir(current);
    }
  }
}

export function buildTimestampManifest(
  originalNotePath: string,
  encryptedNotePath: string,
  originalTitle: string,
  noteTimestamps: BundledTimestamps,
  attachments: BundledAttachment[],
  skippedAttachments: SkippedAttachmentRecord[] = []
): TimestampManifestRecord {
  return {
    kind: "local-encryptor-timestamps",
    version: 1,
    originalNotePath,
    encryptedNotePath,
    originalTitle,
    noteTimestamps,
    attachments: attachments.map((attachment) => ({
      path: attachment.path,
      mtime: attachment.mtime,
      ctime: attachment.ctime
    })),
    skippedAttachments,
    createdAt: new Date().toISOString()
  };
}

export async function writeTimestampManifest(
  plugin: Plugin,
  record: TimestampManifestRecord
): Promise<string> {
  const targetDir = dirname(record.encryptedNotePath);
  if (targetDir) {
    await ensureDirectory(plugin, targetDir);
  }
  const filename = `${sanitizeFilePath(basenameWithoutExtension(record.encryptedNotePath))}.local-encryptor-times.json`;
  const manifestPath = targetDir ? normalizeVaultPath(`${targetDir}/${filename}`) : filename;
  await plugin.app.vault.adapter.write(manifestPath, JSON.stringify(record, null, 2));
  return manifestPath;
}

export function buildFolderBatchManifest(
  rootFolderPath: string,
  folderRenames: FolderRenameRecord[]
): FolderBatchManifestRecord {
  return {
    kind: "local-encryptor-folder-manifest",
    version: 1,
    rootFolderPath,
    folderRenames,
    createdAt: new Date().toISOString()
  };
}

export function getFolderBatchManifestPath(rootFolderPath: string): string {
  return normalizeVaultPath(`${rootFolderPath}/.local-encryptor-folder-manifest.json`);
}

export async function writeFolderBatchManifest(
  plugin: Plugin,
  record: FolderBatchManifestRecord
): Promise<string> {
  const path = getFolderBatchManifestPath(record.rootFolderPath);
  await plugin.app.vault.adapter.write(path, JSON.stringify(record, null, 2));
  return path;
}

export async function readFolderBatchManifest(
  plugin: Plugin,
  rootFolderPath: string
): Promise<FolderBatchManifestRecord | null> {
  const path = getFolderBatchManifestPath(rootFolderPath);
  if (!(await plugin.app.vault.adapter.exists(path))) {
    return null;
  }

  const content = await plugin.app.vault.adapter.read(path);
  const parsed = JSON.parse(content) as Partial<FolderBatchManifestRecord>;
  if (
    parsed.kind !== "local-encryptor-folder-manifest" ||
    parsed.version !== 1 ||
    parsed.rootFolderPath !== rootFolderPath ||
    !Array.isArray(parsed.folderRenames)
  ) {
    return null;
  }

  return {
    kind: parsed.kind,
    version: parsed.version,
    rootFolderPath: parsed.rootFolderPath,
    folderRenames: parsed.folderRenames.filter(
      (item): item is FolderRenameRecord =>
        typeof item?.originalRelativePath === "string" && typeof item?.encryptedRelativePath === "string"
    ),
    createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString()
  };
}
