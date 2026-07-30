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
  entreprise » ; une seule → sa fiche **sans barre** ; plusieurs → une barre
  `fold-view-nav` (horizontale, `activeStyle="fill"`, transparente) qui bascule
  entre les fiches (boutons pilotés par `activeKey`, ce ne sont pas des routes).
  Le bouton « Créer une entreprise » vit dans le slot `[pageActions]`.
- **Contacts par entreprise** (`entreprises/company-contacts-section/`) — liste de
  cartes ; carte 1 = contact principal (« Admin du compte entreprise », badge
  **Vous** si c'est vous ; carte en `surface="accent"` + `raisedBands="both"`),
  puis les additionnels. Bande titre _raised_ + menu dropover (`fold-dropdown`) :
  « Modifier » partout, « Supprimer » (→ `fold-inline-confirm`) sur les
  additionnels, qui portent aussi un callout « pas d'espace utilisateur » + bouton
  **Inviter** (pas encore câblé). Réservé au `company_admin` (lecture seule sinon).
- **KBIS** (`entreprises/entreprise-identite/`) — bloc sous l'identité : badge
  Certifié (= entreprise validée) / En attente, **Voir** (blob → onglet) +
  **Télécharger** (blob → download) pour tout membre, **Déposer/Remplacer**
  (`<label foldButton>` + input file caché) pour le gestionnaire.
  `AccountService.uploadKbis` / `fetchKbis`.
- **Dropover + inline-confirm** est le pattern d'actions de ligne partagé :
  contacts ET adresses de livraison (`profil/adresses-section/`) l'utilisent.
- **Adresses de livraison** — l'adresse **par défaut remonte toujours en tête** de
  la pile (tri stable dans le computed `adressesLivraison`). Le type suit une
  chaîne : base `Adresse` (postale) puis `AdresseLivraison = Adresse &
  DeliverySpecs` où `DeliverySpecs` = une **note pour les livreurs** + des
  **créneaux préférés** (`DeliverySlots` : `everyday` = un créneau global tous les
  jours, ou `perDay` = un créneau optionnel par jour ouvré). Le panneau
  `adresse-panel` édite tout ça (natifs `<textarea>`/`<input type="time">`, lus via
  un helper `inputValue()` typé — pas de `$any`).

⚠️ Dans l'onglet d'une entreprise, identité légale, **contacts** et **KBIS**
viennent de l'API. **Adresses et facturation** lisent encore
`data/profil.service.ts` (en mémoire, démo) — un `fold-callout` le dit, c'est la
tranche suivante à câbler. Quand ce fil existera, `DeliverySpecs` (`note`,
`slots`) est le sous-ensemble à promouvoir dans un futur package feuille
`@lfd/contracts` (Zod), consommé par back **et** front — l'app reste un puits, elle
ne possède jamais le contrat (cf. la même logique que `@lfd/storage`).

⚠️ `tsc -p tsconfig.json` ne vérifie **rien** ici (`files: []` + `references`).
Pour type-checker : `npx tsc --noEmit -p tsconfig.app.json`, ou `pnpm build`
(compilation AOT des templates comprise).
