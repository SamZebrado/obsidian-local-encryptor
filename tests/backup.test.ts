import test from "node:test";
import assert from "node:assert/strict";

import { createTemporaryBackup, deleteBackup } from "../src/backup";

test("temporary backups are created and then removable", async () => {
  const writes = new Map<string, string>();
  const directories = new Set<string>();

  const plugin = {
    app: {
      vault: {
        adapter: {
          exists: async (path: string) => directories.has(path) || writes.has(path),
          mkdir: async (path: string) => {
            directories.add(path);
          },
          write: async (path: string, content: string) => {
            writes.set(path, content);
          },
          remove: async (path: string) => {
            writes.delete(path);
          }
        }
      }
    }
  };

  const file = { path: "Private/Note.md" };
  const backupPath = await createTemporaryBackup(plugin as never, file as never, "secret");

  assert.match(backupPath, /^\.obsidian\/plugins\/local-encryptor\/backup\/temp-/);
  assert.equal(writes.get(backupPath), "secret");

  await deleteBackup(plugin as never, backupPath);
  assert.equal(writes.has(backupPath), false);
});
