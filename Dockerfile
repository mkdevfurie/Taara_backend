# syntax=docker/dockerfile:1.7
# ============================================================
# TAARA Backend — Docker multi-stage (Cloud Run optimisé)
# ============================================================

ARG NODE_VERSION=22-alpine

# ---------- Stage 1 : deps + build ----------
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
ENV NODE_ENV=development

# Dépendances système requises par Prisma sur Alpine
RUN apk add --no-cache openssl libc6-compat

COPY package*.json ./
COPY prisma ./prisma
RUN npm ci

COPY tsconfig*.json nest-cli.json ./
COPY src ./src

RUN npx prisma generate
RUN npm run build

# ---------- Stage 2 : runtime ----------
FROM node:${NODE_VERSION} AS runner
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    NPM_CONFIG_LOGLEVEL=error

RUN apk add --no-cache openssl libc6-compat tini

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER node
EXPOSE 8080

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
