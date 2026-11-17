# syntax=docker/dockerfile:1.7

# ── base ──────────────────────────────────────────────────────────────
FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache tini

# ── deps: full dependency tree (cached on lockfile) ──────────────────
FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

# ── build: compile TypeScript → dist ─────────────────────────────────
FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

# ── prod-deps: runtime dependencies only ─────────────────────────────
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --ignore-scripts

# ── tools: used by `docker compose run seed` (has tsx + faker) ───────
FROM deps AS tools
COPY tsconfig.json ./
COPY src ./src
COPY scripts ./scripts
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["npx", "tsx", "scripts/seed.ts"]

# ── runtime: small, non-root production image ────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    PORT=4000
COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/health >/dev/null || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/server.js"]
