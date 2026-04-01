import {
  Editor,
  MarkdownView,
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

    const password = await this.resolvePassword("decrypt");
    if (!password) {
      return;
    }

    try {
      const decrypted = await decryptText(encryptedPayload, password);
      await this.replaceEditorRange(editor, view.file!, decrypted);
      new Notice("Selected text decrypted.");
    } catch (error) {
      if (await this.retryWithPromptAfterKeychainFailure(error, editor, view, encryptedPayload, "selection")) {
        return;
      }

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

    const password = await this.resolvePassword("decrypt");
    if (!password) {
      return;
    }

    try {
      const decrypted = await decryptText(encryptedPayload, password);
      await this.replaceWholeNote(editor, file, decrypted);
      new Notice("Current note decrypted.");
    } catch (error) {
      if (await this.retryWithPromptAfterKeychainFailure(error, editor, file, encryptedPayload, "note")) {
        return;
      }

      this.showError(error);
    }
  }

  private async retryWithPromptAfterKeychainFailure(
    error: unknown,
    editor: Editor,
    target: FileBackedView | TFile,
    encryptedPayload: string,
    scope: "selection" | "note"
  ): Promise<boolean> {
    if (!(error instanceof Error) || !error.message.includes("incorrect")) {
      return false;
    }

    const password = await this.promptForPassword({
      action: "decrypt",
      allowRemember: false
    });
    if (!password) {
      return true;
    }

    try {
      const decrypted = await decryptText(encryptedPayload, password.password);
      if (scope === "selection" && "file" in target) {
        await this.replaceEditorRange(editor, target.file!, decrypted);
      } else if (scope === "note" && target instanceof TFile) {
        await this.replaceWholeNote(editor, target, decrypted);
      }
      new Notice(scope === "selection" ? "Selected text decrypted." : "Current note decrypted.");
      return true;
    } catch (retryError) {
      this.showError(retryError);
      return true;
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
      const encryptedBlock = await this.buildVerifiedEncryptedBlock(file, current, plaintext, password, scope);
      if (scope === "selection") {
        await this.replaceEditorRange(editor, file, encryptedBlock);
        new Notice("Selected text encrypted.");
      } else {
        await this.replaceWholeNote(editor, file, encryptedBlock);
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

    const password = await this.resolvePassword(action);
    if (!password) {
      return;
    }

    const folderPath = folder.path;
    const files = this.getFolderFiles(folderPath);
    if (files.length === 0) {
      new Notice("No markdown files found in the selected folder.");
      return;
    }

    const results: BatchResult[] = [];
    for (const file of files) {
      if (action === "encrypt") {
        results.push(await this.encryptFileInBatch(file, password));
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

  private async encryptFileInBatch(file: TFile, password: string): Promise<BatchResult> {
    try {
      const current = await this.app.vault.read(file);
      if (!current.trim()) {
        return { outcome: "skipped", path: file.path, reason: "empty note" };
      }

      if (isEncryptedNoteContent(current)) {
        return { outcome: "skipped", path: file.path, reason: "already encrypted" };
      }

      const encryptedBlock = await this.buildVerifiedEncryptedBlock(file, current, current, password, "note");
      await this.app.vault.modify(file, encryptedBlock);
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
      await this.app.vault.modify(file, decrypted);
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
      `Folder ${actionLabel} finished for ${folderPath}. ${updated.length} updated, ${skipped.length} skipped, ${failed.length} failed.`,
      8000
    );

    if (failed.length > 0) {
      const lines = failed.map((result) => `${result.path}: ${result.reason ?? "unknown error"}`);
      new ReportModal(this.app, `Folder ${actionLabel} failures`, lines).open();
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
