# `@repo/ui`

`@repo/ui` is the shared React component package for Nixx workspace applications. Components are exported through package subpaths and can be consumed by the web app or other React packages.

## Responsibilities

- Provide reusable presentational React components.
- Keep shared UI primitives separate from app-specific routing and data fetching.
- Share React and React DOM as package dependencies.

## Structure

- `src/` — reusable `.tsx` components.
- `package.json` — wildcard subpath exports such as `@repo/ui/<component>`.
- `eslint.config.mjs` — package lint configuration.

## Usage

```tsx
import Component from "@repo/ui/component";
```

Use app-local components when behavior depends on authentication, routing, server actions, or Nixx-specific state.

## Commands

```bash
bun run --filter @repo/ui lint
bun run --filter @repo/ui check-types
bun run --filter @repo/ui generate:component
```
