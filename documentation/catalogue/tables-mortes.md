# Les tables mortes du catalogue — une liste pour décision

> 📐 **Liste pour un ordre de Hugo, pas une exécution** (X5 de
> [`plan-sans-interrupteurs.md`](plan-sans-interrupteurs.md), 2026-10-17).
> **Aucune migration n'est écrite.** Supprimer une table est un `DROP`, et le
> déploiement applique les migrations tout seul : chaque geste ci-dessous se
> décide à part (`CLAUDE.md` §0 — « pas de suppression en production sans
> ordre explicite »). Ce que dit le catalogue en service se lit dans
> [`catalogue-synchronise.md`](catalogue-synchronise.md).

## Comment c'est prouvé

Grep du **2026-10-17**, sur `apps/lfd-api/src`, `apps/lfd-api/test` et les
semis `apps/lfd-api/prisma/seed*`, **client Prisma généré exclu**
(`src/platform/database/client/`) :

1. l'accesseur du modèle (`b2bChannelBinding`, `operationItem`,
   `catalogRevisionPublication`, `catalogDelivery`, `catalogVersion`,
   `productChannelOverride`, `nutritionDeclaration`, `pointOfSaleTable`,
   `pointOfSale`, `catalogOperationOverride`…), en mot entier ;
2. le **nom SQL** de la table (`@@map`), pour le SQL écrit à la main ;
3. les **champs de relation** qui permettraient de la lire par un `include`
   (`channels`, `channelOverrideRows`, `b2bBinding`, `nutrition`,
   `publications`, `offeredBy`, `categoryChannels`, `tables`) ;
4. le dernier commit qui a retiré un usage :
   `git log -1 -S<accesseur> -- apps/lfd-api/src ':!apps/lfd-api/src/platform/database/client'`.

Les clés étrangères sont lues dans le **schéma Prisma**
(`apps/lfd-api/prisma/schema/`), pas dans la base de production.

⚠️ Un grep vide n'est pas une preuve absolue : un `$queryRawUnsafe` qui
fabriquerait le nom d'une table par concaténation lui échapperait. Aucun n'a
été trouvé pour ces noms ; ce n'est pas une revue de chaque requête brute.

## 1. Mortes : ni lues ni écrites par le code

