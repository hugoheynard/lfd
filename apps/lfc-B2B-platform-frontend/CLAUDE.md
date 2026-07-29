# lfc-B2B-platform-frontend — conventions

Espace **B2B** de La Folie Coffee : commandes, clients pro (jusqu'à ~200) et
catalogue. Calqué sur `lfc-PIM-frontend` (même stack Angular 22 zoneless SSR,
même design fold-ng, même shell). Les mêmes règles s'appliquent.

## Un dossier par composant (règle permanente)

Chaque unité (page, composant, widget) vit dans **son propre dossier**, fichiers
**séparés** :

```
commandes/
  commandes-page.ts       # logique + @Component (templateUrl/styleUrl)
  commandes-page.html     # le template
  commandes-page.scss     # les styles
  commandes-page.spec.ts  # les tests (quand il y en a)
```

- Pas de `template:` ni `styles:` inline dans le `.ts` — toujours
  `templateUrl` / `styleUrl` vers les fichiers frères.
- Nom du dossier = nom du composant (kebab-case) ; les fichiers reprennent ce nom.
- `ViewEncapsulation.None` autorisé **uniquement** pour relocaliser du CSS global.

## Fold d'abord (reuse-before-create)

**Tout composant qui existe dans `fold-ng` vient de `fold-ng`** — jamais de
réimplémentation maison d'un bouton, champ, badge, carte, table, callout, panel.
On ne crée un composant applicatif que pour de la logique **métier**, et il
**compose** des primitives fold. Tokens fold uniquement (`--fold-color-*`,
`--fold-space-*`, …) — pas de couleur ni d'espacement en dur.

## Shell

- Rail primaire **toujours étendu et non-collapsible** (pas de `collapsible`,
  donc pas de chevron ; `[expanded]="true"` figé). Devient un tiroir off-canvas
  ≤768px. Voir `app.html` / `app.ts`.
- Header type La Folie Coffee (surface `chrome`, thème `navi`), recherche,
  avatar. **Réglages** et **Déconnexion** vivent dans le footer du menu.

## Backend (contexte)

Contrairement au PIM (POC frontend-only sur LocalDb), la plateforme B2B cible un
**vrai backend Prisma** (potentiellement la base partagée avec le PIM). En
attendant, les pages sont des placeholders ; `HttpClient` est déjà provisionné
en mode `fetch` (`app.config.ts`) pour câbler l'API dès qu'elle existe.
