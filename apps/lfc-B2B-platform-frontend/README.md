# lfc-B2B-platform-frontend

Espace **B2B** de La Folie Coffee — commandes, clients pro et catalogue.
Angular 22 (zoneless, SSR), design system `fold-ng`. Calqué sur `lfc-PIM-frontend`.

## Dév

```bash
pnpm --filter lfc-b2b-platform-frontend dev     # ng serve → http://localhost:7316
pnpm --filter lfc-b2b-platform-frontend build   # build AOT (SSR)
pnpm --filter lfc-b2b-platform-frontend test     # Vitest (ng test)
```

## Structure

- `src/app/app.{ts,html,scss}` — le shell (rail non-collapsible, header, footer
  Réglages + Déconnexion).
- `src/app/{dashboard,commandes,clients,catalogue,reglages}/` — les pages
  (placeholders, un dossier par page).
- `src/app/app.routes.ts` — les routes.

Le port de dev (**7316**) est distinct du PIM (**7315**) pour lancer les deux en
parallèle.
