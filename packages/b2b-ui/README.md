# @lfd/b2b-ui

Composants de **présentation** partagés entre les frontends B2B — la plateforme
client (`lfc-B2B-platform-frontend`) et l'admin staff (`lfc-B2B-admin-frontend`).
Les deux affichent les mêmes entités (société, contacts, commandes…) ; leur
apparence vit ici, une seule fois.

## Ce qui appartient à ce package

**Présentation only.** Un composant d'ici :

- reçoit tout par `input()` — un **view-model neutre** + des drapeaux de
  **capacité** — et communique par `output()` (des **intentions**) ;
- n'`inject`e **aucun** service, ne `fetch` rien, ne **mute** rien, n'ouvre
  aucun panneau, ne connaît **aucun** modèle d'app (`Company`, `AdminCompany`…)
  ni endpoint ;
- ne branche **jamais** sur _qui_ l'affiche. Pas de `isAdmin`. Une différence
  client/admin s'exprime en **valeurs d'input** (view-model, capacités, texte,
  slots), jamais en conditionnel d'identité — sinon un 3ᵉ consommateur (support,
  aperçu prospect…) casse le composant.

Test d'appartenance d'un nouvel input : s'il nomme un **comportement** ou une
**donnée** (`canManage`, `density`, `kbisEmptyHint`) → oui. S'il nomme un
**appelant** (`isAdmin`, `isCustomer`) → non.

## Ce qui n'appartient PAS ici

- Générique et agnostique du domaine → **`fold-ng`** (le design system).
- Données, auth, mutations, ouverture de panneaux → **dans les apps**. Chaque
  app enveloppe la vue dans un _container_ qui injecte ses services et mappe
  _son_ modèle vers le view-model neutre.

## Structure

Un dossier par domaine, exporté en subpath :

- `@lfd/b2b-ui/company` — identité légale, contacts, KBIS…
- _(à venir)_ `@lfd/b2b-ui/orders` — timeline de commandes…

## Consommation

Lib **source** (pas de build, pas de `ng-packagr`, pas de `dist`) : les apps la
compilent via un `paths` tsconfig pointant vers `src`. Ajouter dans l'app :

```jsonc
// tsconfig.json → compilerOptions.paths
"@lfd/b2b-ui/company": ["../../packages/b2b-ui/src/company/index.ts"]
```

et `"@lfd/b2b-ui": "workspace:*"` dans ses dépendances.
