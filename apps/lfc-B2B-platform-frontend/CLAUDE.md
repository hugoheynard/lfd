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
- Le `.scss` n'est créé **que s'il y a du style** (pas de fichier vide pour la
  symétrie) ; un composant sans style n'a pas de `styleUrl`.
- **Un spec par NOUVEAU composant** (`x.spec.ts` colocalisé). On ne backfille pas
  en masse l'existant : on teste en priorité la **logique** (panels de formulaire,
  checkout, activation, tables), pas les vues purement présentationnelles.
- **Services / helpers / modèles ne traînent pas à côté d'une page** : une page
  est dans son dossier ; les fichiers non-composant vivent ailleurs (ex.
  `entreprises/addresses.service.ts` reste, mais `entreprises-page` est dans son
  propre dossier `entreprises-page/`).
- **Exception racine** : le composant `App` (bootstrappé, non routé) reste à
  `src/app/` aux côtés de `app.config.*` / `app.routes.*` — c'est la racine de
  l'app, pas une page.

## Fold d'abord (reuse-before-create)

**Tout composant qui existe dans `fold-ng` vient de `fold-ng`** — jamais de
réimplémentation maison d'un bouton, champ, badge, carte, table, callout, panel.
On ne crée un composant applicatif que pour de la logique **métier**, et il
**compose** des primitives fold. Tokens fold uniquement (`--fold-color-*`,
`--fold-space-*`, …) — pas de couleur ni d'espacement en dur.

### Les états d'une vue passent TOUS par fold (règle permanente)

Chargement, erreur et vide sont des **composants fold**, jamais du balisage
maison. Aucune exception, aucune nouveauté :

| État                       | Le composant                                                                 |
| -------------------------- | ---------------------------------------------------------------------------- |
| Chargement                 | `<fold-loading message="…" />`                                               |
| Erreur de chargement       | `<fold-empty-state tone="alert" title="…">` + un bouton `foldButton` projeté |
| Vide                       | `<fold-empty-state title="…" subtitle="…">` + `<fold-icon empty-icon …>`     |
| Échec **partiel** en ligne | `<fold-callout variant="alert">` — le contenu s'affiche quand même           |

Un `<p class="state">Chargement…</p>` ou un `<div>` d'erreur bricolé est un
défaut à corriger, pas un choix de page. L'erreur et le vide partagent le même
composant à dessein : les deux disent « rien sous les yeux », et se distinguent
par le **ton** et le **texte**, pas par deux mises en page.

⚠️ **Lire la déclaration du composant avant d'utiliser une entrée.** Un attribut
statique inconnu sur un composant Angular **ne lève rien** : `icon="clock"` et
`description="…"` sur `fold-empty-state` compilaient et n'affichaient rien —
l'icône passe par le slot `[empty-icon]`, le texte par `subtitle`. La source est
`node_modules/fold-ng/types/fold-ng.d.ts`.

### Zéro `<select>` natif (règle permanente)

**Aucun `<select>` dans un template.** Le contrôle de choix est
**`<fold-listbox>`**, en API `[options]` — un tableau `{ value, label }` :

```html
<fold-listbox
  size="sm"
  label="Granularité"
  [options]="grains"
  [value]="grain()"
  (selectionChange)="grain.set($event)"
/>
```

Ce n'est pas cosmétique. `[options]` **lie la valeur aux options à la
compilation**, et `selectionChange` rend la valeur **déjà typée** (jamais
`null`). Le `<select>` natif, lui, ne parle que `string` : chaque usage traînait
un handler qui déballait un `Event`, castait en `HTMLSelectElement`, puis
**revalidait** la chaîne contre le tableau d'origine — dix lignes par sélecteur
pour rattraper un type qu'on avait déjà.

- `[(value)]` / `valueChange` quand il faut aussi observer l'effacement (`×`) —
  la valeur y est `T | null`.
- `<fold-option>` projetées seulement si la ligne est riche (icône, second
  niveau) ; sinon `[options]`.
- **Le libellé est visible**, via `label` : un `.visually-hidden` laisse un
  voyant devant une liste déroulante dont rien ne dit ce qu'elle règle.
- `fold-select` existe et enrobe un `<select>` natif : il dépanne pour un
  formulaire simple, mais le défaut est `fold-listbox`.

