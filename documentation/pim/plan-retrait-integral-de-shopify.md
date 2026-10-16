# Plan — retirer Shopify du code et de la doc, intégralement

> 📐 **Doc-first, rien n'est bâti** (rédigé le 2026-10-16). Porte une
> **migration de données** (deux colonnes) : `vitruve` d'office avant Hugo
> (CLAUDE.md §9 bis). Contredit le même jour ; ses corrections, en fin de
> document, priment sur S1–S5.

## 0. La demande (Hugo, 2026-10-16)

> « Je veux qu'on se débarrasse intégralement de Shopify dans le code et
> dans les docs. »

## 1. Ce qui existe (inventaire du 2026-10-16)

Le canal est **déjà parti** le 2026-09-21 : plus de driver
(`pim/channels/shopify/`), plus de paquet `shopify-admin`, plus de secrets
`SHOPIFY_*` dans la CI, et les quatre tables et trois types Shopify ont été
supprimés par `20260921220000_retrait_des_tables_shopify`. Cette migration
annonçait elle-même la suite : `pim.sales_context.handle_suffix` et
`shopify_projected` restaient, « champs obligatoires d'un contrat servi au
back-office ».

Ce qui reste, hors `dist/` et client Prisma généré :

| Catégorie          | Où                                                                                                                                                                                                                                                                                        | Ce que c'est                                                                                                                                                                              |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Code vivant** | le contexte de vente : entité, value object, `bootstrap-contexts.ts:70-80`, création et modification, `sales-context-support.ts:33-52` (unicité du suffixe des contextes projetés), `prisma-sales-context.repository.ts:59`, le registre, la liste, l'erreur `sales-context-errors.ts:57` | `handleSuffix` et `shopifyProjected` lus, écrits, vérifiés                                                                                                                                |
|                    | contrats : `packages/pim-contracts/src/category.ts:103-105,180,195`, `packages/contracts/src/journal-facts/referential-settings.ts:110,117`                                                                                                                                               | le champ dans le fil et dans les faits de journal                                                                                                                                         |
|                    | écran « Points de vente » (`pim/sales-contexts/`)                                                                                                                                                                                                                                         | la bascule « Projeté vers Shopify » et la colonne du handle                                                                                                                               |
|                    | journal du back-office : `key-labels.ts:261,286-288`, `referential-values.ts:47`                                                                                                                                                                                                          | les libellés des faits passés                                                                                                                                                             |
|                    | semis : `prisma/seed-pim/catalogue.ts`, `registry.ts`, `corpus.ts`                                                                                                                                                                                                                        |                                                                                                                                                                                           |
|                    | les schémas statiques de la doc embarquée au back-office (`app/documentation/**`)                                                                                                                                                                                                         | des boîtes « Shopify » dans des diagrammes                                                                                                                                                |
| **B. Données**     | `pim.sales_context.handle_suffix`, `pim.sales_context.shopify_projected`                                                                                                                                                                                                                  | deux colonnes                                                                                                                                                                             |
|                    | `CatalogRevisionPublication.destination` (chaîne libre)                                                                                                                                                                                                                                   | des lignes valant `shopify` possibles — non mesuré                                                                                                                                        |
|                    | faits de journal passés : clés `shopifyProjected`, `tag` `tva-*`                                                                                                                                                                                                                          | l'histoire                                                                                                                                                                                |
| **C. Mentions**    | une trentaine de commentaires de code, `pim-data-neutral.mjs`, des tests (ids d'exemple `shopify` dans les sondes)                                                                                                                                                                        | ~50 fichiers de doc, dont `pim/ledger.md`, `pim/adr.md`, `suite/architecture-ops-ecosystem-health.md`, `pim/todo-le-vocabulaire-shopify-survit-au-canal.md`, et `CLAUDE.md` (deux lignes) |
| **D. Migrations**  | sept `migration.sql`                                                                                                                                                                                                                                                                      | ne se touchent pas                                                                                                                                                                        |

## 2. Décisions proposées

### S1 — Le code d'abord, un seul déploiement

Pré-release (§0) : le contrat servi peut se casser dans le même déploiement.
`handleSuffix` et `shopifyProjected` sortent de l'entité, des commandes, des
contrats, de l'écran, du semis et des tests. L'unicité du suffixe disparaît
avec lui. Les colonnes restent en base, plus lues ni écrites.

### S2 — Les colonnes : supprimées, sur ordre

Une seconde migration, **déployée après** S1 (un code en service qui lit
encore la colonne tomberait), `ALTER TABLE pim.sales_context DROP COLUMN
handle_suffix, DROP COLUMN shopify_projected`. Postgres ne l'annule pas :
le retour arrière est une colonne recréée vide. **Seulement sur ordre de
Hugo** (Q1).

### S3 — L'histoire reste lisible, sans le mot

- Les faits de journal passés ne se réécrivent pas (une valeur n'est pas un
  nom, CLAUDE.md §8). Le journal du back-office garde un libellé pour leurs
  clés, **neutre** : « Ancien canal — projeté », « Ancien canal — tag ».
- Les lignes `destination = 'shopify'` des révisions restent ; leur
  libellé à l'écran est « ancien canal ».
- Les sept migrations ne bougent pas : c'est le seul endroit où le mot
  restera, et la porte de doc les exclut déjà.

### S4 — La doc

- Les phrases qui décrivent le canal comme vivant sont réécrites ou retirées.
- `pim/todo-le-vocabulaire-shopify-survit-au-canal.md` : ce qu'il reste à y
  faire est ce plan ; il est supprimé et ses liens repointés ici.
- **L'histoire datée** (`pim/ledger.md`, `pim/adr.md`, les photos datées) :
  Q2.
- `CLAUDE.md` : ses deux exemples (`channels/shopify/…`, le préfixe `tva-`)
  sont remplacés par des exemples vivants.
- Les schémas statiques du back-office perdent leur boîte Shopify.

### S5 — Une porte

`lint:no-shopify` : le mot (insensible à la casse) est refusé hors
`prisma/migrations/`, hors des libellés « ancien canal » du journal, et hors
de l'histoire datée si Q2 la garde. Sans porte, le mot revient au premier
copier-coller d'un vieux doc.

## 3. Lots

| Lot | Contenu                                                                       |
| --- | ----------------------------------------------------------------------------- |
| S-a | S1 (code, contrats, écran, semis, tests), S3 (libellés), les commentaires, S5 |
| S-b | S4 (doc, `CLAUDE.md`)                                                         |
| S-c | S2, la migration, sur ordre et après déploiement de S-a                       |

## 4. Questions à Hugo

1. **Les deux colonnes** : les supprimer en base (S2), ou les laisser mortes ?
2. **L'histoire datée** (`ledger.md`, `adr.md`, photos datées) : la garder
   telle quelle, comme archive que la porte tolère, ou la purger du mot ?
3. **`b2b/b2b-page` et la matrice des canaux** : sans Shopify, il ne reste
   qu'un canal (`b2b`). Retirer la notion de canal elle-même est le lot 5 du
   catalogue ; on la laisse à ce lot ?

## Contradiction de `vitruve` (2026-10-16), qui prime sur S1–S5

Le premier BLOQUANT a été rouvert dans le code avant d'être intégré.

- **Les faits passés se relisent en forme stricte** (BLOQUANT). `payload`
  vaut `z.strictObject` (`packages/contracts/src/journal-facts/fact.ts:98`),
  et le lecteur essaie la forme courante puis `history`
  (`journal-facts/index.ts:119-121`). Retirer `shopifyProjected` et
  `handleSuffix` des formes de `sales_context.created` / `.updated`
  (`referential-settings.ts:106-120`) laisserait toutes les lignes passées
  sans forme. `closure.spec.ts` ne parcourt que le catalogue : il resterait
  vert. **Correction de S1/S3** : les formes actuelles passent **dans
  `history`**, telles quelles ; la forme courante perd les deux champs. Le
  mot vit donc à vie dans ces formes historiques, et c'est voulu : c'est
  de la donnée passée. Un test relit une ligne d'aujourd'hui par
  `journalPayloadShapes`.
- **L'inventaire A était incomplet** (BLOQUANT) : s'ajoutent le harnais
  `test/e2e-harness.ts:493-504` (semis de tous les e2e),
  `pim-sales-contexts`, `pim-catalog-revision:109-123`,
  `activity-tax-journal:130,389-391,490-501`, six specs unitaires du PIM, le
  port `sales-context.repository.ts` et sa doublure
  `fixed-active-contexts.ts`, `sales-context-panel.ts`, et la spec des
  phrases du journal. `referential-values.ts` est sous
  `shared/journal/values/`. Le lot S-a part d'un `grep` sur
  `handleSuffix|shopifyProjected`, pas de cette liste.
- **La porte S5 sur ce que git suit** (BLOQUANT) : elle lit
  `git ls-files`, jamais le disque (client Prisma généré, `dist-seed/`).
  Elle admet, nommément : `prisma/migrations/**`, les formes historiques
  des faits, `tax-regime-retired.ts` (type retiré, sa donnée `tag`), et les
  libellés « ancien canal ». Liste admise courte, qui ne peut que décroître.
- **Le schéma Prisma reste jusqu'à S-c** (SÉRIEUX). Les deux champs restent
  dans `sales-contexts.prisma:88,99` en S-a — sans quoi le prochain
  `prisma migrate dev` écrirait le `DROP` tout seul, sans ordre. La porte
  admet ces deux lignes jusqu'à S-c, qui les retire avec la migration.
- **S-c perd les suffixes** (SÉRIEUX) : avant le `DROP`, l'aperçu compte les
  suffixes non vides et `shopify_projected = true` ; `lecteur-de-migrations`
  passe sur la migration.
- **Les révisions** (SÉRIEUX) : les lignes `destination = 'shopify'` sont
  comptées au lot ; leur libellé « ancien canal » vit à l'endroit qui
  traduit `destination` à l'écran, à trouver au premier jour.
- **L'unicité du suffixe** sort avec son erreur
  (`sales-context-errors.ts:57`) et sa traduction HTTP.
- **Le compte des mentions** : 44 fichiers dans `apps/lfd-api/src`, 37 dans
  `documentation/` ; s'ajoutent `packages/` (`staff-access.ts:66`,
  `b2b-channel.ts:64`, `catalog-revision.ts:13`, `packages/mailer/src/errors.ts:6`,
  `packages/ops-contract/src/heartbeat.ts:21` et sa spec), les portes
  `controller-buses.mjs` et `pim-data-neutral.mjs` (sa l.97 renvoie à un
  chemin à vérifier), `.github/workflows/ci.yml:196-198`, et neuf lignes du
  schéma Prisma.
- **Mineurs** : le commentaire de `key-labels.ts:261,286-288` reste vrai
  après le libellé neutre ; le compte des portes du §10 de `CLAUDE.md` est à
  refaire quand S5 s'ajoute.

**Non vérifié** : la production (lignes `shopify`, faits, suffixes), le
rendu d'un fait sans forme (`schema-node.ts:79`), les projections de la
réémission, des identifiants de nœud ops `shopify` en base, les schémas
statiques du back-office.
