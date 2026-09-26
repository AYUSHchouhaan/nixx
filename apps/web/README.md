# Web app

The `web` app is Nixx's Next.js frontend and HTTP API. It handles authentication, GitHub repository and branch selection, thread creation, agent-run streaming, and the coding workspace UI.

## Responsibilities

- Authenticate users with Better Auth and GitHub OAuth.
- Load repositories, branches, and GitHub App installation tokens.
- Create and manage coding threads.
- Start agent runs through the Agent Brain service.
- Stream LangGraph messages and tool events to the browser.
- Render the coding chat, sandbox actions, and Daytona preview panel.

## Structure

- `app/page.tsx` — landing page.
- `app/login/` — sign-in flow.
- `app/app/` — authenticated workspace and thread UI.
- `app/api/` — authentication, GitHub, thread, run, and stream routes.
- `app/lib/auth.ts` — Better Auth configuration.
- `app/lib/agent-brain.ts` — LangGraph HTTP client helpers.
- `app/lib/github-installation.ts` — GitHub App token and installation helpers.

## Development

From the repository root:

```bash
bun run --filter web dev
```

The app runs on `http://localhost:3000`.

## Commands

```bash
bun run --filter web dev
bun run --filter web build
bun run --filter web start
bun run --filter web lint
bun run --filter web check-types
```

## Environment

Set these values in `apps/web/.env`:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET`
- `BETTER_AUTH_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_APP_ID`
- `GITHUB_PRIVATE_KEY`
- `AGENT_BRAIN_URL`

The app expects Agent Brain at `http://localhost:4000` by default.
