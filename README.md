# Local Encryptor

This repository was generated and iterated directly with CodeX, including automated build checks and test runs during development.

I am sharing it in the open because a local encryption plugin should be easy to inspect. Security review, vulnerability scanning, code review, and practical suggestions are all welcome.

I am still learning how to use GitHub well, but I intend to maintain this repo seriously and improve it step by step.

An offline Obsidian desktop plugin that encrypts selected text, full notes, or the current folder with AES-256-GCM, and stores an optional password in the macOS Keychain.

## Features

- AES-256-GCM encryption via the native Web Crypto API
- PBKDF2-SHA-256 key derivation with 210,000 iterations
- No network code and no external database
- macOS Keychain integration via the built-in `security` command
- Editor right-click actions for encrypting and decrypting selected text
- Command palette actions for encrypting or decrypting the selection or the full note
- Command palette actions for encrypting or decrypting every markdown file in the current folder and its subfolders
- Folder right-click menu items for encrypting or decrypting that folder tree
- Temporary plaintext backup only during encryption verification, removed immediately after success or failure
- Whole-note and folder encryption add a file-header marker so repeated full-note encryption is skipped
- Whole-note encryption moves the original note title into the encrypted payload and renames the visible file to a safe placeholder such as `标题1.md`
- Whole-note encryption bundles local image attachments into the encrypted payload; folder batch mode skips notes that share the same image attachment with other notes and lists them in the final report

## Install for development

1. Run `npm install`
2. Run `npm run build`
3. Copy `manifest.json` and `main.js` into your vault at `.obsidian/plugins/local-encryptor/`
4. Enable `Local Encryptor` in Obsidian community plugins

## Package a ready-to-copy plugin folder

Run `npm run package`

That creates `release/local-encryptor/`, which is ready to copy directly into your vault's `.obsidian/plugins/` directory.

## Commands

- `Local Encryptor: Encrypt selected text`
- `Local Encryptor: Decrypt selected text`
- `Local Encryptor: Encrypt current note`
- `Local Encryptor: Decrypt current note`
- `Local Encryptor: Encrypt all notes in current folder`
- `Local Encryptor: Decrypt all notes in current folder`
- `Local Encryptor: Delete saved password from macOS Keychain`

When a full note is encrypted, the file starts with:

```md
%%LOCAL_ENCRYPTOR_FILE: 已加密%%
```

That marker is used to distinguish encrypted notes from normal notes and to block accidental second-pass whole-note encryption.

For folder actions:

- batch decrypt always asks for a password explicitly once per run
- skipped files are listed in the final details dialog, not just counted

For all decrypt actions:

- decryption now always requires an explicit password entry
- saved passwords in the macOS Keychain are not used for silent decryption anymore

## Encryption verification

Before any encryption result is written back to the note, the plugin:

1. creates a temporary local backup of the current file
2. encrypts the plaintext in memory
3. immediately decrypts that fresh ciphertext with the same password
4. compares the decrypted text with the original plaintext
5. writes the ciphertext only if the round-trip matches exactly

If verification fails, the plugin cancels the write, shows `还原失败，慎重加密`, and deletes the temporary backup.

## Notes on macOS Keychain and Touch ID

This plugin uses macOS Keychain through the built-in `security` CLI instead of a native Node addon. That keeps the plugin easier to audit and avoids Electron ABI issues. Authentication prompts, including whether macOS offers Touch ID for a given read, are controlled by the system keychain and your local settings.

## Safety checks

- `npm run test`
- `npm run typecheck`
- `npm run lint:offline`
- `npm run lint:secrets`
