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
- **Prisma 7** impose un **driver adapter** (l'URL seule ne suffit plus) → on utilise
  **`@prisma/adapter-pg`** (node-postgres, TCP + pool), cohérent avec le déploiement **long-running**
  (ADR-02) ; `adapter-neon` viserait le serverless/edge. Neon parle le protocole Postgres standard.
- Le client est généré en **TS ESM** dans `src/infra/database/client/` (gitignoré, régénéré au
  `postinstall`) et compilé par notre build — il passe nos flags stricts (ADR-10).
- Les **tests backend tournent en ESM** (`ts-jest useESM` + `--experimental-vm-modules`) : le client
  généré utilise `import.meta`, incompatible avec une transpilation CommonJS.

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

**Décision** : backend en **ESM** (`type: module`, imports `.js` NodeNext). Flags stricts en deux
couches : [`tsconfig.base.json`](../../tsconfig.base.json) (tout le monorepo) puis
[`tsconfig/tsflags.backend.json`](../../tsconfig/tsflags.backend.json) (spécifique Node/Nest :
`module`, décorateurs, **`noUncheckedIndexedAccess`**).
**Raison** : `verbatimModuleSyntax` (« no ghost imports ») impose l'ESM ; les flags forcent la gestion
explicite de l'`undefined`/hors-borne → moins de bugs silencieux. Base héritée de SH3PHERD, **durcie**
au-delà.
**Ce que la base ajoute par rapport à SH3PHERD** :
- `noImplicitReturns` et `allowUnusedLabels: false` — deux trous réels chez SH3 (non couverts par `strict`).
- **`exactOptionalPropertyTypes`** — distingue `{a?: T}` de `{a: T | undefined}`.
- **`noUncheckedSideEffectImports`** — un `import './x'` doit exister.
- **`noUncheckedIndexedAccess`** (couche backend) — que SH3PHERD laisse volontairement OFF.
- Les flags déjà impliqués par `strict` sont **épinglés explicitement** : l'intention survit à une
  couche enfant qui toucherait `strict`.
**Écarté délibérément** : `erasableSyntaxOnly` (TS 5.8) — il interdit les *parameter properties*
(`constructor(private readonly x: X)`) et les enums, ce qui **casserait NestJS de fond en comble**.
`isolatedDeclarations` : trop verbeux ici (gain surtout pour une lib publiée).
**Conséquences** : chaque futur backend `extends` la couche backend ; le front est en **Vitest**
(`@angular/build:unit-test` + analog). Les **tests backend tournent en ESM** (cf. ADR-04) — le client
Prisma généré, compilé avec ces flags, passe sans concession.

## ADR-11 — Catalogue orienté comportement ; event store **préparé, pas activé**

> **Révisé le 2026-07-21** — la v1 décidait « event-sourced dès le départ ». Cette version-là est
> rétrogradée à l'issue d'une revue adversariale du modèle. Le raisonnement d'origine est conservé
> plus bas.

**Décision** : le catalogue est modélisé **par ses comportements** (commandes → faits nommés), mais
les tables sont **écrites directement** par les handlers. **Pas** de table `events`, **pas** de
projecteurs, **pas** d'upcasting — pour l'instant. Trois règles rendent le passage ultérieur à
l'event store **non destructif** (détail dans
[`data-model/00-langage-et-comportement.md`](../chevallot/data-model/00-langage-et-comportement.md#5--les-trois-règles-irréversibles)) :

- **R1 — ids assignés par la commande** (UUID v7 applicatif). Jamais de séquence ni de
  `gen_random_uuid()` en base : un replay régénérerait des ids différents, alors que la caisse,
  Shopify et l'historique de commandes pointent dessus. **Seule règle réellement irrattrapable.**
- **R2 — toute mutation porte un nom métier** (`RenameProduct`, `DiscontinueVariant`…). Pas
  d'`update(partial)` générique : une intention non nommée ne peut pas être rétro-nommée.
- **R3 — aucun `DELETE` physique**, on archive.

**Raison du recul** : la justification v1 était **esthétique et fausse**. Elle promettait « zéro
`created_at`/`updated_at` » — mais une table de projection a de toute façon besoin de
`last_event_version` et `projected_at` : la métadonnée revenait, juste renommée. Surtout, le rapport
coût/bénéfice ne tient pas : projecteurs + versioning + upcasting + hard-gate de replay **à vie**,
pour un catalogue de boulangerie édité par trois personnes, sans contention ni invariant temporel
riche. L'ES brille sur les domaines à comportement dense (contrat, compte, réservation) ; ici on a du
CRUD enrichi. Précédent interne : sur **SH3PHERD**, l'event store est arrivé en **couche 3 phase C**,
*après* stabilisation du modèle — pas au jour 1.

**Ce qui remplace la promesse v1** : `created_at` / `updated_at` / `updated_by` existent, en colonnes
**système hors-domaine** — jamais lues par une règle métier, jamais exposées en DTO. Le jour où
l'event store arrive, elles deviennent redondantes et disparaissent d'un bloc.

**Déclencheur de révision** (quand activer l'ES) : premier besoin réel d'**as-of** (« quel était le
prix affiché le 24/12 ? »), ou obligation d'audit externe, ou un domaine à comportement dense
(production, commandes) — pas le catalogue.

**Conséquences** :
- **D6 est clos** : les frontières d'agrégat sont tranchées dans
  [`00-langage-et-comportement.md`](../chevallot/data-model/00-langage-et-comportement.md#2--agrégats--la-décision-ex-d6)
  — `Product` (racine, possède déclinaisons + fiches réglementaires), `Category`, `Collection`,
  `MediaAsset`.
- Le schéma Prisma n'est plus bloqué.
- La liste des commandes et des faits est écrite **maintenant**, et fait autorité même sans event
  store : c'est elle qui définit la surface d'écriture.

## ADR-13 — Composition par tables satellites, canaux au bord

**Décision** : trois natures de table, jamais mélangées — **socle** (identité), **couche canonique**
(ce que le produit *est*, ex. réglementaire, éditorial), **contexte canal** (ce qu'un système tiers
*en sait*, ex. `shopify_variant_binding`). Toute table satellite utilise le motif *shared primary
key* (**PK = FK**). Les tables canal sont possédées par leur **adaptateur**, bindent sur la
**déclinaison** (l'unité vendue) via son **`id`**, et ne sont **pas** event-sourçables (état de
synchro re-dérivable).
**Raison** : « étendre par clé étrangère » ne doit pas devenir « le PIM prend la forme de Shopify ».
La FK ne pointe **jamais** du socle vers un canal — test de validation : *si on supprimait le module
Shopify, le catalogue compilerait-il encore ?*
**Conséquences** :
- L'absence de donnée se représente par **absence de ligne**, pas par colonnes `NULL`.
- Le code famille caisse PI Helios **sort de `Category`** → `helios_category_binding`.
- Binding mécanique et overrides éditoriaux par canal sont **deux tables séparées** : le premier est
  jetable et re-poussable, le second est une saisie utilisateur à ne jamais écraser.
- `attributes` (jsonb) est soumis à une **règle de promotion** : lu par un adaptateur ou utilisé par
  ≥2 familles ⇒ devient une colonne.
- Détail : [`data-model/04-composition-et-canaux.md`](../chevallot/data-model/04-composition-et-canaux.md).

## ADR-14 — Couche logistique descopée de la v1

**Décision** : aucune modélisation du **poids, des dimensions, des unités logistiques** (colis,
palette) ni de la **hiérarchie GTIN / GDSN** dans la v1.
**Raison** : ces champs n'étaient présents que par anticipation d'un B2B non spécifié (**D1** ouvert).
Modéliser une hiérarchie d'unités commerciales sans savoir ce qui est réellement vendu en gros, c'est
figer une structure qu'on paiera à chaque migration.
**Conséquences** : le **code-barres** n'est pas un attribut du catalogue — il reviendra par le
**binding caisse** (`helios_variant_binding`) quand **D4** sera tranché. La projection GDSN reste un
objectif d'`AllergenMapping.toGdsn()` (ADR-07), pas une structure de données.

## ADR-12 — Authentification déléguée à Auth0, vérifiée avec `jose`

**Décision** : l'authentification est **déléguée à Auth0** (OIDC). L'API valide les **access tokens
JWT (RS256)** contre le **JWKS** du tenant via **`jose`** (pas Passport). Le guard est branché en
**`APP_GUARD`** → API **protégée par défaut**, ouverture explicite avec `@Public()`.
**Raison** : login / reset / MFA / social est du travail **non différenciant**. Le volume est dérisoire
(staff interne + quelques pros B2B — les clients **B2C s'authentifient sur Shopify**, pas ici), donc
très loin du free tier. `jose` est ESM natif (ADR-10), typé, sans le boilerplate Passport. Surtout,
l'identité reste **hors du domaine** : l'`actor` d'un event n'est qu'un `sub` vérifié.
**Conséquences** :
- `AUTH0_DOMAIN` + `AUTH0_AUDIENCE` obligatoires — l'API **refuse de démarrer** sans (une auth mal
  configurée valide des jetons contre le mauvais émetteur).
- JWKS résolu **paresseusement** et mis en cache par `jose` (rotation des clés gérée) — aucun appel
  réseau à l'amorçage.
- **À faire** : table `User` interne (notre id ↔ `sub` Auth0), pour que domaine et events ne
  référencent **jamais** l'id du fournisseur → changer d'IdP reste indolore.
- Le **domaine de login custom est payant** : la page de login restera sur `*.auth0.com` (sans
  importance pour un back-office ; à revoir si un portail B2B brandé apparaît).

## ADR-15 — Construire un PIM minimal plutôt qu'en acheter un

**Décision** : développer nous-mêmes le PIM, **volontairement minimal**, plutôt qu'adopter un PIM du
marché (Akeneo CE, Plytix, Sales Layer, Pimcore) ou faire de **Shopify le maître du catalogue**.

**Requalification préalable** — ce qu'on construit n'est pas *un PIM*, c'est une **jonction** : le
référentiel commun qui fait tenir ensemble la caisse (PI Helios), le web (Shopify) et le **labo de
production**. Le catalogue en est la première vertèbre, pas la finalité. Cette distinction n'est pas
rhétorique : elle est le critère d'arbitrage de tout le reste (voir « Test permanent »).

**Raison** :
1. **La valeur est dans la jonction, et elle ne s'achète pas.** Aucun éditeur ne vend le point où
   deux de ses concurrents doivent se rejoindre. La consolidation des ventes multi-canal et le plan
   de production du labo n'existent dans aucun catalogue produit du marché.
2. **80 % de l'effort est l'intégration**, et aucun PIM acheté n'en dispense : les adaptateurs PI et
   Shopify seraient à écrire de toute façon. Acheter revient à ajouter un système à administrer pour
   économiser la partie la plus simple du travail.
3. **Le modèle est spécifique et petit.** `kind = daily | made_to_order | resale`, la disponibilité
   comme **capacité de production** (pas un stock), les allergènes en **GS1 canonique projeté INCO**,
   la **déclinaison** comme unité vendue commune caisse/web : aucun PIM générique ne porte ça. On ne
   l'obtiendrait qu'en encodant le métier dans de la **configuration** là où on peut l'encoder dans
   des **types** — c'est-à-dire en renonçant au bénéfice des flags stricts (ADR-10) : un attribut
   dynamique est un `any` avec une interface d'admin. Le socle fait **six tables**.
4. **Shopify-comme-maître est intenable** malgré son coût minimal : pas de plan de production, pas de
   champ allergène natif (metafields + travail de thème), et un maître qui ignore l'existence de la
   caisse ne peut pas arbitrer ce qui descend vers elle.

**Ce qui est assumé — le coût réel n'est pas le modèle, c'est le back-office.** Un PIM du marché ne
vend pas un schéma (le nôtre est meilleur, et il a coûté une journée) : il vend quinze ans
d'**interface d'édition** — recherche, édition en masse, import CSV avec rapport d'erreurs,
annulation, complétude par famille, droits. C'est là que partira le temps. Conséquence directe :
**back-office volontairement rustique**, saisie à l'essentiel, aucun clone d'Akeneo.

**Périmètre — ce qu'on ne construira PAS** (la légitimité s'arrête ici) :
- moteur d'**attributs configurables** (familles à attributs dynamiques, types paramétrables) ;
- **workflows** de validation multi-rôles ;
- **DAM** (recadrage, dérivés d'images, versioning d'assets) ;
- **multi-tenant** « au cas où on le vendrait à d'autres boulangeries ».

Chacun est un projet à part entière et **aucun ne sert la jonction**. Le descope de la couche
logistique (ADR-14) est la première application de cette règle ; il en faudra d'autres.

**Test permanent**, à opposer à toute fonctionnalité envisagée :

> *Est-ce que ça sert à faire tenir ensemble la caisse, le web et le labo ?*
> Si non, c'est du PIM générique : à acheter, à emprunter, ou à différer.

Formulé en une ligne : **construire le spécifique, différer le générique, garder le back-office laid.**

**Conditions d'invalidation** (écrites maintenant, pour ne pas être rediscutées de mémoire) :
- **PI se révèle fermé** — ni écriture, ni export de ventes exploitable (D4). La jonction devient
  impossible : il ne reste qu'un PIM, qu'il vaudrait alors mieux acheter.
- **Le B2B se révèle du volume contractuel** avec facturation et logistique (D1). On est dans le
  périmètre d'un ERP, pas d'un PIM maison.
- **Changement d'échelle** : plusieurs points de vente, ou un second client de l'outil. Le
  multi-tenant est explicitement hors périmètre — l'atteindre invaliderait la décision, pas le code.

**Revue** : à la réponse de **D4** et de **D1**. Ces deux réponses suffisent à confirmer ou infirmer
cet ADR — la décision est **testable**, pas une conviction.
