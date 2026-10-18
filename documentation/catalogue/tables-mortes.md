# Les tables mortes du catalogue — une liste pour décision

> 📐 **Liste pour un ordre de Hugo, pas une exécution** (X5 de
> [`catalogue-synchronise.md`](catalogue-synchronise.md) §6, 2026-10-17).
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

| Table / colonne                                                                       | Qui la lisait                                                                      | Plus personne depuis                           | FK sortantes                                                          | FK entrantes                                  | Geste proposé                                                                                                                                               |
| ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pim.b2b_channel_binding`                                                             | le lien au canal par fiche, le push (`last_pushed_at`), la bascule vers l'audience | `d66b331f0` (X4, 2026-10-17)                   | `product_id` → `pim.product` (Cascade)                                | aucune                                        | démontage §1 bis (`Product.b2bBinding`)                                                                                                                     |
| `pim.operation_items`                                                                 | les opérations au référentiel (`pim/operations/**`)                                | `d66b331f0` (X4)                               | `operation_key` → `pim.operations` (Restrict)                         | aucune                                        | démontage §1 bis, **avant** `pim.operations`                                                                                                                |
| `pim.operations`                                                                      | idem                                                                               | `d66b331f0` (X4)                               | aucune                                                                | `pim.operation_items`                         | démontage §1 bis (`Operation.items`), après                                                                                                                 |
| `pim.catalog_revision_publication`                                                    | le push (écriture), « depuis la dernière publication » (lecture)                   | `fd4b0b789` (suite de X2, 2026-10-17)          | `revision_id` → `pim.catalog_revision` (Cascade)                      | aucune                                        | accesseur abstrait de `PimPrismaService` (`pim-prisma.service.ts:62`) puis démontage §1 bis (`CatalogRevision.publications`) ; **registre RGPD**            |
| `public.catalog_delivery`                                                             | la réception (boîte d'arrivée)                                                     | `181b0621f` (X2, 2026-10-17)                   | aucune (`catalog_versions.delivery_id` est une chaîne, sans relation) | aucune                                        | démontage §1 bis (aucune relation) ; **registre RGPD**                                                                                                      |
| `public.catalog_versions`                                                             | la validation d'une arrivée (écriture), la santé, la passation avant X0 (lecture)  | `181b0621f` (X2) ; écriture des commandes : X0 | aucune                                                                | `public.orders.catalog_version_id` (Restrict) | **trois temps** + choix de Hugo, §3 ; **registre RGPD**                                                                                                     |
| `public.catalog_operation_overrides`                                                  | la surcharge des opérations reçues                                                 | `181b0621f` (X2)                               | `operation_key` → `public.catalog_operations` (Restrict)              | aucune                                        | démontage §1 bis (`CatalogOperation.override`) ; **registre RGPD**. `catalog_operations` **vit**                                                            |
| `pim.nutrition_declaration`                                                           | la fiche réglementaire en une ligne                                                | `427f21912` (2026-09-22)                       | `variant_id` → `pim.product_variant`                                  | aucune                                        | démontage §1 bis (`ProductVariant.nutrition`) — lot 7 de [`../pim/plan-separer-allergenes-et-nutrition.md`](../pim/plan-separer-allergenes-et-nutrition.md) |
| `pim.point_of_sale_table`                                                             | l'écran « Points de vente » (grille de tables, QR)                                 | `63bb374a8` (L3 du sur place, 2026-10-17)      | `point_of_sale_id` → `pim.point_of_sale` (Cascade)                    | aucune                                        | **supprimée** le 2026-10-17 par `20261017120000_retrait_du_point_de_vente_et_de_la_matrice` (L4)                                                            |
| `pim.product_channel_override`                                                        | la redéfinition de matrice par fiche (lecture par le dépôt des fiches)             | `81b192e59` (2026-10-17)                       | `product_id` → `pim.product` (Cascade)                                | `pim.product_channel` (Cascade)               | **supprimée** le 2026-10-17 par `20261017120000_retrait_du_point_de_vente_et_de_la_matrice` (L4)                                                            |
| colonnes `public.catalog_item_overrides.price_millicents`, `decided_public_ttc_cents` | le prix décidé sur la plateforme                                                   | `b145ffcd0` (lot D, 2026-10-15)                | —                                                                     | —                                             | le champ quitte le schéma **avant ou avec** la colonne, §1 bis                                                                                              |
| colonne `public.orders.catalog_version_id`                                            | la passation (estampille), avant X0                                                | **écrite `NULL`**, jamais lue — voir §3        | → `catalog_versions` (Restrict)                                       | —                                             | trois temps, §3                                                                                                                                             |
| ligne `pim.point_of_sale` `pos_b2b`                                                   | la matrice (le canal pro), semée au démarrage                                      | `63bb374a8` (plus semée)                       | —                                                                     | —                                             | **supprimée** avec sa table le 2026-10-17 (`20261017120000_retrait_du_point_de_vente_et_de_la_matrice`, L4)                                                 |

## 1 bis. Le geste réel : pas de `DROP` seul

Une table qui part d'une migration mais reste au schéma Prisma fait mentir le
client généré. Le geste du dépôt, pour chaque ligne du §1, est :

1. retirer le **modèle** du schéma (`apps/lfd-api/prisma/schema/`) **et** ses
   champs de relation chez les modèles qui vivent ;
2. régénérer le client ;
3. écrire la migration (`DROP`), relue par `lecteur-de-migrations`.

Ce qui bouge dans le schéma, par table (lu le 2026-10-17) :

| Table                                          | Modèle retiré                | Champ de relation retiré chez un modèle vivant                                                                      |
| ---------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `pim.b2b_channel_binding`                      | `B2bChannelBinding`          | `Product.b2bBinding` (`pim/product.prisma:153`)                                                                     |
| `pim.operation_items`, `pim.operations`        | `OperationItem`, `Operation` | aucun hors d'eux (`Operation.items`, `pim/operations.prisma:45`)                                                    |
| `pim.catalog_revision_publication`             | `CatalogRevisionPublication` | `CatalogRevision.publications` (`pim/revisions.prisma:57`)                                                          |
| `public.catalog_delivery`                      | `CatalogDelivery`            | aucun                                                                                                               |
| `public.catalog_versions`                      | `CatalogVersion`             | `Order.catalogVersion` + `Order.catalogVersionId` (`public/orders.prisma:132`) — §3                                 |
| `public.catalog_operation_overrides`           | `CatalogOperationOverride`   | `CatalogOperation.override` (`public/catalog-operations.prisma:69`)                                                 |
| `pim.nutrition_declaration`                    | `NutritionDeclaration`       | `ProductVariant.nutrition` (`pim/product.prisma:277`)                                                               |
| `pim.point_of_sale_table` — **fait (L4)**      | `PointOfSaleTable`           | `PointOfSale.tables` (retiré en L4)                                                                                 |
| `pim.product_channel_override` — **fait (L4)** | `ProductChannelOverride`     | `Product.channelOverrideRows` (retiré en L4) ; `ProductChannel.override` part avec `product_channel` (retiré en L4) |

**Les deux colonnes de prix de `catalog_item_overrides`**
(`public/catalog.prisma:510`, `:521`) : les champs `priceMillicents` et
`decidedPublicTtcCents` quittent le schéma **avant ou avec** la colonne,
jamais après. Une colonne retirée en base alors que le champ reste au schéma
fait tomber en 500 tout `upsert` sans `select` sur la table, puisque Prisma
relit toutes les colonnes qu'il connaît.

### Les auteurs staff : le registre RGPD part dans le même commit

Quatre de ces tables portent l'auteur d'un geste, inscrit au registre
[`../legal/rgpd-registre.json`](../legal/rgpd-registre.json) :

| Colonne                                         | Registre | Inventaire des auteurs |
| ----------------------------------------------- | -------- | ---------------------- |
| `pim.catalog_revision_publication.published_by` | l. 471   | l. 37                  |
| `public.catalog_delivery.accepted_by`           | l. 777   | l. 31                  |
| `public.catalog_operation_overrides.decided_by` | l. 795   | absente                |
| `public.catalog_versions.created_by`            | l. 813   | l. 39                  |

Le démontage de chacune **retire son entrée du registre dans le même commit** :
`lint:rgpd-staff` (`dev-toolbox/gates/rgpd-staff.mjs`) refuse une entrée dont
la colonne a disparu. Il retire aussi sa ligne de
[`../staff/requetes/inventaire-des-auteurs-staff.sql`](../staff/requetes/inventaire-des-auteurs-staff.sql),
qui échouerait sur une table absente (la ligne 29, `b2b_channel_binding.published_by`,
suit le même sort). Le texte d'information du livreur, qui lit le registre,
est à **relire** après : une donnée qui n'est plus tenue ne doit plus y être
annoncée.

## 2. Figées, mais encore LUES — supprimées en L4

> ✅ **Supprimées le 2026-10-17** par `20261017120000_retrait_du_point_de_vente_et_de_la_matrice`
> (L4 de [`../sites/sites.md`](../sites/sites.md) §6 bis) :
> `pim.product_channel`, `pim.product_channel_override`, `pim.category_channel`,
> `pim.point_of_sale_context`, `pim.point_of_sale_table`, `pim.point_of_sale`
> (avec `pos_b2b`) et le type `pim.point_of_sale_kind`. Leurs derniers
> lecteurs — `usageByKey` (comptes « vendu par » et « offert par ») et
> `offeredByLocations` — sont partis dans le même lot ; ce qui retient un
> contexte de vente se réduit aux **taux**.
>
> Mesure de production avant le `DROP` (Hugo, 2026-10-17) : 3 points de vente,
> 5 rattachements, 0 table, 25 lignes `category_channel`, 0 `product_channel`,
> 0 redéfinition. Contenu exporté en JSON par Hugo, rangé hors du dépôt.
>
> 🔴 **La même migration repasse en `RESTRICT`** les FK
> `category_context_tva_context_id_fkey` et `product_context_tva_context_id_fkey`
> (elles étaient en `CASCADE`) : sans quoi, la matrice partie, supprimer un
> contexte aurait effacé ses taux en silence (objection de `vitruve`).

## 3. L'ordre, et le seul cas en trois temps

**Indépendants**, dans n'importe quel ordre : `b2b_channel_binding`,
`catalog_delivery`, `catalog_operation_overrides`, `nutrition_declaration`,
`catalog_revision_publication` (après l'accesseur), les
deux colonnes de prix de `catalog_item_overrides`, puis `operation_items` →
`operations`.

**Fait en L4 du sur place** (2026-10-17, dans cet ordre) :
`product_channel` → `product_channel_override` → `category_channel` →
`point_of_sale_context` → `point_of_sale_table` → `point_of_sale` (avec
`pos_b2b`), puis le type `point_of_sale_kind` — §2.

**`catalog_versions`, en trois temps** — la seule table encore tenue par une
colonne que le code écrit.

🔴 **L'invariant que ce démontage défait** est écrit dans la migration qui l'a
posé (`20260902190000_versions_du_catalogue/migration.sql:30-37`) : la clé
étrangère est en `RESTRICT` parce qu'« une version citée par une commande est
immortelle » — purger l'archive ne peut pas rendre une commande
inintelligible. Retirer la table, c'est renoncer à cette promesse.

**Choix à Hugo, avant tout geste :**

- **(a)** la colonne `orders.catalog_version_id` part avec la table : les
  commandes d'avant X0 perdent leur estampille ;
- **(b)** l'archive (versions, articles et opérations reçus) est **exportée**
  avant, puis la table et la colonne partent.

**La mesure qui décide**, en lecture seule, à lancer par Hugo sur la
production :

```sql
SELECT count(*) FROM public.orders WHERE catalog_version_id IS NOT NULL;
```

Zéro : (a) ne perd rien. Sinon, c'est le nombre de commandes dont l'estampille
disparaît sous (a).

> **Mesuré en production et tranché par Hugo le 2026-10-17.** 24 commandes sur
> 24 portent une estampille, toutes vers **une seule** version (1 en base) ; la
> dernière date du 2026-10-14, avant X0. **Choix : (b) puis (a)** — l'unique
> version est exportée hors du dépôt (`SELECT row_to_json(v) FROM
public.catalog_versions v;`, rangée par Hugo), puis la colonne part avec la
> table. Les 24 commandes restent explicables sans elle : chaque ligne porte
> nom, prix, TVA et trace du prix. Démontage en trois temps ci-dessous, plan
> contredit par `vitruve` avant Hugo, rien sans son ordre.

Les temps, une fois le choix fait :

1. **code** : `Order` cesse de porter `catalogVersionId` (aujourd'hui posé à
   `null` par `order-drafting.service.ts:240`, écrit à la création par
   `prisma-order.repository.ts:100`, jamais relu) ; le schéma perd
   `Order.catalogVersion` et `Order.catalogVersionId` ;
2. **migration** : retirer la clé étrangère `orders_catalog_version_id_fkey`,
   et la colonne selon le choix ;
3. **migration** : `DROP TABLE catalog_versions` (et le modèle
   `CatalogVersion`), avec son entrée du registre RGPD (§1 bis).

## 4. Ce qui n'est pas prouvé

- Les **comptes de lignes** en production ne sont pas mesurés ici ; une table
  morte peut porter de la donnée d'archive (`catalog_versions`,
  `catalog_delivery`, `catalog_revision_publication`).
- Les FK de ces tables ont **toutes** été recoupées dans les `migration.sql`
  le 2026-10-17 (vitruve). À ajouter à la liste : `catalog_operation_items` →
  `catalog_operations` (`RESTRICT`,
  `20260924180000_les_operations_traversent_le_fil/migration.sql:63-66`) —
  `catalog_operations` vit, mais elle reste retenue par ses articles.
- Les faits passés `catalog_delivery.accepted` gardent leur `deliveryId` : il
  ne pointera plus nulle part une fois la table partie. C'est acceptable — un
  fait passé ne se réécrit pas, et aucun lecteur ne suit plus ce lien (la phrase du journal ne lit que `excludedSkus`, `commerce-phrases.ts:105`, vérifié le 2026-10-17).
- L'e2e `pim-sales-contexts` n'écrit plus de point de vente depuis L4 : il
  éprouve le refus par un taux réglé (famille et fiche).
