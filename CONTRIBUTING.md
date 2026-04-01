# Contributing

## Development

1. Install dependencies with `npm install`
2. Run `npm run typecheck`
3. Run `npm test`
4. Run `npm run lint:offline`
5. Run `npm run lint:secrets`

## Pull requests

- Keep the plugin offline-only unless there is an explicit design change.
- Prefer native platform APIs and small dependency surfaces.
- Add or update tests for behavior changes, especially around encryption and note-format compatibility.
- Do not include real vault data in test fixtures, screenshots, or examples.