| Table / colonne                                                                       | Qui la lisait                                                                      | Plus personne depuis                           | FK sortantes                                                          | FK entrantes                                  | Geste proposé                                                                                                                      |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pim.b2b_channel_binding`                                                             | le lien au canal par fiche, le push (`last_pushed_at`), la bascule vers l'audience | `d66b331f0` (X4, 2026-10-17)                   | `product_id` → `pim.product` (Cascade)                                | aucune                                        | `DROP` seul, dans un ordre quelconque                                                                                              |
| `pim.operation_items`                                                                 | les opérations au référentiel (`pim/operations/**`)                                | `d66b331f0` (X4)                               | `operation_key` → `pim.operations` (Restrict)                         | aucune                                        | `DROP` **avant** `pim.operations`                                                                                                  |
| `pim.operations`                                                                      | idem                                                                               | `d66b331f0` (X4)                               | aucune                                                                | `pim.operation_items`                         | `DROP` après sa sélection                                                                                                          |
| `pim.catalog_revision_publication`                                                    | le push (écriture), « depuis la dernière publication » (lecture)                   | `fd4b0b789` (suite de X2, 2026-10-17)          | `revision_id` → `pim.catalog_revision` (Cascade)                      | aucune                                        | retirer l'accesseur abstrait de `PimPrismaService` (`pim-prisma.service.ts:62`, déclaré, jamais appelé), puis `DROP`               |
| `public.catalog_delivery`                                                             | la réception (boîte d'arrivée)                                                     | `181b0621f` (X2, 2026-10-17)                   | aucune (`catalog_versions.delivery_id` est une chaîne, sans relation) | aucune                                        | `DROP` seul                                                                                                                        |
| `public.catalog_versions`                                                             | la validation d'une arrivée (écriture), la santé, la passation avant X0 (lecture)  | `181b0621f` (X2) ; écriture des commandes : X0 | aucune                                                                | `public.orders.catalog_version_id` (Restrict) | **trois temps**, voir §3                                                                                                           |
| `public.catalog_operation_overrides`                                                  | la surcharge des opérations reçues                                                 | `181b0621f` (X2)                               | `operation_key` → `public.catalog_operations` (Restrict)              | aucune                                        | `DROP` seul. `catalog_operations` **vit** (le commerce y écrit ses opérations)                                                     |
| `pim.nutrition_declaration`                                                           | la fiche réglementaire en une ligne                                                | `427f21912` (2026-09-22)                       | `variant_id` → `pim.product_variant`                                  | aucune                                        | `DROP` seul — c'est le lot 7 de [`../pim/plan-separer-allergenes-et-nutrition.md`](../pim/plan-separer-allergenes-et-nutrition.md) |
| `pim.point_of_sale_table`                                                             | l'écran « Points de vente » (grille de tables, QR)                                 | `63bb374a8` (L3 du sur place, 2026-10-17)      | `point_of_sale_id` → `pim.point_of_sale` (Cascade)                    | aucune                                        | `DROP` seul ; la salle et ses tables vivent au site                                                                                |
| `pim.product_channel_override`                                                        | la redéfinition de matrice par fiche (lecture par le dépôt des fiches)             | `81b192e59` (2026-10-17)                       | `product_id` → `pim.product` (Cascade)                                | `pim.product_channel` (Cascade)               | **bloquée** par `product_channel`, encore lue (§2) ; accesseur abstrait à retirer (`pim-prisma.service.ts:42`)                     |
| colonnes `public.catalog_item_overrides.price_millicents`, `decided_public_ttc_cents` | le prix décidé sur la plateforme                                                   | `b145ffcd0` (lot D, 2026-10-15)                | —                                                                     | —                                             | colonnes nullables : `DROP COLUMN`, seules                                                                                         |
| colonne `public.orders.catalog_version_id`                                            | la passation (estampille), avant X0                                                | **écrite `NULL`**, jamais lue — voir §3        | → `catalog_versions` (Restrict)                                       | —                                             | trois temps, §3                                                                                                                    |
| ligne `pim.point_of_sale` `pos_b2b`                                                   | la matrice (le canal pro), semée au démarrage                                      | `63bb374a8` (plus semée)                       | —                                                                     | —                                             | **ligne morte** (Hugo, 2026-10-17) ; part avec sa table, §2                                                                        |

## 2. Figées, mais encore LUES — pas mortes

| Table                       | Qui la lit encore (2026-10-17)                                                                                                                                                                        | Écrite par personne depuis | Ce qui la libère                                                                                                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `pim.category_channel`      | `usageByKey` (`apps/lfd-api/src/pim/sales-contexts/infrastructure/prisma-sales-context.repository.ts:110`) — le compte « vendu par » de la liste des contextes de vente (`list-sales-contexts.ts:28`) | `d66b331f0` (X4)           | retirer ce compte (L4 de [`../sites/plan-sur-place-capacite-de-site.md`](../sites/plan-sur-place-capacite-de-site.md))                       |
| `pim.product_channel`       | `usageByKey` (`prisma-sales-context.repository.ts:111`), même compte                                                                                                                                  | `d66b331f0` (X4)           | idem                                                                                                                                         |
| `pim.point_of_sale_context` | `usageByKey` (`:115`) et `offeredByLocations` (`apps/lfd-api/src/pim/sales-contexts/infrastructure/prisma-sales-context.registry.ts:89`) — le registre des contextes                                  | `63bb374a8` (L3)           | **reste lue jusqu'à L4** (Hugo, 2026-10-17 : « on attend L4 ») ; sa FK retient aussi la suppression d'un contexte (`SalesContextInUseError`) |
| `pim.point_of_sale`         | **aucun code** ne la lit (`pointOfSale` absent de `src/`), mais elle est la cible des FK des trois tables ci-dessus et de `point_of_sale_table`                                                       | `63bb374a8` (L3)           | part en dernier, avec `pos_b2b`                                                                                                              |

`category_channel` et `product_channel` pointent vers `point_of_sale` **sans
`onDelete`** (Restrict) : supprimer le point de vente avant la matrice échoue.

## 3. L'ordre, et le seul cas en trois temps

**Indépendants**, dans n'importe quel ordre : `b2b_channel_binding`,
`catalog_delivery`, `catalog_operation_overrides`, `nutrition_declaration`,
`point_of_sale_table`, `catalog_revision_publication` (après l'accesseur), les
deux colonnes de prix de `catalog_item_overrides`, puis `operation_items` →
`operations`.

**Après L4 du sur place** (le compte d'usage retiré du code) :
`product_channel` → `product_channel_override` → `category_channel` →
`point_of_sale_context` → `point_of_sale` (avec `pos_b2b`).

**`catalog_versions`, en trois temps** — la seule table encore tenue par une
colonne que le code écrit :

1. **code** : `Order` cesse de porter `catalogVersionId` (aujourd'hui posé à
   `null` par `order-drafting.service.ts:240`, écrit à la création par
   `prisma-order.repository.ts:100`, jamais relu) ;
2. **migration** : retirer la clé étrangère `orders.catalog_version_id` →
   `catalog_versions`, et la colonne si Hugo l'ordonne — les commandes passées
   avant X0 y portent leur estampille, c'est une donnée d'archive ;
3. **migration** : `DROP TABLE catalog_versions`. Ses photographies (articles
   et opérations reçus) disparaissent avec elle : c'est une perte d'archive, à
   décider en connaissance de cause.

## 4. Ce qui n'est pas prouvé

- Les **comptes de lignes** en production ne sont pas mesurés ici ; une table
  morte peut porter de la donnée d'archive (`catalog_versions`,
  `catalog_delivery`, `catalog_revision_publication`).
- Les FK sont celles du schéma Prisma ; une contrainte posée en SQL seul et
  absente du schéma ne s'y voit pas. Seules `nutrition_declaration_variant_id_fkey`
  et `operation_items_operation_key_fkey` ont été recoupées dans les
  `migration.sql`.
- `apps/lfd-api/test/pim-sales-contexts.e2e-spec.ts:233` écrit encore un
  `pointOfSale` pour éprouver le compte d'usage : il partira avec L4.
