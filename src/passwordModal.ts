import { App, Modal, Notice, Setting } from "obsidian";

export interface PasswordPromptOptions {
  title: string;
  submitLabel: string;
  allowRemember: boolean;
  confirmPassword: boolean;
  keychainSupported: boolean;
}

export interface PasswordPromptResult {
  password: string;
  rememberInKeychain: boolean;
}

export class PasswordModal extends Modal {
  private readonly options: PasswordPromptOptions;
  private password = "";
  private confirmPasswordValue = "";
  private rememberInKeychain = true;
  private resolvePromise!: (result: PasswordPromptResult | null) => void;

  constructor(app: App, options: PasswordPromptOptions) {
    super(app);
    this.options = options;
    this.rememberInKeychain = options.allowRemember && options.keychainSupported;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h3", { text: this.options.title });

    new Setting(contentEl)
      .setName("Password")
      .addText((text) => {
        text.inputEl.type = "password";
        text.inputEl.autocomplete = "current-password";
        text.onChange((value) => {
          this.password = value;
        });
      });

    if (this.options.confirmPassword) {
      new Setting(contentEl)
        .setName("Confirm password")
        .addText((text) => {
          text.inputEl.type = "password";
          text.inputEl.autocomplete = "new-password";
          text.onChange((value) => {
            this.confirmPasswordValue = value;
          });
        });
    }

    if (this.options.allowRemember) {
      new Setting(contentEl)
        .setName("Save password in macOS Keychain")
        .setDesc(
          this.options.keychainSupported
            ? "Future operations can reuse the password through the local keychain."
            : "macOS Keychain is unavailable on this platform, so the password will not be saved."
        )
        .addToggle((toggle) => {
          toggle.setValue(this.rememberInKeychain);
          toggle.setDisabled(!this.options.keychainSupported);
          toggle.onChange((value) => {
            this.rememberInKeychain = value;
          });
        });
    }

    const actions = contentEl.createDiv({ cls: "local-encryptor-actions" });
    const submitButton = actions.createEl("button", { text: this.options.submitLabel });
    submitButton.addEventListener("click", () => void this.submit());

    const cancelButton = actions.createEl("button", { text: "Cancel" });
    cancelButton.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.contentEl.empty();
    if (this.resolvePromise) {
      this.resolvePromise(null);
    }
  }

  async openAndWait(): Promise<PasswordPromptResult | null> {
    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.open();
    });
  }

  private async submit(): Promise<void> {
    if (!this.password) {
      new Notice("Password cannot be empty.");
      return;
    }

    if (this.options.confirmPassword && this.password !== this.confirmPasswordValue) {
      new Notice("The password confirmation does not match.");
      return;
    }

    const resolve = this.resolvePromise;
    this.resolvePromise = (() => undefined) as typeof this.resolvePromise;
    resolve({
      password: this.password,
      rememberInKeychain: this.options.allowRemember && this.rememberInKeychain
    });
    this.close();
  }
}
