# lfc-B2B-platform-frontend

Espace **B2B** de La Folie Coffee — commandes, clients pro et catalogue.
Angular 22 (zoneless, SSR), design system `fold-ng`. Calqué sur `lfc-PIM-frontend`.

## Dév

```bash
pnpm --filter lfc-b2b-platform-frontend dev     # ng serve → http://localhost:7316
pnpm --filter lfc-b2b-platform-frontend build   # build AOT (défaut = SSR, outputMode server)
pnpm --filter lfc-b2b-platform-frontend test     # Vitest (ng test)
```

## Déploiement — Cloudflare Pages (statique)

Le B2B est derrière login → **pas de besoin SEO**, donc on déploie un **SPA
browser-only** (pas de SSR). ⚠️ Le build par défaut (`ng build`) est SSR
(`outputMode: server`) ; le statique n'existe **que** via la configuration
`cloudflare` (script `build:cloudflare`).

**Méthode : CI (GitHub Actions).** Le workflow `.github/workflows/deploy-b2b.yml`
build (gate `tsc` + `build:cloudflare`) et pousse à Cloudflare Pages (Direct
Upload, projet `lfc-b2b`) à chaque push sur `main`. Build local pour vérifier :

```bash
pnpm --filter lfc-b2b-platform-frontend build:cloudflare
```

👉 **Pas à pas complet** (créer le projet, où trouver l'API token + l'Account ID,
poser les 2 secrets GitHub, méthode Git-integration en annexe) :
[`DEPLOYMENT-CLOUDFLARE.md`](./DEPLOYMENT-CLOUDFLARE.md).

Comme la sortie est 100 % statique, **tous les appels API partent du navigateur**
(aucun fetch côté serveur). En dev, `http://localhost:PORT` marche depuis ta
machine (+ CORS pour l'origine `*.pages.dev`) ; pour tester depuis un autre
appareil, expose le back via `cloudflared tunnel --url http://localhost:PORT`.

## Structure

- `src/app/app.{ts,html,scss}` — le shell (rail non-collapsible, header, footer
  Réglages + Déconnexion).
- `src/app/{dashboard,commandes,clients,catalogue,reglages}/` — les pages
  (placeholders, un dossier par page).
- `src/app/app.routes.ts` — les routes.

Le port de dev (**7316**) est distinct du PIM (**7315**) pour lancer les deux en
parallèle.
