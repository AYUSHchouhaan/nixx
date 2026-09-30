# syntax=docker/dockerfile:1
#
# Next.js web app. Build context must be the repository root:
#   docker build -f apps/web/Dockerfile -t nixx-web .

FROM node:22-bookworm-slim AS nodejs

FROM oven/bun:1.3.12 AS base
WORKDIR /app

# Isolate the web workspace, its workspace dependencies, and a pruned lockfile.
FROM base AS pruner
COPY . .
RUN bunx turbo prune web --docker

# Install from the pruned lockfile so the layer is cached independently of source.
FROM base AS installer
COPY --from=pruner /app/out/json/ ./
COPY --from=pruner /app/out/bun.lock ./bun.lock
RUN bun install --frozen-lockfile

# Build with Node, not Bun. Next.js 16's production build (page data collection)
# runs the compiled server bundles and fails under Bun with
# "Expected CommonJS module to have a function wrapper". Running the build with
# the Node binary keeps Bun only for install and the workspace layout intact.
FROM installer AS builder
COPY --from=nodejs /usr/local/bin/node /usr/local/bin/node
COPY --from=pruner /app/out/full/ ./
WORKDIR /app/apps/web
RUN node /app/apps/web/node_modules/next/dist/bin/next build

# Run on Node rather than Bun for the most reliable Next.js server.
FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages
COPY --from=builder /app/apps/web ./apps/web
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["sh", "-c", "exec node /app/apps/web/node_modules/next/dist/bin/next start -p ${PORT:-3000}"]
