# syntax=docker/dockerfile:1

# ---- Build stage ----
# Compile TypeScript (src/) to JavaScript (dist/) with all deps available.
FROM node:22-alpine AS build

WORKDIR /app

# Install all dependencies (incl. devDependencies for tsc).
COPY package.json ./
RUN npm install

# Copy source and compile (tsc -> dist/, per tsconfig.json outDir).
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Prune to production-only dependencies for the runtime image.
RUN npm prune --omit=dev

# ---- Runtime stage ----
FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

# Copy production node_modules and compiled output from the build stage.
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
