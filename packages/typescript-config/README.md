# `@repo/typescript-config`

`@repo/typescript-config` provides shared TypeScript compiler presets for Nixx applications and packages.

## Presets

- `base.json` — strict ES2022 TypeScript defaults with NodeNext module resolution.
- `nextjs.json` — Next.js application compiler settings.
- `react-library.json` — React library compiler settings.

The presets standardize strictness, module resolution, declarations, isolated modules, and common library targets across the monorepo.

## Usage

A workspace extends the appropriate preset from its `tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/base.json"
}
```

Keep application-specific path aliases and generated-file settings in the consuming workspace.

## Development

This package contains configuration only. Validate changes with:

```bash
bun run check-types
```
