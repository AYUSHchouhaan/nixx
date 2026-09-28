# syntax=docker/dockerfile:1
#
# BullMQ worker that executes sandbox operations through Daytona.
# Build context must be the repository root:
#   docker build -f apps/sandbox-worker/Dockerfile -t nixx-sandbox-worker .
#
# This builds the worker service. It is unrelated to
# apps/sandbox-worker/sandbox/Dockerfile, which builds the Daytona snapshot image.

FROM oven/bun:1.3.12 AS base
WORKDIR /app

FROM base AS pruner
COPY . .
RUN bunx turbo prune sandbox-worker --docker

FROM base AS installer
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

FROM installer AS runner
COPY --from=pruner /app/out/full/ ./
WORKDIR /app/apps/sandbox-worker
ENV NODE_ENV=production
CMD ["bun", "run", "src/main.ts"]
