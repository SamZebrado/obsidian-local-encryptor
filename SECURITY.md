# Security Policy

## Scope

This plugin is designed to run fully offline inside Obsidian desktop.

## Reporting

If you find a security issue, do not open a public issue with exploit details first. Share a private report with reproduction steps, impact, and affected version.

## Sensitive data rules

- Do not commit vault contents, encrypted note samples containing real data, or local backups.
- Do not commit API keys, tokens, certificates, or private keys.
- Run `npm run lint:offline` and `npm run lint:secrets` before publishing.
- Review any future dependency additions carefully because the current runtime path is intentionally minimal.
