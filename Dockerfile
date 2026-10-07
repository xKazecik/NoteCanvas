# Combined image: the Vite frontend (served by nginx) and the Node backend in a
# single container, so one tag ships the whole app.
#
# Upstream builds these as two images -- backend/Dockerfile and
# frontend/Dockerfile -- and the two builder stages below mirror those builds
# step for step. The runtime stage joins them and docker/entrypoint.sh runs both
# processes side by side.

# ---------------------------------------------------------------------------
# Frontend build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better caching. The Excalidraw engine is
# vendored as npm workspaces, so npm ci needs every workspace manifest present
# before it will install; the sources themselves come with the COPY below.
COPY frontend/package*.json ./
COPY frontend/excalidraw-engine/packages/common/package.json ./excalidraw-engine/packages/common/
COPY frontend/excalidraw-engine/packages/element/package.json ./excalidraw-engine/packages/element/
COPY frontend/excalidraw-engine/packages/excalidraw/package.json ./excalidraw-engine/packages/excalidraw/
COPY frontend/excalidraw-engine/packages/math/package.json ./excalidraw-engine/packages/math/
COPY frontend/excalidraw-engine/packages/utils/package.json ./excalidraw-engine/packages/utils/

RUN npm ci && npm cache clean --force

# Copy source code and config files
COPY frontend/ ./
COPY VERSION ../VERSION

# Build arguments.
# VITE_API_URL defaults to /api on purpose: frontend/.env.production ships that
# value, an env var set here would override it, and getSocketUrl() falls back to
# http://localhost:8000 for anything other than "/api" -- which breaks
# collaboration websockets in the browser.
ARG VITE_API_URL=/api
ARG VITE_APP_VERSION
ARG VITE_APP_BUILD_LABEL
ARG VITE_EXCALIDASH_UI_FONT_FAMILY
ARG VITE_EXCALIDASH_UI_FONT_URL
ENV VITE_API_URL=$VITE_API_URL \
    VITE_APP_VERSION=$VITE_APP_VERSION \
    VITE_APP_BUILD_LABEL=$VITE_APP_BUILD_LABEL \
    VITE_EXCALIDASH_UI_FONT_FAMILY=$VITE_EXCALIDASH_UI_FONT_FAMILY \
    VITE_EXCALIDASH_UI_FONT_URL=$VITE_EXCALIDASH_UI_FONT_URL

RUN npm run build

# ---------------------------------------------------------------------------
# Backend build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS backend-builder

WORKDIR /app

# Native build deps for modules that may compile from source (e.g., better-sqlite3 on arm64)
RUN apk add --no-cache python3 make g++

COPY backend/package*.json ./
COPY backend/tsconfig.json ./

RUN npm ci && npm cache clean --force

COPY backend/prisma ./prisma/

# Set default provider for build-time Prisma generation (runtime can override via DATABASE_PROVIDER)
RUN sed -i '/datasource db {/,/}/ s/provider = env("[^"]*")/provider = "sqlite"/; /datasource db {/,/}/ s/provider = "[^"]*"/provider = "sqlite"/' prisma/schema.prisma

# Generate Prisma Client at build time (for TypeScript compilation)
RUN npx prisma generate

COPY backend/src ./src

RUN npx tsc

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:20-alpine

# The update check compares this against the latest published image version.
ARG VITE_APP_VERSION
ENV APP_VERSION=$VITE_APP_VERSION

# nginx joins the backend's runtime packages here; su-exec is what the backend
# entrypoint uses to drop from root to the nodejs user.
RUN apk add --no-cache openssl su-exec nginx && \
    addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    mkdir -p /run/nginx

WORKDIR /app

COPY backend/package*.json ./

# Install production dependencies only
RUN apk add --no-cache --virtual .build-deps python3 make g++ && \
    npm ci --omit=dev && \
    npm cache clean --force && \
    apk del .build-deps

# Copy prisma schema and migrations for runtime and hydration template
COPY backend/prisma ./prisma/
COPY backend/prisma ./prisma_template/

COPY --from=backend-builder /app/dist ./dist

# Copy the generated Prisma Client from builder (will be regenerated at runtime if provider changes)
COPY --from=backend-builder /app/src/generated ./dist/generated

# Create necessary directories (ownership will be set in entrypoint)
RUN mkdir -p /app/uploads /app/prisma

# The stock backend entrypoint: secrets, Prisma generate, migrations, exec node.
COPY backend/docker-entrypoint.sh ./

# Static frontend plus the nginx config template rendered at startup
COPY --from=frontend-builder /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf.template /etc/nginx/nginx.conf.template

COPY docker/entrypoint.sh /entrypoint.sh

# .gitattributes keeps these LF, but a working tree cloned before it existed (or
# with core.autocrlf=true) still yields CRLF, and a CR in the shebang makes the
# kernel report "not found". Strip them so the build works from any checkout.
RUN sed -i 's/\r$//' /app/docker-entrypoint.sh /entrypoint.sh && \
    chmod +x /app/docker-entrypoint.sh /entrypoint.sh

# Stays root: the backend entrypoint fixes volume ownership before dropping to nodejs.

EXPOSE 80

ENTRYPOINT ["/entrypoint.sh"]
