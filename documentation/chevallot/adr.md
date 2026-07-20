# Chevallot PIM — Architecture Decision Records

> Décision → raison → conséquences. Une entrée par choix structurant. Les ADR 01–07 viennent de la
> phase de cadrage ; 08–10 ont été tranchées à la mise en place du monorepo.

## ADR-01 — Monolithe modulaire (pas de microservices)

**Décision** : une seule app structurée en modules internes (`catalogue`, `pricing`,
`disponibilite-production`, `publication`), pas une constellation de microservices.
**Raison** : l'échelle d'une boulangerie ne justifie pas la complexité opérationnelle du distribué ;
le « microservice » initial désignait en fait *un* service central unique.
**Conséquences** : frontières nettes entre modules → extraction possible plus tard si un vrai
déclencheur apparaît (scale, runtime différent, consommateur externe).

## ADR-02 — Un seul déployable, hébergé long-running

**Décision** : déployer en une unité sur un hôte qui **tourne en continu** (conteneur / Railway / Fly
/ Render / VPS), **pas en serverless pur**.
**Raison** : les **crons** (plan de prod, synchro PI) et le **worker de push** (async, retries)
supportent mal les timeouts et l'absence de worker persistant du serverless.
**Conséquences** : API + scheduler + worker cohabitent au départ ; le worker peut être isolé plus tard
(même code, flag `start:worker`).

## ADR-03 — Stack Angular + NestJS, monorepo, types partagés

**Décision** : front **Angular** (SPA, Vitest), back **NestJS** (Jest). Nest sert le build Angular.
Monorepo avec une lib `shared-types`.
**Raison** : Nest long-running (crons/worker) et ses modules mappent le design ; Angular SPA pur
(jamais d'accès DB direct → sécurité par construction) ; types partagés = une seule source de vérité
TS front + back.
**Conséquences** : les **entities ORM restent côté Nest** ; l'API expose des **DTOs**
(`shared-types`), jamais les entities brutes.

## ADR-04 — ORM Prisma (+ raw SQL en échappatoire)

**Décision** : **Prisma** comme ORM. Raw SQL / query builder réservé aux **agrégations** (plan de
production) et aux champs **`jsonb`**.
**Raison** : migrations, relations typées, sécurité de type, meilleure DX ; ne pas réécrire une couche
d'accès à la main.
**Conséquences** : Prisma fonctionne avec n'importe quel Postgres → pas de lock-in hébergeur.

## ADR-05 — PostgreSQL (pas MongoDB), catalogue compris

**Décision** : **PostgreSQL** pour tout, catalogue inclus. `jsonb` pour les parties variables
(`options`, `attributes`, `snapshot`, `diff`).
**Raison** : domaine relationnel (jointures, agrégations, intégrité). Le catalogue est le hub où tout
se rattache → le fragmenter dans Mongo créerait deux stores et des consistances inter-bases.
**Conséquences** : colonne vertébrale relationnelle + `jsonb` ciblé.

## ADR-06 — Postgres managé, free tier, sans lock-in

**Décision** : Postgres **managé** en free tier (voir ADR-09 pour le fournisseur retenu).
**Raison** : confort type Atlas (backups/HA délégués) à €0 ; volumes très en deçà des limites
gratuites.
**Conséquences** : portabilité (`pg_dump`/restore + changer l'URL) + backups à soi ; une courte indispo
est survivable (caisse PI en local + resynchro).

## ADR-07 — Allergènes stockés en GS1, projetés en INCO

**Décision** : stockage canonique **GS1 `AllergenTypeCode`**, projection vers **INCO** (14 UE) à
l'affichage. Mapping **n:1** maintenu (donnée de référence versionnée), service `AllergenMapping`.
**Raison** : GS1 = sur-ensemble international interopérable (B2B/GDSN) ; INCO = obligation légale UE.
Stocker le plus riche, projeter vers le bas (l'inverse serait avec perte).
**Conséquences** : détail dans `data-model/05-allergenes-gs1-inco.md`. Slice de domaine en place :
[`apps/chevallot-PIM-backend/src/allergens`](../../apps/chevallot-PIM-backend/src/allergens) (codes GS1
**provisoires** — à peupler depuis `ref.gs1.org`).

---

## ADR-08 — Monorepo Turborepo + pnpm (pas Nx)

**Décision** : monorepo **pnpm workspaces + Turborepo**, calqué sur SH3PHERD. Apps scaffoldées via les
CLI officiels (`ng new`, `nest new`).
**Raison** : transparence maximale (tout est dans `package.json`/`turbo.json`, greppable ; pas de
targets inférées) ; zéro friction Angular (Nx heurte le setup TS project-references d'Angular) ;
transfert 1:1 du savoir-faire SH3PHERD.
**Conséquences** : `turbo run <task> --filter=…` ; script suite `chevallot-suite:dev:watch` + compound
WebStorm (`.run/`) une console par process.

## ADR-09 — Base Neon (pas Prisma Postgres Free)

**Décision** : **Neon** (Postgres serverless managé, free tier heures-compute + stockage).
**Raison** : le modèle **à l'opération** de Prisma Postgres Free pénalise le **travail de fond**
(worker de push, crons, synchro PI) ; le modèle heures-compute de Neon est plus tolérant. Prisma ORM
reste compatible → aucun lock-in, bascule possible.
**Conséquences** : scale-to-zero à surveiller (cold start) ; backups à soi conservés (ADR-06).

## ADR-10 — Backend ESM + flags TS stricts partagés

**Décision** : backend en **ESM** (`type: module`, imports `.js` NodeNext). Flags stricts partagés via
[`tsconfig/tsflags.backend.json`](../../tsconfig/tsflags.backend.json) (extend une base stricte, +
`noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `noPropertyAccessFromIndexSignature`). Tests **Jest**
transpilés en CommonJS via `tsconfig.test.json`.
**Raison** : `verbatimModuleSyntax` (« no ghost imports ») impose l'ESM ; les flags forcent la
gestion explicite de l'`undefined`/hors-borne → moins de bugs silencieux. Setup éprouvé sur SH3PHERD.
**Conséquences** : chaque futur backend `extends` cette couche ; front en **Vitest**
(`@angular/build:unit-test` + analog).
