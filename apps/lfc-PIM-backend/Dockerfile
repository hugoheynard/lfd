# Image du backend PIM (NestJS + Prisma via adapter-pg → PAS d'engine natif).
# ⚠️ CONTEXTE DE BUILD = RACINE DU MONOREPO. Secrets runtime via `wrangler secret put`.
# Voir apps/lfc-B2B-platform-backend/Dockerfile + CONTAINERIZE-NOTES.md.

# ---- build ----
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r --filter "./packages/*" run build
RUN pnpm --filter lfc-pim-backend exec prisma generate
RUN pnpm --filter lfc-pim-backend run build
RUN pnpm --filter lfc-pim-backend deploy --prod /app

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app ./
EXPOSE 8080
CMD ["node", "dist/main.js"]
