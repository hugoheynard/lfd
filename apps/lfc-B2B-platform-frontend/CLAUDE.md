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

Contrairement au PIM (POC frontend-only sur LocalDb), la plateforme B2B parle à un
**vrai backend** (`apps/lfc-B2B-platform-backend`, NestJS + Prisma, db commerce
distincte de celle du PIM). `HttpClient` est provisionné en mode `fetch`
(`app.config.ts`).

### Qui détient quoi

- **`auth/auth.facade.ts`** — Auth0 et rien d'autre : « ce porteur a prouvé ce
  `sub` ». Seule frontière avec le SDK (absent côté serveur), et seule source de
  jeton d'accès (`accessToken$()`). Les services métier n'injectent **jamais**
  `AuthService`, ce qui les garde SSR-safe.
- **`account/account.service.ts`** — ce que **notre base** dit : le profil de la
  personne et ses entreprises (`GET /me`), plus les écritures. Dépendance à sens
  unique : ce service connaît la façade, jamais l'inverse.

### La chaîne compte / entreprises

Une **personne** et une **entreprise** sont deux choses distinctes (le backend
porte des `memberships` 0..N, pas un `company_id` unique) :

- **Réglages → Mon profil** (`reglages/profil-section/`) — prénom, nom, e-mail,
  téléphone. Changer l'e-mail le propage à Auth0, qui en est propriétaire.
- **Mes entreprises** (`entreprises/`) — remplace l'ancienne page « Mon profil » ;
  `/profil` y redirige. Aucune entreprise → empty state fold + « Créer une
  entreprise » ; une seule → sa fiche **sans onglet** ; plusieurs → un
  `fold-tab-panel` chacune.

⚠️ Dans l'onglet d'une entreprise, seule l'**identité légale** vient de l'API.
Contact, adresses et facturation lisent encore `data/profil.service.ts` (en
mémoire, données de démonstration) — un `fold-callout` le dit à l'utilisateur, et
c'est la tranche suivante à câbler.

⚠️ `tsc -p tsconfig.json` ne vérifie **rien** ici (`files: []` + `references`).
Pour type-checker : `npx tsc --noEmit -p tsconfig.app.json`, ou `pnpm build`
(compilation AOT des templates comprise).
