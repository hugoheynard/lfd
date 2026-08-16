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
#
# `--legacy` est OBLIGATOIRE depuis pnpm v10 : sans lui, `deploy` exige
# `inject-workspace-packages=true` sur le workspace et s'arrête en
# ERR_PNPM_DEPLOY_NONINJECTED_WORKSPACE. Constaté au 1er déploiement réel
# (2026-08-13) — les notes de containerisation l'avaient anticipé.
#
# On reste en legacy plutôt que d'activer l'injection à la racine : celle-ci
# changerait la façon dont TOUTES les apps du monorepo résolvent leurs paquets
# internes, y compris en dev. Un réglage global pour satisfaire une étape de
# build serait payé par tout le monde.
RUN pnpm --filter lfc-b2b-platform-backend deploy --legacy --prod /app

# ---- runtime ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
# La révision est GRAVÉE DANS L'IMAGE, jamais transmise par le Worker : c'est ce
# qui en fait une réponse fiable à « qu'est-ce qui tourne, là, maintenant ? ».
# Passée par le Worker, elle changerait sans que l'image change, et l'instance
# mentirait sur elle-même — exactement l'inverse de ce qu'on lui demande.
ARG APP_REVISION=""
ENV APP_REVISION=$APP_REVISION
COPY --from=build /app ./
EXPOSE 8080
CMD ["node", "dist/main.js"]
