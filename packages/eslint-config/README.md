# `@repo/eslint-config`

`@repo/eslint-config` contains shared ESLint configurations used by the Nixx workspace packages and applications.

## Exports

- `@repo/eslint-config/base` — base JavaScript and TypeScript rules.
- `@repo/eslint-config/next-js` — Next.js application rules.
- `@repo/eslint-config/react-internal` — React library rules.

The configs combine ESLint, TypeScript, React, React Hooks, Next.js, Turbo, and Prettier compatibility rules. Individual workspaces extend the configuration that matches their runtime.

## Development

This package contains configuration only and does not run a service.

```bash
bun run lint
```

When changing shared rules, verify the affected apps and packages with the root lint and typecheck commands.
