# syntax=docker/dockerfile:1
#
# citystates container image.
#   docker build --target test .            -> runs the test suite
#   docker build -t citystates:latest .      -> builds the runtime image
# Normally driven by scripts/pipeline.sh.

ARG BUN_VERSION=1.3.9
ARG NODE_VERSION=24

# ---- base: shared builder image (has a shell, never shipped) --------------
FROM oven/bun:${BUN_VERSION}-slim AS base
WORKDIR /app
ENV BUN_RUNTIME_TRANSPILER_CACHE_PATH=0

# ---- deps: production dependencies only ------------------------------------
FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production --ignore-scripts

# ---- full: all dependencies and the source ---------------------------------
FROM base AS full
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --ignore-scripts
COPY . .
RUN bunx svelte-kit sync

# ---- test: the test suite ---------------------------------------------------
FROM full AS test
RUN bun test

# ---- build: the static client ------------------------------------------------
# Vite runs on node: under bun alone SvelteKit stops after "Analysing routes" without writing build/
FROM node:${NODE_VERSION}-slim AS build
WORKDIR /app
COPY --from=full /app ./
# SvelteKit checks that DATABASE_URL is set; the build itself never opens the database
RUN DATABASE_URL=file:/tmp/build.db node node_modules/vite/bin/vite.js build

# ---- app: what ships (server code, tests stripped) -------------------------
FROM base AS app
COPY package.json server.ts ./
COPY src/lib/server ./src/lib/server
COPY src/lib/game ./src/lib/game
COPY --from=build /app/build ./build
RUN find . -name '*.test.ts' -delete \
 && mkdir -p /data \
 && chmod -R a-w /app \
 # libsql's native module needs libgcc_s, which distroless lacks (path kept, so it works for amd64 and arm64)
 && mkdir /libs && cp --parents /usr/lib/*-linux-gnu/libgcc_s.so.1 /libs

# ---- runtime: distroless, no shell, no package manager, non-root ----------
FROM oven/bun:${BUN_VERSION}-distroless AS runtime

LABEL org.opencontainers.image.title="citystates" \
      org.opencontainers.image.description="City States of Italy, served at /games/citystates"

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=5160 \
    BUN_RUNTIME_TRANSPILER_CACHE_PATH=0 \
    DATABASE_URL=file:/data/citystates.db

WORKDIR /app
# code and deps are owned by root and read-only; only /data belongs to the app user
COPY --from=deps /app/node_modules ./node_modules
COPY --from=app /app ./
COPY --from=app /libs/ /
COPY --from=app --chown=65532:65532 /data /data

# distroless "nonroot" user
USER 65532:65532

VOLUME ["/data"]
EXPOSE 5160

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||5160)+'/games/citystates/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["bun"]
CMD ["server.ts"]
