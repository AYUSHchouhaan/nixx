# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Developers who sign in with GitHub. Their situation: they have coding work to do on a repository and want an AI agent to carry it out without running untrusted code on their own machine. Their job: pick a repository and branch, hand the agent a task, and review the resulting pull request.

## Product Purpose

Nixx lets a developer hand a coding task to an AI agent that does the work inside an isolated sandbox — never touching their local machine — and delivers the result as a reviewable GitHub pull request.

## Positioning

Runs AI coding work in an isolated sandbox and opens real GitHub PRs. Safety by design: the agent never touches the developer's machine, and durable output survives as reviewable PRs rather than ephemeral edits.

## Operating Context

The developer signs in with GitHub (OAuth via Better Auth, plus a GitHub App installation token) and works through a web interface. The system splits reasoning and execution: agent-brain (LangGraph) owns reasoning; sandbox-worker executes sandbox commands (read_file, glob, grep, run_command, create_file, edit_file) inside a cloned repository. The two communicate through BullMQ/Redis queues. The web app is the primary backend — it owns auth, conversations/threads, and the run flow, and calls agent-brain. Durable artifacts are commits and PRs pushed to GitHub (feature branches named `nixx/{threadId}`), persisted in Postgres (Drizzle) alongside users/accounts/sessions.

## Capabilities and Constraints

- Confirmed functionality: GitHub OAuth login, GitHub App installation tokens, repository/branch listing, conversation and thread management, and an agent run endpoint.
- Current frontend is create-next-app boilerplate. To be built now: a landing page (what Nixx is, how it works, and an "Open app" action that routes logged-out users to login) and a login page (Sign in with GitHub). The chat/app interface is intentionally deferred.
- Deferred (not built yet): chat UI, streaming agent events (SSE), agent-output UI, sandbox write tools in the agent path, and real sandbox provisioning (sandboxId currently falls back to threadId).

## Brand Commitments

- Name: Nixx (committed). No logo, voice, or visual identity exists yet.
- Binding visual constraints from the user: professional and minimalist; minimal animation (avoid hover-style motion); light/dark theme support; must not feel hype-y or consumer-AI-startup.
- Standing aesthetic preference (canon): the familiar, standard AI developer-tool landing, executed at the craft level of Cursor, GitHub Copilot, and Devin.

## Evidence on Hand

- docs/README.md (agent ↔ sandbox architecture reference), docs/architecture.html, docs/pr-flow.md, docs/agent-sandbox-roundtrip.html, docs/result-consumer-pending-calls.md, docs/sandbox-clone-reuse.md.
- No testimonials, customers, or benchmarks exist; future work must not fabricate them.

## Product Principles

1. Safety by design — all agent execution happens in an isolated sandbox, never on the developer's machine.
2. Durable, reviewable output — work lands as real GitHub PRs, not ephemeral edits.
3. Reasoning and execution stay decoupled — the brain (LangGraph) and the sandbox worker each own one job, connected by queues.
4. The web app is the primary backend — it owns auth, threads, conversations, and the run flow.
5. Build the smallest truthful scope — defer non-essential features rather than over-building.
