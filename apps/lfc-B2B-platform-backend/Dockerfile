# Image du backend B2B (NestJS + Prisma via adapter-pg → PAS d'engine natif).
#
# ⚠️ CONTEXTE DE BUILD = RACINE DU MONOREPO (pas le dossier de l'app) : le build a
#    besoin de pnpm-workspace.yaml + packages/*. À vérifier/forcer côté wrangler au
#    1er `wrangler deploy` (option de build context) — c'est LE point à ajuster.
#
# Secrets RUNTIME (DATABASE_B2B_URL, Auth0, STRIPE_*) : PAS dans l'image → posés une
# fois via `wrangler secret put <NAME>` (ils arrivent comme variables d'env au Worker).

# ---- build ----
FROM node:22-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
# Types/libs partagés, client Prisma, puis build du backend.
RUN pnpm -r --filter "./packages/*" run build
RUN pnpm --filter lfc-b2b-platform-backend exec prisma generate
RUN pnpm --filter lfc-b2b-platform-backend run build
# Dossier autonome (app + deps prod) — voir NOTE pnpm deploy dans CONTAINERIZE-NOTES.
RUN pnpm --filter lfc-b2b-platform-backend deploy --prod /app

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY --from=build /app ./
EXPOSE 8080
CMD ["node", "dist/main.js"]
