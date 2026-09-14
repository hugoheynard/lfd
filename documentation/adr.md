# Architecture Decision Records — le dépôt

> **Décision → raison → conséquences.** Une entrée par choix structurant qui vaut
> pour **tout le monorepo**, et non pour un projet en particulier.
>
> 🔴 **Ce fichier est né le 2026-09-13 d'une scission.** Ces décisions vivaient
> dans `pim/adr.md`, où elles se lisaient comme des choix du référentiel alors
> qu'elles engagent les deux backends et les deux fronts. Le PIM garde ses ADR
> propres — allergènes, agrégats du catalogue, SKU, canaux.
>
> **Les numéros sont conservés**, pour que les citations existantes (`ADR-09`,
> `ADR-13`) restent vraies. Les deux fichiers se partagent donc une seule
> numérotation : 01–06, 08–10 et 12 ici, 07, 11 et 13–17 chez le PIM.
>
> Chaque entrée a été **confrontée au code le 2026-09-13**. Ce qui avait
> vieilli porte un bandeau ⚠️ plutôt qu'une réécriture silencieuse : une
> décision qu'on a cessé d'appliquer est une information, et l'effacer ferait
> disparaître la question qui se reposera.

---

## ADR-01 — Monolithe modulaire (pas de microservices)

**Décision** : une seule application structurée en **blocs internes**, pas une
constellation de microservices.

**Raison** : l'échelle d'une boulangerie ne justifie pas la complexité
opérationnelle du distribué.

**Conséquences** : frontières nettes entre blocs → extraction possible si un
vrai déclencheur apparaît (montée en charge, autre runtime, consommateur
externe).

⚠️ **Les modules cités par la v1 n'ont jamais existé sous ces noms**
(`catalogue`, `pricing`, `disponibilite-production`, `publication`). Le découpage
réel est décrit par la **matrice des frontières** de `CLAUDE.md` §3 et tenu par
`lint:context-boundaries` : `staff`, `pim`, `b2b`, `production`, `platform`,
plus `appBootstrap`.

⚠️ Et `src/` en porte **trois de plus** que la matrice ne nomme — `handover`,
`ops`, `dev` (vérifié le 2026-09-13). Ce n'est pas une contradiction de l'ADR,
c'est une matrice en retard sur son arborescence, et c'est noté ici parce que
c'est exactement ce qu'une frontière tenue par discipline perd en premier.

## ADR-02 — Un seul déployable

**Décision** : déployer en une unité.

⚠️ **Le reste de cette décision a été renversé par la pratique, sans que
personne ne la réécrive.** Elle disait : « un hôte qui tourne en continu
(Railway / Fly / Render / VPS), **pas de serverless** », au motif que les
**crons** et un **worker de push** supportent mal les timeouts.

Ce qui est vrai le 2026-09-13 :

- le backend est déployé en **conteneur Cloudflare**, poussé par `wrangler`
  (`.github/workflows/deploy_lfd_api.yml`) — ni Railway, ni Fly, ni VPS ;
- **il n'existe aucun cron Nest** : pas de `ScheduleModule`, pas de `@Cron`. Le
  travail périodique est déclenché **de l'extérieur**, par une route protégée
  d'un jeton (`RECOMPUTE_TOKEN`) ;
- il n'existe pas non plus de worker de push séparé.

Autrement dit, les deux besoins qui justifiaient de refuser le serverless n'ont
jamais été construits. La décision « un seul déployable » tient ; sa raison, non.

## ADR-03 — Angular devant, NestJS derrière, monorepo

**Décision** : fronts **Angular** (Vitest), backend **NestJS** (Jest), dans un
monorepo.

**Raison** : Nest et ses modules mappent le découpage du domaine ; un front SPA
n'accède jamais à la base directement, donc la sécurité tient par construction.

⚠️ **Deux affirmations de la v1 sont fausses**, et l'une est devenue une
interdiction :

- « **Nest sert le build Angular** » — non. Les deux fronts sont déployés
  séparément, sur Cloudflare Pages, derrière la gateway ;
- « une lib **`shared-types`** » — elle n'a jamais été créée, et `CLAUDE.md` §1
  l'**interdit** désormais : un paquet unique mélangerait les deux langages
  métier (le `User` du référentiel est le staff, celui du B2B est le client) et
  dupliquerait une frontière au lieu de la tenir. Les contrats partagés vivent
  par domaine — `@lfd/contracts`, `@lfd/pim-contracts` — et un type n'y entre
  que s'il est vraiment transverse.

