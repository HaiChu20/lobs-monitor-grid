# Multi-stage build for the Streamer Status dashboard (TanStack Start → Node).
# OpenShift/Rahti-safe: runs as a non-root arbitrary UID in group 0, writes only
# to /data (a PVC), listens on a non-privileged port.

# ---- build stage ------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Produces .output/ via the node-server Nitro preset (pinned in vite.config.ts).
RUN npm run build

# ---- runtime stage ----------------------------------------------------------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    STATE_DIR=/data
# The node-server preset bundles all deps into .output, so no node_modules needed.
COPY --from=build /app/.output ./.output
# OpenShift assigns a random non-root UID in the root group (GID 0). Make the app
# and state dirs group-owned by 0 and group-writable so that UID can write them.
RUN mkdir -p /data \
 && chgrp -R 0 /app /data \
 && chmod -R g=u /app /data
EXPOSE 8080
USER 1001
CMD ["node", ".output/server/index.mjs"]
