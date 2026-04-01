import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const KEYCHAIN_SERVICE = "MyObsidianEncryptor";
export const KEYCHAIN_ACCOUNT = "MainPassword";

export interface PasswordStore {
  isSupported(): boolean;
  getPassword(): Promise<string | null>;
  setPassword(password: string): Promise<void>;
  deletePassword(): Promise<void>;
}

type Runner = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>;

function getDefaultRunner(): Runner {
  return async (command: string, args: string[]) => execFileAsync(command, args);
}

export class MacKeychainPasswordStore implements PasswordStore {
  private readonly run: Runner;
  private readonly platform: NodeJS.Platform;

  constructor(
    private readonly service: string = KEYCHAIN_SERVICE,
    private readonly account: string = KEYCHAIN_ACCOUNT,
    runner: Runner = getDefaultRunner(),
    platform: NodeJS.Platform = process.platform
  ) {
    this.run = runner;
    this.platform = platform;
  }

  isSupported(): boolean {
    return this.platform === "darwin";
  }

  async getPassword(): Promise<string | null> {
    if (!this.isSupported()) {
      return null;
    }

    try {
      const { stdout } = await this.run("security", [
        "find-generic-password",
        "-s",
        this.service,
        "-a",
        this.account,
        "-w"
      ]);
      return stdout.trim() || null;
    } catch (error) {
      if (isMissingItemError(error)) {
        return null;
      }

      throw new Error(getSecurityErrorMessage(error, "Failed to read the macOS Keychain item."));
    }
  }

  async setPassword(password: string): Promise<void> {
    if (!this.isSupported()) {
      throw new Error("macOS Keychain is only supported on desktop macOS.");
    }

    if (!password) {
      throw new Error("Cannot store an empty password.");
    }

    try {
      await this.run("security", [
        "add-generic-password",
        "-U",
        "-s",
        this.service,
        "-a",
        this.account,
        "-w",
        password
      ]);
    } catch (error) {
      throw new Error(getSecurityErrorMessage(error, "Failed to store the password in macOS Keychain."));
    }
  }

  async deletePassword(): Promise<void> {
    if (!this.isSupported()) {
      return;
    }

    try {
      await this.run("security", [
        "delete-generic-password",
        "-s",
        this.service,
        "-a",
        this.account
      ]);
    } catch (error) {
      if (isMissingItemError(error)) {
        return;
      }

      throw new Error(getSecurityErrorMessage(error, "Failed to delete the macOS Keychain item."));
    }
  }
}

function isMissingItemError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("could not be found") || message.includes("The specified item could not be found");
}

function getSecurityErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return `${fallback} ${error.message}`;
  }

  return fallback;
}