Ce qui survit : l'API expose des **vues**, jamais un modèle Prisma. Cette
partie-là est tenue par `lint:context-boundaries`.

## ADR-04 — Prisma comme ORM, SQL brut en échappatoire

**Décision** : **Prisma**. Le SQL brut est réservé aux agrégations et aux champs
`jsonb`.

**Raison** : migrations, relations typées, sécurité de type — plutôt que
réécrire une couche d'accès à la main.

**Conséquences** : Prisma parle à n'importe quel Postgres, donc aucun
enfermement chez un hébergeur.

⚠️ **Le transport a changé, et la v1 ne nommait que la moitié.** Elle disait
« `@prisma/adapter-pg` (TCP + pool), cohérent avec le long-running ». En réalité
c'est **le schéma de l'URL qui choisit**, et les deux chemins coexistent
(`prisma.service.ts`, vérifié le 2026-09-13) :

- `prisma+postgres://` → **Accelerate**, un proxy HTTP. C'est le chemin de la
  production et du développement ;
- `postgresql://` → l'adaptateur **`PrismaPg`**. C'est le chemin des e2e, devant
  le Postgres local jetable.

Cette distinction n'est pas un détail d'infrastructure : Accelerate étant un
proxy HTTP, `psql` et `pg_dump` **ne peuvent pas le traverser**, et `$connect()`
y est paresseux — il ne prouve donc pas que la base répond. C'est ce qui a
dicté la forme de `prisma/clone-dev.ts`.

⚠️ Le client généré n'est pas dans `src/infra/database/client/` : ce dossier
n'existe pas. Il est en **`src/platform/database/client/`**.

## ADR-05 — PostgreSQL pour tout, catalogue compris

**Décision** : **PostgreSQL**, avec `jsonb` pour les parties réellement
variables (`options`, `attributes`, `snapshot`, `diff`).

**Raison** : le domaine est relationnel — jointures, agrégations, intégrité. Le
catalogue est le point où tout se rattache ; le fragmenter dans un second store
créerait des cohérences inter-bases à tenir à la main.

**Conséquences** : une colonne vertébrale relationnelle, du `jsonb` ciblé.

⚠️ **Une seule base, plusieurs schémas.** Le référentiel a eu la sienne ; il ne
l'a plus. `prisma/schema/datasource.prisma` déclare **cinq** schémas — `public`,
`growth`, `ops`, `pim`, `production` — et `AppConfig` ne lit qu'une URL,
`DATABASE_LFD_URL`. La conséquence est dans `CLAUDE.md` §1, et elle est le vrai
sujet : une jointure `b2b → pim` **marcherait** désormais. Elle reste interdite,
mais par discipline et par porte CI (`lint:cross-schema-join`), plus par la
physique.

## ADR-06 — Postgres managé, sans enfermement

**Décision** : un Postgres **managé**, plutôt qu'une instance tenue à la main.

**Raison** : sauvegardes et haute disponibilité déléguées, pour des volumes très
en deçà de ce qui se facture.

