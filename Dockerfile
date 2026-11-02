# Docker Registry v2 manifest: https://registry-1.docker.io/v2/library/node/manifests/26.13.0-trixie-slim
# Digest retrieved at 2026-11-02T16:54:31Z; registry Date: Mon, 02 Nov 2026 16:54:29 GMT.
# Multi-platform manifest digest: sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39.

FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS build
WORKDIR /app
RUN npm install --global pnpm@12.16.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY apps/web apps/web
RUN pnpm --filter api build && pnpm --filter web build

FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS production-dependencies
WORKDIR /app
RUN npm install --global pnpm@12.16.1
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --prod --frozen-lockfile --filter api

FROM node:26.13.0-trixie-slim@sha256:e4db4c914bf8ad241bd24804fc25d272d89bad97e68cdc8a1414862790a02c39 AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=production-dependencies --chown=node:node /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=production-dependencies --chown=node:node /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=node:node /app/apps/api/src ./apps/api/src
COPY --from=build --chown=node:node /app/apps/web/dist /app/apps/web/dist
USER node
EXPOSE 8787
CMD ["node", "apps/api/src/main.ts"]
