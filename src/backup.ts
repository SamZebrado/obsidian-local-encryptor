import type { Plugin, TFile } from "obsidian";

const BACKUP_DIR = ".obsidian/plugins/local-encryptor/backup";

function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, "/").replace(/\/+/g, "/");
}

function sanitizeFilePath(path: string): string {
  return path.replace(/[\\/]/g, "__").replace(/[^a-zA-Z0-9._-]/g, "_");
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

export async function createTemporaryBackup(plugin: Plugin, file: TFile, currentContent: string): Promise<string> {
  await ensureDirectory(plugin, BACKUP_DIR);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = normalizeVaultPath(`${BACKUP_DIR}/temp-${timestamp}-${sanitizeFilePath(file.path)}`);
  await plugin.app.vault.adapter.write(backupPath, currentContent);
  return backupPath;
}

export async function deleteBackup(plugin: Plugin, backupPath: string | null): Promise<void> {
  if (!backupPath) {
    return;
  }

  if (await plugin.app.vault.adapter.exists(backupPath)) {
    await plugin.app.vault.adapter.remove(backupPath);
  }
}
