# Nixx

A Turborepo monorepo with a Next.js web app, PostgreSQL database layer, and GitHub authentication (OAuth login + GitHub App installation tokens).

## Tech Stack

- **Monorepo:** Turborepo
- **Package manager / runtime:** Bun
- **Web:** Next.js 16 (App Router, Turbopack), React 19
- **Auth:** Better Auth
- **Database:** PostgreSQL + Drizzle ORM
- **UI:** `@repo/ui` shared React components
- **Language:** TypeScript

## Project Structure

```
nixx/
├── apps/
│   ├── web/                 # Next.js application
│   └── agent-brain/         # Empty placeholder app
├── packages/
│   ├── db/                  # Drizzle schema, client, migrations
│   ├── ui/                  # Shared React components
│   ├── eslint-config/       # Shared ESLint config
│   └── typescript-config/   # Shared TypeScript configs
├── turbo.json
└── package.json
```

## Getting Started

### 1. Install dependencies

```powershell
bun install
```

### 2. Configure environment variables

There are two env files to configure:

#### `packages/db/.env`

```env
DATABASE_URL=postgresql://...
```

#### `apps/web/.env`

```env
DATABASE_URL=postgresql://...
BETTER_AUTH_SECRET=your-secret
BETTER_AUTH_URL=http://localhost:3000

# GitHub OAuth App (for user login)
GITHUB_CLIENT_ID=your-oauth-client-id
GITHUB_CLIENT_SECRET=your-oauth-client-secret

# GitHub App (for installation tokens)
GITHUB_APP_ID=your-app-id
GITHUB_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
```

> **Private key format:** paste the PEM on one line, replacing real line breaks with `\n`. Keep the BEGIN/END markers.

### 3. Apply database migrations

```powershell
bun run db:migrate --filter=@repo/db
```

### 4. Start the dev server

```powershell
bun run dev
```

Open [http://localhost:3000](http://localhost:3000).

To run only the web app:

```powershell
bun run dev --filter=web
```

## GitHub Setup

The project uses **two different GitHub integrations**:

### GitHub OAuth App (user login)

Used by Better Auth to let users sign in with GitHub.

1. GitHub → **Settings** → **Developer settings** → **OAuth Apps** → **New OAuth App**
2. Homepage URL: `http://localhost:3000`
3. Authorization callback URL: `http://localhost:3000/api/auth/callback/github`
4. Copy the **Client ID** and generate a **Client Secret** into `apps/web/.env`.

### GitHub App (installation tokens)

Used to generate short-lived installation access tokens programmatically.

1. GitHub → **Settings** → **Developer settings** → **GitHub Apps** → **New GitHub App**
2. Set required permissions (e.g. repository contents read)
3. Generate a **private key** and copy the **App ID**
4. Install the app on your account/org

> The **installation ID is not hardcoded** — it is resolved dynamically after login by calling `GET /user/installations` with the user's OAuth access token.

## Authentication Flow

1. User clicks **Sign in with GitHub** on `/login`.
2. Better Auth redirects to GitHub and back to `/api/auth/callback/github`.
3. Better Auth stores the user in `users` and the OAuth account (including the access token) in `accounts`.
4. The user is redirected to `/`, which shows their name and email when authenticated.

Only the Better Auth **session token** is stored in a cookie. The GitHub OAuth access token lives in the database (`accounts.access_token`), not in cookies.

## Installation Token Flow

`GET /api/github/installation-token` (requires authentication):

1. Reads the logged-in user's session.
2. Loads their GitHub access token from `accounts`.
3. Resolves the installation ID via `GET /user/installations`.
4. Signs a GitHub App JWT using `GITHUB_PRIVATE_KEY`.
5. Exchanges the installation ID for a short-lived installation token.

Response:

```json
{
  "installationId": 12345678,
  "token": "ghs_...",
  "expiresAt": "2026-08-14T..."
}
```

Core helpers live in `apps/web/app/lib/github-installation.ts`:

- `getInstallationId(userAccessToken)` — resolves the installation ID
- `createInstallationToken(installationId)` — creates the installation token

## Database

All tables are defined in `packages/db/src/schema.ts`:

| Table | Purpose |
|-------|---------|
| `users` | Better Auth users |
| `sessions` | Better Auth sessions |
| `accounts` | OAuth accounts + tokens |
| `verifications` | Email verification tokens |

Better Auth is wired to the **same existing schema** (no separate generated auth schema), using the Drizzle adapter with `usePlural: true`.

### Database commands

Run from the repo root (or inside `packages/db`):

| Command | Description |
|---------|-------------|
| `bun run db:generate --filter=@repo/db` | Generate a migration |
| `bun run db:migrate --filter=@repo/db` | Apply migrations |
| `bun run db:push --filter=@repo/db` | Push schema directly |
| `bun run db:studio --filter=@repo/db` | Open Drizzle Studio |
| `bun run db:test --filter=@repo/db` | Test DB connectivity |

> Drizzle migration folders are gitignored; only `schema.ts` and source code are tracked.

## Scripts

| Command | Description |
|---------|-------------|
| `bun run dev` | Start all dev servers |
| `bun run build` | Build all packages/apps |
| `bun run lint` | Lint all packages/apps |
| `bun run check-types` | Typecheck all packages/apps |

## Key Files

| File | Purpose |
|------|---------|
| `apps/web/app/lib/auth.ts` | Better Auth config + GitHub provider |
| `apps/web/app/lib/github-installation.ts` | GitHub App JWT + installation token helpers |
| `apps/web/app/api/auth/[...all]/route.ts` | Better Auth handler |
| `apps/web/app/api/github/installation-token/route.ts` | Installation token endpoint |
| `apps/web/app/login/` | Login page + form |
| `apps/web/app/page.tsx` | Main page (shows logged-in user info) |
| `packages/db/src/schema.ts` | Canonical DB schema |
| `packages/db/src/index.ts` | Drizzle client export |
