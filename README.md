# Local Encryptor

重要提醒：这个插件在加密和解密过程中可能丢失文件系统里的创建日期和修改日期。  
Important warning: this plugin may lose filesystem creation and modified timestamps during encryption and decryption.

非常在意创建日期和修改日期的朋友，请不要使用这个仓库。  
If preserving creation and modified timestamps is critical for you, please do not use this repository.

这个仓库由 CodeX 直接生成并持续迭代，开发过程中已经跑过自动构建、类型检查和测试。  
This repository was generated and iterated directly with CodeX, with automated builds, type checks, and tests run during development.

我把它开源出来，是希望本地加密插件足够透明，欢迎大家做安全审计、漏洞扫描、代码 review 和实际使用反馈。  
I am open-sourcing it because a local encryption plugin should be transparent, and security audits, vulnerability scans, code reviews, and practical feedback are all welcome.

我还在认真学习怎么用 GitHub，但会尽力持续维护这个项目。  
I am still learning how to use GitHub well, but I intend to maintain this project seriously.

这是一个离线运行的 Obsidian 桌面插件，用 AES-256-GCM 加密选中文本、整篇笔记或整个文件夹，并可选使用 macOS 钥匙串保存密码。  
This is an offline Obsidian desktop plugin that encrypts selected text, full notes, or whole folders with AES-256-GCM, with optional password storage in the macOS Keychain.

## 功能 / Features

- 使用原生 Web Crypto API 实现 AES-256-GCM 加密。  
  Uses the native Web Crypto API for AES-256-GCM encryption.

- 使用 PBKDF2-SHA-256 和 210000 次迭代派生密钥。  
  Uses PBKDF2-SHA-256 with 210000 iterations for key derivation.

- 不包含网络请求代码，也不依赖外部数据库。  
  Contains no network request code and depends on no external database.

- 通过系统自带 `security` 命令接入 macOS 钥匙串。  
  Integrates with the macOS Keychain through the built-in `security` command.

- 支持编辑器右键菜单加密和解密选中文本。  
  Supports editor context-menu encryption and decryption for selected text.

- 支持命令面板加密和解密选中文本、整篇笔记、当前文件夹。  
  Supports command-palette encryption and decryption for selected text, full notes, and the current folder.

- 支持文件夹右键菜单加密和解密整个目录树。  
  Supports folder context-menu actions for encrypting and decrypting a whole directory tree.

- 加密前会做本地 round-trip 校验，验证通过才写回。  
  Performs a local round-trip verification before writing encrypted output.

- 整篇笔记加密会给文件写入加密标记，避免误二次整篇加密。  
  Full-note encryption writes an encrypted marker to prevent accidental second-pass full-note encryption.

- 整篇笔记加密会把原标题放进密文，并把外部文件名改成安全占位名，例如 `标题1.md`。  
  Full-note encryption moves the original title into the encrypted payload and renames the visible file to a safe placeholder such as `标题1.md`.

- 被笔记引用的本地图片会尽量一起打包进密文；不能打包的图片会被记录进清单和批量报告。  
  Local images referenced by notes are bundled into encrypted payloads when possible; images that cannot be bundled are recorded in manifests and batch reports.

- 文件夹批量加密会处理未被引用的独立图片。  
  Folder batch encryption also processes standalone images that are not referenced by notes.

- 文件夹批量加密会把子文件夹改成占位名，并通过清单记录原始名称。  
  Folder batch encryption renames subfolders to placeholders and records the original names in manifests.

- 会把笔记和附件的时间信息写进密文与清单。  
  Stores note and attachment timestamp information inside encrypted payloads and manifests.

## 安装开发版 / Install For Development

1. 运行 `npm install`。  
   Run `npm install`.

2. 运行 `npm run build`。  
   Run `npm run build`.

3. 把 `manifest.json` 和 `main.js` 复制到你的 Vault 的 `.obsidian/plugins/local-encryptor/`。  
   Copy `manifest.json` and `main.js` into `.obsidian/plugins/local-encryptor/` inside your vault.

4. 在 Obsidian 社区插件里启用 `Local Encryptor`。  
   Enable `Local Encryptor` in Obsidian community plugins.

## 打包结果 / Packaged Plugin Folder

运行 `npm run package`。  
Run `npm run package`.

打包结果会生成在 `release/local-encryptor/`，可直接复制到 `.obsidian/plugins/` 下。  
The packaged result is created at `release/local-encryptor/` and can be copied directly into `.obsidian/plugins/`.

