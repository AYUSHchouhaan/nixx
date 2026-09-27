# Nixx sandbox image — Node.js runtime for React / Next.js repositories.
# Built into the Daytona snapshot "nixx-node" via scripts/build-snapshot.ts.

# Full "node" tag (buildpack-deps base): python3, gcc, g++, make, git and curl
# ship with it for node-gyp native module builds. Do not switch to -slim
# (drops the toolchain) or -alpine (musl breaks Next.js SWC binaries).
FROM node:22-bookworm

# Daytona sandboxes run as user "daytona" (see src/daytona.ts). The node base
# image ships user "node" (uid/gid 1000, home /home/node) — rename it so the
# user matches SANDBOX_ROOT_DIR (/home/daytona) and owns the clone directory.
RUN groupmod -n daytona node \
    && usermod -l daytona -d /home/daytona -m -s /bin/bash node \
    && apt-get update \
    && apt-get install -y --no-install-recommends ripgrep \
    && rm -rf /var/lib/apt/lists/*

# pnpm / yarn shims (corepack ships with Node.js).
RUN corepack enable

WORKDIR /home/daytona
USER daytona

# Suppresses the corepack download prompt during installs.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