**Conséquences** : portabilité (`pg_dump`/restore et changer l'URL) et
sauvegardes à soi ; une courte indisponibilité est survivable.

⚠️ **Le `pg_dump` de cette phrase est devenu faux** pour la base de production :
elle est derrière Accelerate (ADR-04), qu'aucun outil du protocole Postgres ne
traverse. La portabilité reste vraie — l'URL directe existe chez l'hébergeur —
mais elle n'est plus à portée de commande depuis ce dépôt.

## ADR-08 — Monorepo pnpm + Turborepo (pas Nx)

**Décision** : **pnpm workspaces + Turborepo**. Les applications sont générées
par les CLI officiels (`ng new`, `nest new`).

**Raison** : tout est dans `package.json` et `turbo.json`, donc greppable — pas
de cible inférée ; et zéro friction avec le découpage TypeScript d'Angular, que
Nx bouscule.

**Conséquences** : `turbo run <tâche> --filter=…`, et des configurations
`.run/` WebStorm pour lancer une console par processus.

**Vérifié le 2026-09-13** : toujours exact. S'y ajoute une règle qui en découle
et qui est tenue par une porte — toute dépendance partagée par deux paquets vit
dans le `catalog:` de `pnpm-workspace.yaml`, épinglée exactement
(`lint:catalog-shared-deps`, `CLAUDE.md` §6).

## ADR-09 — Un Postgres managé nommé

⚠️ **Cet ADR nommait Neon, et ce dépôt ne permet plus de le confirmer.** L'URL
de production est une URL Accelerate : elle masque l'hébergeur réel, et rien
dans le code, les workflows ou les migrations ne le nomme (vérifié le
2026-09-13).

Ce qui reste vrai du raisonnement, indépendamment du fournisseur : un modèle
facturé **à l'opération** pénalise le travail de fond, là où un modèle
heures-compute le tolère. Prisma parlant à n'importe quel Postgres, la bascule
reste ouverte.

**À faire** : rouvrir cette entrée en nommant l'hébergeur, ou la fermer en
écrivant qu'on ne le documente pas ici. Une ADR qui affirme un fournisseur
qu'on ne peut pas vérifier vaut moins qu'une ADR qui dit ne pas savoir.

## ADR-10 — Backend en ESM, flags TypeScript stricts partagés

**Décision** : backend en **ESM** (`"type": "module"`, imports en `.js`,
résolution NodeNext). Les flags stricts sont posés en deux couches :
[`tsconfig.base.json`](../tsconfig.base.json) pour tout le monorepo, puis
[`tsconfig/tsflags.backend.json`](../tsconfig/tsflags.backend.json) pour ce qui
est propre à Node et Nest.

**Raison** : `verbatimModuleSyntax` impose l'ESM ; les flags forcent à traiter
`undefined` et le hors-borne explicitement, donc moins de pannes silencieuses.

**Ce qui est durci, et pourquoi ça compte** :

- `noImplicitReturns` et `allowUnusedLabels: false` — deux trous que `strict` ne
  couvre pas ;
- **`exactOptionalPropertyTypes`** — `{a?: T}` cesse d'être `{a: T | undefined}`.
  C'est le flag qui coûte le plus à l'écriture et qui rend le plus : une clé
  posée à `undefined` n'est **pas** une clé absente ;
- **`noUncheckedIndexedAccess`** sur le backend — un accès indexé rend
  `T | undefined` ;
- les flags déjà impliqués par `strict` sont **épinglés explicitement**, pour que
  l'intention survive à une couche enfant qui toucherait `strict`.

**Écartés délibérément** : `erasableSyntaxOnly`, qui interdit les _parameter
properties_ (`constructor(private readonly x: X)`) et casserait Nest de fond en
comble ; `isolatedDeclarations`, dont le gain vise une bibliothèque publiée.

**Conséquences** : les tests backend tournent en ESM
(`--experimental-vm-modules`), parce que le client Prisma généré emploie
`import.meta`. Les fronts sont en **Vitest**.

⚠️ Une conséquence non écrite en v1 et payée depuis : **esbuild n'émet pas
`emitDecoratorMetadata`**. Tout script qui boote l'`AppModule` — donc la
résolution de dépendances par type — doit passer par `tsc`, jamais par `tsx`.
C'est ce que `tsconfig.seed.json` documente, et ce qui a fait échouer
`mercuriale:import` à son premier lancement.

## ADR-12 — Authentification déléguée à Auth0, vérifiée avec `jose`

**Décision** : l'authentification est **déléguée à Auth0** (OIDC). L'API valide
les jetons d'accès **JWT RS256** contre le **JWKS** du tenant via **`jose`**, et
non Passport. Le garde est branché en `APP_GUARD` : l'API est **fermée par
défaut**, et s'ouvre explicitement avec `@Public()`.

**Raison** : connexion, réinitialisation, MFA, social — c'est du travail non
différenciant. `jose` est ESM natif (ADR-10) et typé, sans l'échafaudage de
Passport. Surtout, l'identité reste **hors du domaine** : l'acteur d'un fait
n'est qu'un `sub` vérifié.

**Conséquences** :

- `AUTH0_DOMAIN` et `AUTH0_AUDIENCE` sont obligatoires — l'API **refuse de
  démarrer** sans, parce qu'une authentification mal configurée valide des jetons
  contre le mauvais émetteur ;
- le JWKS est résolu paresseusement et mis en cache par `jose`, donc aucun appel
  réseau à l'amorçage.

✅ **Le « à faire » de la v1 est fait** (vérifié le 2026-09-13) : la table
interne existe — `StaffUser`, dans le schéma `public` — et la résolution du
principal passe par elle. Ce qui compte pour la sécurité y a même été poussé plus
loin que ne le demandait l'ADR : **la base est autoritaire**. Le jeton n'atteste
que le sujet ; le rôle, le statut et la société sont relus en base à chaque
requête, si bien qu'un compte désactivé est bloqué immédiatement plutôt qu'à
l'expiration du jeton.
