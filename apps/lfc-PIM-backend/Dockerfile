# Image du backend PIM (NestJS + Prisma via adapter-pg → PAS d'engine natif).
# ⚠️ CONTEXTE DE BUILD = RACINE DU MONOREPO. Secrets runtime via `wrangler secret put`.
# Voir apps/lfd-api/Dockerfile + CONTAINERIZE-NOTES.md.

# ---- build ----
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm -r --filter "./packages/*" run build
RUN pnpm --filter lfc-pim-backend exec prisma generate
RUN pnpm --filter lfc-pim-backend run build
# `--legacy` OBLIGATOIRE depuis pnpm v10 (sinon ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE) —
# même raison et même choix que le backend B2B, cf. son Dockerfile.
RUN pnpm --filter lfc-pim-backend deploy --legacy --prod /app

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app ./
EXPOSE 8080
CMD ["node", "dist/main.js"]
