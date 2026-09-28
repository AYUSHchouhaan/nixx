# syntax=docker/dockerfile:1
#
# LangGraph server (the "coding" graph). Build context must be the repository root:
#   docker build -f apps/agent-brain/Dockerfile -t nixx-agent-brain .
#
# Note: this runs the LangGraph dev server. The CLI's engines are Node
# (^18.19 || >=20.16) and it loads the TypeScript graph via tsx, so it runs on
# Node, not Bun.

FROM oven/bun:1.3.12 AS base
WORKDIR /app

FROM base AS pruner
COPY . .
RUN bunx turbo prune agent-brain --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM node:22-bookworm-slim AS runner
WORKDIR /app
COPY --from=installer /app ./
WORKDIR /app/apps/agent-brain
ENV NODE_ENV=production
EXPOSE 4000
CMD ["sh", "-c", "exec node /app/node_modules/.bin/langgraphjs dev --config langgraph.json --port ${PORT:-4000} --host 0.0.0.0 --no-browser"]
