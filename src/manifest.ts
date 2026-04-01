import type { Plugin } from "obsidian";

import type { BundledAttachment, BundledTimestamps } from "./noteBundle";

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
  attachments: BundledAttachment[]
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
