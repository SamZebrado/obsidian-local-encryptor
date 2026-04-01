import {
  Editor,
  MarkdownView,
  normalizePath,
  Notice,
  Plugin,
  TFile,
  TFolder
} from "obsidian";

import { createTemporaryBackup, deleteBackup } from "./backup";
import { decryptText, encryptText, getCryptoPolicy } from "./crypto";
import {
  containsEncryptedBlock,
  isEncryptedNoteContent,
  unwrapEncryptedNote,
  unwrapEncryptedPayload,
  wrapEncryptedNote,
  wrapEncryptedPayload
} from "./encryptedBlock";
import { MacKeychainPasswordStore } from "./keychain";
import {
  buildAttachmentLookupCandidates,
  buildNoteBundle,
  BundledAttachment,
  extractLocalImageTargets,
  isImagePath,
  parseDecryptedNoteBundle,
  sanitizeNoteBasename
} from "./noteBundle";
import { PasswordModal, PasswordPromptResult } from "./passwordModal";
import { ReportModal } from "./reportModal";

type ActionKind = "encrypt" | "decrypt";
type FileBackedView = { file?: TFile | null };
type BatchOutcome = "updated" | "skipped" | "failed";

interface BatchResult {
  outcome: BatchOutcome;
  path: string;
  reason?: string;
}

const VERIFY_FAILURE_MESSAGE = "还原失败，慎重加密";

export default class LocalEncryptorPlugin extends Plugin {
  private readonly keychain = new MacKeychainPasswordStore();

  async onload(): Promise<void> {
    this.registerCommands();
    this.registerEditorMenu();
    this.registerFolderMenu();

    const policy = getCryptoPolicy();
    console.log(
      `[Local Encryptor] Loaded with ${policy.algorithm}, PBKDF2-${policy.hash}, ${policy.iterations} iterations.`
    );
  }

  private registerCommands(): void {
    this.addCommand({
      id: "encrypt-selection",
      name: "Encrypt selected text",
      editorCheckCallback: (checking, editor, view) =>
        this.handleEditorCommand(checking, editor, view, "encrypt", "selection")
    });

    this.addCommand({
      id: "decrypt-selection",
      name: "Decrypt selected text",
      editorCheckCallback: (checking, editor, view) =>
        this.handleEditorCommand(checking, editor, view, "decrypt", "selection")
    });

    this.addCommand({
      id: "encrypt-note",
      name: "Encrypt current note",
      editorCheckCallback: (checking, editor, view) =>
        this.handleEditorCommand(checking, editor, view, "encrypt", "note")
    });

    this.addCommand({
      id: "decrypt-note",
      name: "Decrypt current note",
      editorCheckCallback: (checking, editor, view) =>
        this.handleEditorCommand(checking, editor, view, "decrypt", "note")
    });

    this.addCommand({
      id: "clear-keychain-password",
      name: "Delete saved password from macOS Keychain",
      callback: async () => {
        try {
          await this.keychain.deletePassword();
          new Notice("Saved password deleted from macOS Keychain.");
        } catch (error) {
          this.showError(error);
        }
      }
    });

    this.addCommand({
      id: "encrypt-current-folder",
      name: "Encrypt all notes in current folder",
      callback: () => void this.runFolderAction("encrypt")
    });

    this.addCommand({
      id: "decrypt-current-folder",
      name: "Decrypt all notes in current folder",
      callback: () => void this.runFolderAction("decrypt")
    });
  }

