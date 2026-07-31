# lfc-suite-shell — l'hôte de la suite interne

Shell **hôte** de l'outillage interne LFC (PIM + futur B2B admin). Un seul login,
un rail primaire = switcher d'apps, l'app montée occupe le content. Les apps
restent des **builds/déploiements indépendants** (Native Federation) composés
sous une vue unifiée.

## Principe

```
┌──────────────────────────────────────────────┐
│ SHELL  (1 login Auth0, chrome fold, MINCE)     │
│┌──────────┬───────────────────────────────────┐│
││ rail     │  app montée (remote indépendant)   ││
││ = apps   │  ┌──────────────────────────────┐ ││
││ ─ PIM    │  │ son menu (dans le content)   │ ││
││ ─ B2B    │  │ ──────────────────────────── │ ││
││   admin  │  │ ses pages                    │ ││
│└──────────┴──└──────────────────────────────┘─┘│
└──────────────────────────────────────────────┘
```

Invariants (voir les commentaires de `federation.config.mjs`) :

- **Un seul `fold-app-shell`** vit à la fois — celui du shell. Un remote **n'a
  pas** de shell (pas de chrome imbriquée : un seul propriétaire du scroll). Il
  rend son menu dans le content.
- **Le shell est mince** (login + switcher + montage, zéro métier) : c'est le
  point de défaillance unique, on le garde minimal.
- **Baseline `strictVersion`** : un remote hors-catalog **refuse de monter**
  (échec bruyant) plutôt que de corrompre l'injection. Le garde-fou du skew est
  le pnpm `catalog:` du workspace (`@angular/*` lockstep, `fold-ng` exact) :
  **deploy indépendant ≠ version de plateforme indépendante**.
- **Isolation des pannes** : un remote injoignable → tuile « indisponible », les
  autres apps restent accessibles (error boundary dans `app.routes.ts`).

## Contrat d'un remote

Un remote expose `./app` = `{ routes }` (voir `SuiteRemoteModule`). Il montre son
menu lui-même (dans le content). Ajouter une app = 1 ligne dans
`src/app/suite/suite-registry.ts` + 1 entrée dans `public/federation.manifest.json`.
`remoteName` absent ⇒ tuile stub « bientôt disponible » (ex. B2B admin, pas encore
construit).

## Auth

Le shell **possède** la session Auth0 (un login). `TokenService.getToken(audience)`
échange un jeton par backend (`api://b2b`, `api://pim`) — un login, N murs d'API.
Les remotes ne connaissent pas le SDK Auth0. ⚠️ `auth.config.ts` : renseigner le
`clientId` d'une SPA Auth0 **dédiée à la Suite**.

## Dev

Le shell (dynamic host) lit `public/federation.manifest.json` au runtime, qui
pointe en dev vers les remotes en `localhost`. Il faut donc lancer **le shell ET
les remotes** :

```bash
# le remote PIM (port fixe 7315, référencé par le manifest)
pnpm --filter lfc-pim-frontend dev

# le shell hôte (port 7300)
pnpm --filter lfc-suite-shell dev
```

Puis ouvrir le shell : le rail liste PIM + B2B admin ; cliquer PIM le monte sous
`/pim`.

## Reste à câbler

- **Manifest prod** : `federation.manifest.json` est en dev (localhost). Le
  déploiement Pages doit fournir un manifest pointant vers les `remoteEntry.json`
  déployés (swap build-time).
- **Audit routerLinks** : les liens **absolus** internes d'un remote (`/produits`)
  cassent une fois monté sous `/pim` — à passer en relatifs.
- **B2B admin** : app à construire, puis retirer le stub (ajouter `remoteName`).
