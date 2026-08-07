# --- Build stage: compile TypeScript, including devDependencies ---
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# src/dev (dev-only Super Admin auto-login, see
# src/dev/dev-auto-login.controller.ts) compiles here like any other
# module — nest build/nest start share one tsconfig.build.json, and
# excluding it there would also break local `npm run start:dev`. This
# is the actual seam between "compiled locally" and "shipped to prod":
# strip it before the runtime stage's COPY below ever sees it, so the
# production image contains it nowhere, not even as inert dead code.
RUN rm -rf dist/dev

# --- Runtime stage: production deps + compiled dist only ---
FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

EXPOSE 3001
CMD ["node", "dist/main"]