  private registerEditorMenu(): void {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor, view) => {
        menu.addItem((item) =>
          item.setTitle("Encrypt selected text").setIcon("lock").onClick(() => {
            void this.encryptSelection(editor, view);
          })
        );

        menu.addItem((item) =>
          item.setTitle("Decrypt selected text").setIcon("unlock").onClick(() => {
            void this.decryptSelection(editor, view);
          })
        );
      })
    );
  }

  private registerFolderMenu(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFolder)) {
          return;
        }

        menu.addItem((item) =>
          item.setTitle("Encrypt this folder").setIcon("lock").onClick(() => {
            void this.runFolderActionForFolder("encrypt", file);
          })
        );

        menu.addItem((item) =>
          item.setTitle("Decrypt this folder").setIcon("unlock").onClick(() => {
            void this.runFolderActionForFolder("decrypt", file);
          })
        );
      })
    );
  }

  private handleEditorCommand(
    checking: boolean,
    editor: Editor,
    view: FileBackedView | undefined,
    action: ActionKind,
    scope: "selection" | "note"
  ): boolean {
    const file = view?.file;
    if (!file) {
      return false;
    }

    const selected = editor.getSelection();
    if (scope === "selection" && !selected.trim()) {
      return false;
    }

    if (checking) {
      return true;
    }

    if (action === "encrypt" && scope === "selection") {
      void this.encryptSelection(editor, view);
    } else if (action === "decrypt" && scope === "selection") {
      void this.decryptSelection(editor, view);
    } else if (action === "encrypt") {
      void this.encryptNote(editor, file);
    } else {
      void this.decryptNote(editor, file);
    }

    return true;
  }

  private async encryptSelection(editor: Editor, view: FileBackedView): Promise<void> {
    if (!view.file) {
      new Notice("No file is open.");
      return;
    }

    const selected = editor.getSelection();
    if (!selected.trim()) {
      new Notice("Select some text before encrypting.");
      return;
    }

    if (containsEncryptedBlock(selected)) {
      new Notice("The selected text already looks encrypted.");
      return;
    }

    await this.encryptAndReplace(editor, view.file, selected, "selection");
  }

  private async decryptSelection(editor: Editor, view: FileBackedView): Promise<void> {
    if (!view.file) {
      new Notice("No file is open.");
      return;
    }

    const selected = editor.getSelection();
    if (!selected.trim()) {
      new Notice("Select an encrypted block before decrypting.");
      return;
    }

    let encryptedPayload: string;
    try {
      encryptedPayload = unwrapEncryptedPayload(selected);
    } catch (error) {
      this.showError(error);
      return;
    }

    const password = await this.resolveDecryptionPassword();
    if (!password) {
      return;
    }

    try {
      const decrypted = await decryptText(encryptedPayload, password);
      await this.replaceEditorRange(editor, view.file!, decrypted);
      new Notice("Selected text decrypted.");
    } catch (error) {
      this.showError(error);
    }
  }

  private async encryptNote(editor: Editor, file: TFile): Promise<void> {
    const current = editor.getValue();
    if (!current.trim()) {
      new Notice("The current note is empty.");
      return;
    }

    if (isEncryptedNoteContent(current)) {
      new Notice("The current note already looks encrypted.");
      return;
    }

    await this.encryptAndReplace(editor, file, current, "note");
  }

  private async decryptNote(editor: Editor, file: TFile): Promise<void> {
    const current = editor.getValue();
    let encryptedPayload: string;
    try {
      encryptedPayload = unwrapEncryptedNote(current);
    } catch (error) {
      this.showError(error);
      return;
    }

    const password = await this.resolveDecryptionPassword();
    if (!password) {
      return;
    }

    try {
      const decrypted = await decryptText(encryptedPayload, password);
      await this.applyDecryptedNote(editor, file, decrypted);
      new Notice("Current note decrypted.");
    } catch (error) {
      this.showError(error);
    }
  }

  private async replaceEditorRange(editor: Editor, file: TFile, replacement: string): Promise<void> {
    const current = editor.getValue();
    const from = editor.posToOffset(editor.getCursor("from"));
    const to = editor.posToOffset(editor.getCursor("to"));
    const next = `${current.slice(0, from)}${replacement}${current.slice(to)}`;

    await this.app.vault.modify(file, next);
    editor.setValue(next);
  }

  private async replaceWholeNote(editor: Editor, file: TFile, replacement: string): Promise<void> {
    await this.app.vault.modify(file, replacement);
    editor.setValue(replacement);
  }

  private async encryptAndReplace(
    editor: Editor,
    file: TFile,
    plaintext: string,
    scope: "selection" | "note"
  ): Promise<void> {
    const password = await this.resolvePassword("encrypt");
    if (!password) {
      return;
    }

    const current = editor.getValue();

    try {
      const fullNotePayload = scope === "note" ? await this.buildEncryptableNotePayload(file, current) : null;
      const encryptedBlock = await this.buildVerifiedEncryptedBlock(
        file,
        current,
        fullNotePayload?.plaintext ?? plaintext,
        password,
        scope
      );
      if (scope === "selection") {
        await this.replaceEditorRange(editor, file, encryptedBlock);
        new Notice("Selected text encrypted.");
      } else {
        await this.replaceWholeNote(editor, file, encryptedBlock);
        await this.deleteBundledAttachments(fullNotePayload?.attachments ?? []);
        await this.renameFileToPlaceholder(file);
        new Notice("Current note encrypted.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === VERIFY_FAILURE_MESSAGE) {
        new Notice(message, 7000);
      } else {
        this.showError(error);
      }
    }
  }

  private async buildVerifiedEncryptedBlock(
    file: TFile,
    currentContent: string,
    plaintext: string,
    password: string,
    scope: "selection" | "note"
  ): Promise<string> {
    let temporaryBackupPath: string | null = null;

    try {
      temporaryBackupPath = await createTemporaryBackup(this, file, currentContent);

      const encryptedPayload = await encryptText(plaintext, password);
      const decryptedPlaintext = await decryptText(encryptedPayload, password);
      if (decryptedPlaintext !== plaintext) {
        throw new Error(VERIFY_FAILURE_MESSAGE);
      }

      return scope === "note" ? wrapEncryptedNote(encryptedPayload) : wrapEncryptedPayload(encryptedPayload);
    } finally {
      await deleteBackup(this, temporaryBackupPath);
    }
  }

  private getActiveMarkdownFile(): TFile | null {
    return this.app.workspace.getActiveViewOfType(MarkdownView)?.file ?? null;
  }

  private async runFolderAction(action: ActionKind): Promise<void> {
    const activeFile = this.getActiveMarkdownFile();
    if (!activeFile) {
      new Notice("Open a note in the target folder first.");
      return;
    }

    await this.runFolderActionForFolder(action, activeFile.parent);
  }

  private async runFolderActionForFolder(action: ActionKind, folder: TFolder | null): Promise<void> {
    if (!folder) {
      new Notice("No folder is available for this action.");
      return;
    }

    const password = await this.resolveFolderPassword(action);
    if (!password) {
      return;
    }

    const folderPath = folder.path;
    const files = this.getFolderFiles(folderPath);
    if (files.length === 0) {
      new Notice("No markdown files found in the selected folder.");
      return;
    }

    const sharedAttachments =
      action === "encrypt" ? await this.buildSharedAttachmentMap(files) : new Map<string, number>();
    const results: BatchResult[] = [];
    for (const file of files) {
      if (action === "encrypt") {
        results.push(await this.encryptFileInBatch(file, password, sharedAttachments));
      } else {
        results.push(await this.decryptFileInBatch(file, password));
      }
    }

    this.showBatchSummary(action, folderPath || "/", results);
  }

  private getFolderFiles(folderPath: string): TFile[] {
    const prefix = folderPath ? `${folderPath}/` : "";
    return this.app.vault
      .getFiles()
      .filter((file) => file.extension === "md")
      .filter((file) => (folderPath ? file.path.startsWith(prefix) : true))
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  private async encryptFileInBatch(
    file: TFile,
    password: string,
    sharedAttachments: Map<string, number>
  ): Promise<BatchResult> {
    try {
      const current = await this.app.vault.read(file);
      if (!current.trim()) {
        return { outcome: "skipped", path: file.path, reason: "empty note" };
      }

      if (isEncryptedNoteContent(current)) {
        return { outcome: "skipped", path: file.path, reason: "already encrypted" };
      }

      const imagePaths = await this.resolveImageAttachmentPaths(file, current);
      const sharedPaths = imagePaths.filter((path: string) => (sharedAttachments.get(path) ?? 0) > 1);
      if (sharedPaths.length > 0) {
        return {
          outcome: "skipped",
          path: file.path,
          reason: `shared image attachments: ${sharedPaths.join(", ")}`
        };
      }

      const payload = await this.buildEncryptableNotePayload(file, current);
      const encryptedBlock = await this.buildVerifiedEncryptedBlock(file, current, payload.plaintext, password, "note");
      await this.app.vault.modify(file, encryptedBlock);
      await this.deleteBundledAttachments(payload.attachments);
      await this.renameFileToPlaceholder(file);
      return { outcome: "updated", path: file.path };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { outcome: "failed", path: file.path, reason };
    }
  }

  private async decryptFileInBatch(file: TFile, password: string): Promise<BatchResult> {
    try {
      const current = await this.app.vault.read(file);
      if (!isEncryptedNoteContent(current)) {
        return { outcome: "skipped", path: file.path, reason: "not marked as encrypted" };
      }

      const encryptedPayload = unwrapEncryptedNote(current);
      const decrypted = await decryptText(encryptedPayload, password);
      await this.applyDecryptedNote(null, file, decrypted);
      return { outcome: "updated", path: file.path };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return { outcome: "failed", path: file.path, reason };
    }
  }

  private showBatchSummary(action: ActionKind, folderPath: string, results: BatchResult[]): void {
    const updated = results.filter((result) => result.outcome === "updated");
    const skipped = results.filter((result) => result.outcome === "skipped");
    const failed = results.filter((result) => result.outcome === "failed");

    const actionLabel = action === "encrypt" ? "encryption" : "decryption";
    new Notice(
      `Folder ${actionLabel} finished for ${folderPath}. ${updated.length} updated, ${skipped.length} skipped, ${failed.length} failed. Review the details dialog for skipped or failed files.`,
      8000
    );

    if (failed.length > 0 || skipped.length > 0) {
      const lines: string[] = [];
      if (skipped.length > 0) {
        lines.push(`Skipped (${skipped.length})`);
        lines.push(...skipped.map((result) => `${result.path}: ${result.reason ?? "skipped"}`));
      }
      if (failed.length > 0) {
        lines.push(`Failed (${failed.length})`);
        lines.push(...failed.map((result) => `${result.path}: ${result.reason ?? "unknown error"}`));
      }
      new ReportModal(this.app, `Folder ${actionLabel} details`, lines).open();
    }
  }

  private async buildEncryptableNotePayload(
    file: TFile,
    currentContent: string
  ): Promise<{ plaintext: string; attachments: BundledAttachment[] }> {
    const imagePaths = await this.resolveImageAttachmentPaths(file, currentContent);
    const attachments: BundledAttachment[] = [];
    for (const path of imagePaths) {
      if (!(await this.app.vault.adapter.exists(path))) {
        throw new Error(`Referenced image not found: ${path}`);
      }

      const binary = await this.app.vault.adapter.readBinary(path);
      attachments.push({
        path,
        dataBase64: Buffer.from(binary).toString("base64")
      });
    }

    return {
      plaintext: buildNoteBundle(file.basename, currentContent, attachments),
      attachments
    };
  }

  private async applyDecryptedNote(editor: Editor | null, file: TFile, decrypted: string): Promise<void> {
    const bundle = parseDecryptedNoteBundle(decrypted);
    await this.restoreBundledAttachments(bundle.attachments);
    await this.app.vault.modify(file, bundle.content);
    if (editor) {
      editor.setValue(bundle.content);
    }

    if (bundle.title) {
      await this.renameFileToTitle(file, bundle.title);
    }
  }

  private async deleteBundledAttachments(attachments: BundledAttachment[]): Promise<void> {
    for (const attachment of attachments) {
      if (await this.app.vault.adapter.exists(attachment.path)) {
        await this.app.vault.adapter.remove(attachment.path);
      }
    }
  }

  private async restoreBundledAttachments(attachments: BundledAttachment[]): Promise<void> {
    for (const attachment of attachments) {
      await this.ensureParentDirectory(attachment.path);
      const bytes = Uint8Array.from(Buffer.from(attachment.dataBase64, "base64"));
      await this.app.vault.adapter.writeBinary(attachment.path, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    }
  }

  private async ensureParentDirectory(path: string): Promise<void> {
    const normalized = normalizePath(path);
    const parts = normalized.split("/");
    parts.pop();
    let current = "";
    for (const part of parts) {
      current = current ? normalizePath(`${current}/${part}`) : part;
      if (current && !(await this.app.vault.adapter.exists(current))) {
        await this.app.vault.adapter.mkdir(current);
      }
    }
  }

  private async renameFileToPlaceholder(file: TFile): Promise<void> {
    const folderPath = file.parent?.path ?? "";
    let index = 1;
    while (true) {
      const candidateBase = `标题${index}`;
      const candidatePath = this.buildNotePath(folderPath, candidateBase);
      if (candidatePath === file.path || !(await this.app.vault.adapter.exists(candidatePath))) {
        await this.app.fileManager.renameFile(file, candidatePath);
        return;
      }
      index += 1;
    }
  }

  private async renameFileToTitle(file: TFile, title: string): Promise<void> {
    const folderPath = file.parent?.path ?? "";
    const safeTitle = sanitizeNoteBasename(title);
    let index = 0;
    while (true) {
      const candidateBase = index === 0 ? safeTitle : `${safeTitle} (${index})`;
      const candidatePath = this.buildNotePath(folderPath, candidateBase);
      if (candidatePath === file.path || !(await this.app.vault.adapter.exists(candidatePath))) {
        await this.app.fileManager.renameFile(file, candidatePath);
        return;
      }
      index += 1;
    }
  }

  private buildNotePath(folderPath: string, basename: string): string {
    return folderPath ? normalizePath(`${folderPath}/${basename}.md`) : `${basename}.md`;
  }

  private async buildSharedAttachmentMap(files: TFile[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    for (const file of files) {
      const content = await this.app.vault.read(file);
      for (const path of await this.resolveImageAttachmentPaths(file, content, true)) {
        counts.set(path, (counts.get(path) ?? 0) + 1);
      }
    }
    return counts;
  }

  private async resolveImageAttachmentPaths(
    file: TFile,
    content: string,
    allowMissing = false
  ): Promise<string[]> {
    const found = new Set<string>();
    for (const reference of extractLocalImageTargets(content)) {
      const resolved = await this.resolveSingleImageAttachmentPath(file, reference.target);
      if (resolved) {
        found.add(resolved);
        continue;
      }

      if (!allowMissing) {
        throw new Error(`Referenced image not found: ${reference.target}`);
      }
    }

    return [...found].sort((left, right) => left.localeCompare(right));
  }

  private async resolveSingleImageAttachmentPath(file: TFile, target: string): Promise<string | null> {
    const decoded = this.safeDecodeTarget(target);
    const metadataHit = this.app.metadataCache.getFirstLinkpathDest(decoded, file.path);
    const metadataPath = metadataHit instanceof TFile ? metadataHit.path : null;

    for (const candidate of buildAttachmentLookupCandidates(file.path, target, metadataPath)) {
      if (isImagePath(candidate) && (await this.app.vault.adapter.exists(candidate))) {
        return candidate;
      }
    }

    return null;
  }

  private safeDecodeTarget(target: string): string {
    try {
      return decodeURIComponent(target);
    } catch {
      return target;
    }
  }

  private async resolvePassword(action: ActionKind): Promise<string | null> {
    try {
      const savedPassword = await this.keychain.getPassword();
      if (savedPassword) {
        return savedPassword;
      }
    } catch (error) {
      this.showError(error);
    }

    const result = await this.promptForPassword({
      action,
      allowRemember: true
    });
    if (!result) {
      return null;
    }

    if (result.rememberInKeychain) {
      try {
        await this.keychain.setPassword(result.password);
      } catch (error) {
        this.showError(error);
      }
    }

    return result.password;
  }

  private async resolveFolderPassword(action: ActionKind): Promise<string | null> {
    if (action === "decrypt") {
      return this.resolveDecryptionPassword();
    }

    return this.resolvePassword(action);
  }

  private async resolveDecryptionPassword(): Promise<string | null> {
    const result = await this.promptForPassword({
      action: "decrypt",
      allowRemember: false
    });
    return result?.password ?? null;
  }

  private async promptForPassword(options: {
    action: ActionKind;
    allowRemember: boolean;
  }): Promise<PasswordPromptResult | null> {
    const modal = new PasswordModal(this.app, {
      title: options.action === "encrypt" ? "Encrypt text" : "Decrypt text",
      submitLabel: options.action === "encrypt" ? "Encrypt" : "Decrypt",
      allowRemember: options.allowRemember,
      confirmPassword: options.action === "encrypt",
      keychainSupported: this.keychain.isSupported()
    });

    return modal.openAndWait();
  }

  private showError(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    new Notice(message, 6000);
    console.error("[Local Encryptor]", error);
  }
}