## 命令 / Commands

- `Local Encryptor: Encrypt selected text`  
  `Local Encryptor: Encrypt selected text`

- `Local Encryptor: Decrypt selected text`  
  `Local Encryptor: Decrypt selected text`

- `Local Encryptor: Encrypt current note`  
  `Local Encryptor: Encrypt current note`

- `Local Encryptor: Decrypt current note`  
  `Local Encryptor: Decrypt current note`

- `Local Encryptor: Encrypt all notes in current folder`  
  `Local Encryptor: Encrypt all notes in current folder`

- `Local Encryptor: Decrypt all notes in current folder`  
  `Local Encryptor: Decrypt all notes in current folder`

- `Local Encryptor: Delete saved password from macOS Keychain`  
  `Local Encryptor: Delete saved password from macOS Keychain`

## 加密标记 / Encryption Marker

整篇笔记加密后，文件会以如下标记开头：  
After full-note encryption, the file starts with the following marker:

```md
%%LOCAL_ENCRYPTOR_FILE: 已加密%%
```

这个标记用于区分已加密整篇笔记和普通笔记，并阻止误二次整篇加密。  
This marker distinguishes fully encrypted notes from normal notes and blocks accidental second-pass full-note encryption.

## 文件夹行为 / Folder Behavior

- 文件夹批量解密每次都会显式要求输入密码。  
  Folder batch decryption always requires an explicit password entry.

- 批量处理结束后，会列出 skipped、failed 和未打包的图片。  
  After batch processing, skipped items, failed items, and unbundled images are listed.

- 批量加密时，独立图片也会被加密。  
  During folder encryption, standalone images are also encrypted.

- 批量加密时，子文件夹会改成占位名，并在清单中保留原始路径。  
  During folder encryption, subfolders are renamed to placeholders and their original paths are preserved in manifests.

## 时间信息说明 / Timestamp Note

- 原始修改时间会尽量恢复，但不能保证在所有平台和文件系统上都成功。  
  Original modified times are restored on a best-effort basis, but this cannot be guaranteed on every platform or filesystem.

- 原始创建时间通常不能可靠恢复。  
  Original creation times usually cannot be restored reliably.

- 为了防止时间信息彻底丢失，插件会写出时间清单 JSON。  
  To avoid losing timestamp information entirely, the plugin writes timestamp manifest JSON files.

- 单文件加密时，清单放在加密文件同目录。  
  For single-file encryption, the manifest is written in the same directory as the encrypted file.

- 文件夹加密时，清单会跟随加密结果放在对应目录。  
  For folder encryption, manifests are written alongside the encrypted results in the corresponding directories.

## 加密验证 / Encryption Verification

在真正写回加密结果之前，插件会先做以下验证：  
Before writing encrypted output back to disk, the plugin performs the following verification:

1. 创建当前文件的临时本地备份。  
   Create a temporary local backup of the current file.

2. 在内存中执行加密。  
   Encrypt the plaintext in memory.

3. 立刻用同一密码对新密文做解密。  
   Immediately decrypt the fresh ciphertext with the same password.

4. 比较解密结果和原文是否完全一致。  
   Compare the decrypted result with the original plaintext.

5. 只有完全一致时才写回密文。  
   Write ciphertext only if the round-trip matches exactly.

如果验证失败，插件会取消写入，并提示 `还原失败，慎重加密`。  
If verification fails, the plugin cancels the write and shows `还原失败，慎重加密`.

## macOS 钥匙串说明 / macOS Keychain Note

插件通过系统自带的 `security` 命令访问 macOS 钥匙串，而不是依赖原生 Node 插件。  
The plugin accesses the macOS Keychain through the built-in `security` command instead of a native Node addon.

这样更容易审计，也更能避免 Electron ABI 兼容问题。  
This makes the plugin easier to audit and avoids Electron ABI compatibility issues.

解密现在总是要求显式输入密码，不再使用已保存密码做静默解密。  
Decryption now always requires an explicit password entry and no longer performs silent decryption with saved passwords.

## 安全检查 / Safety Checks

- `npm run test`  
  `npm run test`

- `npm run typecheck`  
  `npm run typecheck`

- `npm run lint:offline`  
  `npm run lint:offline`

- `npm run lint:secrets`  
  `npm run lint:secrets`
