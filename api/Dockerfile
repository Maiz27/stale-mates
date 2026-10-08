# syntax=docker/dockerfile:1

# ---- Dependencies / build stage ----
# Bun installs exactly what api/bun.lock pins (--frozen-lockfile fails the build
# if package.json and the lockfile disagree), then tsc compiles src/ -> dist/.
# Keep the Bun version in sync with .github/workflows/ci.yml (BUN_VERSION).
FROM oven/bun:1.4.2-alpine AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN bun run build

# Reinstall production-only dependencies (still lockfile-pinned) for the runtime image.
RUN rm -rf node_modules && bun install --frozen-lockfile --production

# ---- Runtime stage ----
# The compiled server runs on plain Node (the target the code is written and
# tested for); Bun is only the package manager.
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Run as the unprivileged user that ships with the node image.
USER node

EXPOSE 3000

# Hit the Express /health endpoint; respect a custom PORT if set.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Matches package.json "start": node dist/index.js
CMD ["node", "dist/index.js"]