### Les briques d'une carte (règle permanente)

Une carte de contenu n'est **jamais** un `<article>` stylé à la main :

| Ce qu'on veut                  | Le composant                                                  |
| ------------------------------ | ------------------------------------------------------------- |
| La carte                       | `<fold-card>`                                                 |
| Son en-tête (titre + actions)  | `<fold-element-title variant="title">` + slot `[titleAction]` |
| Une portée / qualification     | le `subtitle` du même composant, pas une pastille maison      |
| Un aparté encadré sous un bloc | `<fold-callout>` (+ `variant="eyebrow"` pour son titre)       |

⚠️ **`interactive` pose `role="button"` sur la carte entière.** Ne l'utiliser que
si la carte est réellement un contrôle unique — jamais quand elle contient un
bouton, un lien ou un graphe. Corollaire : **pas d'ombre au survol** sur une
carte non cliquable ; elle promet un clic qui n'existe pas.

## CSS propre & marges (règles permanentes)

- **Zéro CSS morte.** Toute classe définie dans un `.scss` est référencée dans le
  `.html`/`.ts` du même composant. Une classe non utilisée se supprime.
- **Un composant ne pose JAMAIS sa marge.** Pas de `margin` sur `:host`, ni de
  marge externe / inter-composants, ni de `margin-top/bottom` de séparation entre
  enfants. L'espacement vient :
  - du **`gap`** du conteneur flex/grid parent (y compris les slots de
    `fold-page-layout`, `fold-aside-layout`, panels `.body`) ;
  - des **écarts naturels** des composants fold.
    Seules exceptions tolérées : `margin: auto` (centrage / poussée flex, ex.
    `.foot { margin-top: auto }`), `margin: 0` (reset), et une **marge négative**
    délibérée de chevauchement (effet visuel, ex. `featured-flag`). Pour séparer un
    label de son contrôle, envelopper la paire dans un flex-column avec `gap` — pas
    un `margin-bottom` sur le label.

## Toute page dans un fold-page-layout

Tout composant **routé** a `<fold-page-layout>` comme élément **racine** de son
template (titre, description, `[pageActions]`, rythme via `gap`). Exception : les
pages **publiques hors-shell** (ex. `login`), rendues bare dans la branche
non-authentifiée d'`app.html`.

## Shell

- Rail primaire **toujours étendu et non-collapsible** (pas de `collapsible`,
  donc pas de chevron ; `[expanded]="true"` figé). Devient un tiroir off-canvas
  ≤768px. Voir `app.html` / `app.ts`.
- Header type La Folie Coffee (surface `chrome`, thème `navi`), recherche,
  avatar. **Réglages** et **Déconnexion** vivent dans le footer du menu.

## Backend (contexte)

Contrairement au PIM (POC frontend-only sur LocalDb), la plateforme B2B parle à un
**vrai backend** (`apps/lfd-api`, NestJS + Prisma, db commerce
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
- **Adresses de livraison** (`AddressesService`, réelles par entreprise) —
  l'adresse **par défaut remonte toujours en tête** (le backend la trie). Note
  livreurs + **créneaux préférés** (`everyday` = global, ou `perDay` = par jour) +
  contact sur place + point GPS, tout édité par `adresse-panel` (natifs
  `<textarea>`/`<input type="time">`, lus via un helper `inputValue()` typé — pas de
  `$any`). Types = `@lfd/contracts` ; formateurs neutres dans
  `entreprises/delivery-format.ts`.

✅ Dans l'onglet d'une entreprise, **tout** est servi par l'API par entreprise :
identité, contacts, KBIS, **adresses** (facturation + livraison via
`AddressesService`) et **facturation** (condition de règlement, **lecture seule** —
réglage toujours présent, défaut « à la commande », validé par le commercial ;
exposée dans `/me` via `CompanyView.paymentTerm`). Le `ProfilService` démo ne sert
plus que `societe-section` (héritage). Les types de fil viennent de
`@lfd/contracts` en **import de type** (aucun zod dans le bundle) — l'app reste un
puits, elle ne possède jamais le contrat.

⚠️ `tsc -p tsconfig.json` ne vérifie **rien** ici (`files: []` + `references`).
Pour type-checker : `npx tsc --noEmit -p tsconfig.app.json`, ou `pnpm build`
(compilation AOT des templates comprise).
