# Effacer une fiche archivée qui n'a jamais servi

> **Doc-first, 2026-11-10 — version 2**, après le verdict de `vitruve` sur la
> première (cinq bloquants, §6). La v1 inventait un lecteur piloté par le
> schéma ; Hugo avait vu le défaut avant lui (« un port par module pour dire
> _product used here_ est le mauvais pattern », puis « ça ne marche qu'avec
> une seule base », puis « et si une colonne ne s'appelle pas comme la liste
> de noms qui sert de déclencheur ? »). La réponse était déjà dans le dépôt :
> **le port `SaleReferenceUsage`**, que le référentiel déclare et que le
> commerce implémente depuis le plan « changer l'unité de vente ». Tout ce
> qui suit a été lu dans le code le 2026-11-10 ; rien n'est bâti.
>
> Hugo : « une page dans catalogue pour la suppression de choses archivées…
> qui n'auraient jamais servi » ; « une suppression par type d'objet » ; « on
> peut commencer par la fiche » ; « publiée vers la plateforme, ça ne doit pas
> bloquer si ça n'a jamais été vendu ».

## Partie 1 — ce qu'on décide

### Le principe : la règle appartient au type, la page ne sait rien

Chaque type d'objet du référentiel porte **sa** règle d'effaçabilité et **sa**
commande d'effacement. La page « Archives » du catalogue liste par type et
affiche le verdict que le type lui rend. Ce document ne traite que **la fiche
produit** ; déclinaisons et familles viendront sur le même socle (§4).

### « Avoir servi » : la question existe déjà, et le commerce y répond déjà

Le référentiel ne peut pas lire les tables du commerce (`CLAUDE.md` §3). Il
n'a pas à le faire : il **déclare déjà** un port pour exactement cette
question — `pim/channels/b2b-platform/sale-reference-usage/` :

> « Cette référence a-t-elle déjà servi ? » — commande de tout statut,
> brouillon, panier gardé, abonnement, réassort, lot, gabarit, décision
> tarifaire en vigueur ou close (`SaleReferenceUsage.usesOf`, douze usages,
> JSON compris — `prisma-sale-reference-usage.ts` les lit chacun à sa façon :
> colonne, charge JSON, portée).

C'est lui qui fige l'unité de vente d'une déclinaison dès son premier usage.
**Deux définitions de « servi » auraient divergé** ; il n'y en aura qu'une.
Le port gagne une **seconde méthode**, pour l'effacement, sans toucher à la
première (qui gouverne le gel de l'unité de vente et dont la liste
`SALE_REFERENCE_USES` ne bouge pas) :

```
SaleReferenceUsage.holdsOf(references): Promise<ReadonlyMap<sku, readonly SaleReferenceHold[]>>
  SaleReferenceHold = { kind, severity: "retains" | "warns", count }
```

Les `kind` et leur sévérité sont **écrits dans le port**, côté référentiel —
c'est sa règle, pas celle du commerce :

| `kind`                                                                                            | sévérité | ce que c'est                                                                                               |
| ------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------- |
| `order`, `order_draft`, `shop_cart`, `subscription`, `resupply`, `bundle`                         | retains  | une vente, ou une vente en train de se faire                                                               |
| `exclusivity` (« réservation » aujourd'hui, renommage au lexique)                                 | retains  | un engagement pris pour une société                                                                        |
| `mirror_not_settled`                                                                              | retains  | le miroir n'a pas encore appliqué l'archivage (fait durable en reprise) : un article y est encore vendable |
| `price_rule`, `price_floor`, `volume_ladder`, `volume_commitment`, `mercuriale`, `price_template` | warns    | une décision tarifaire par référence, qui restera orpheline                                                |
| `promotion`, `pickup_discount`, `storefront`, `suggestion`, `operation_override`                  | warns    | un réglage qui vise la fiche (par **id** ou par SKU selon la table — le commerce le sait, pas le port)     |

Le commerce implémente `holdsOf` dans le **même** fichier que `usesOf`, en
réutilisant ses lectures et en ajoutant celles qui manquent (exclusivités,
promotions et remises de retrait par `target` + `target_id` = id de fiche,
vitrine, suggestions, `hidden_skus` des opérations, l'état du miroir).

**Ce qui n'a pas besoin de port** : le fournil, le colisage, la livraison et
la croissance. Un SKU n'y arrive qu'après une **commande** (ou un réassort),
déjà retenus par `order` / `resupply` ; et les compteurs de la croissance
(`product_audience_counters` : vues, ajouts au panier, suggestions montrées)
sont de l'**exposition**, pas de la vente — les compter retiendrait une fiche
regardée une fois, le contraire du critère de Hugo. Les factures et relevés
découlent des commandes. Les révisions publiées sont de l'histoire : elles
citent le SKU en texte et survivent à l'effacement.

Le référentiel ajoute ses propres avertissements, qu'il lit chez lui :
`operation_item` (une opération cite le SKU), `order_time_limit` (une limite
vise la fiche par **id**).

### Ce qu'« effaçable » veut dire

Une fiche est effaçable si elle est **archivée**, si **aucune** retenue
(`retains`) ne porte sur **aucun** de ses SKU (fiche et déclinaisons — **y
compris les SKU qu'elle a portés**, lus dans `sku_registry` par `owner_id` :
une déclinaison renommée a pu vendre sous son ancien SKU), et si le miroir a
**appliqué son archivage** (`mirror_not_settled` absent). Les avertissements
ne bloquent pas : ils s'affichent, et le fait d'effacement les garde.

### Ce que l'effacement fait, dans l'ordre

`EraseArchivedProductCommand(id)`, sous la ressource **`pim_catalog_erasure`**
(une ressource propre, ajoutée par migration et accordée à l'écran — un geste
irréversible ne se cache pas derrière le droit d'édition,
`plan-droits-par-geste.md`), dans **une** transaction :

1. charge la fiche **sous verrou** (`lockProducts`, le même que la
   publication), exige `archived` ;
2. **revérifie** `holdsOf` sur tous ses SKU, présents et passés — une retenue
   ⇒ `ArchivedProductRetainedError` (`BusinessError`) qui **les nomme** ;
3. tire un **numéro de séquence** (`PublicationSequence`, comme toute
   émission du catalogue) ;
4. **coupe les liens de détachement par l'agrégat**, des deux côtés — les
   trois clés `RESTRICT` : `product.origin_variant_id` (le fruit),
   `product_variant.detached_to_product` (l'origine) **et**
   `product_variant.detached_from_variant_id` (la copie chez le fruit) ; la
   fiche voisine est chargée, mutée par une méthode (`forgetLineage`),
   journalisée (`product.lineage_cut`) et **réémise** vers la plateforme
   (`catalog-facts.source.ts` dérive `detachedFromSku` de ces clés : sans
   réémission, son miroir mentirait) ;
5. journalise `product.erased` avec l'instantané entier (SKU, nom, famille,
   déclinaisons et leurs SKU, lignée, avertissements, auteur) — la trace
   survit à l'objet et se lit seule ;
6. publie, **dans la même transaction**, le fait durable
   `pim.catalog_product_erased { productId, skus, seq }` ;
7. efface les satellites dans l'ordre des clés : par déclinaison —
   `variant_allergens`, `nutrition_values`, `nutrition_declaration`,
   `product_packaging`, puis `product_variant` ; puis `product_readiness`,
   `product_context_tva`, `product_ingredient`, `product_media` (la ligne de
   liaison ; le visuel de la médiathèque reste), `product_editorial`,
   `b2b_channel_binding`, puis `product` ;
8. **ne touche pas `sku_registry`** : le SKU reste pris pour toujours.

### Le miroir : une pierre tombale, pas un trou

`b2b/catalog` écoute `pim.catalog_product_erased` (`@DurableHandler`) et :

- pose `catalog_entries.status = erased` avec `applied_seq = seq`, sous la
  même condition « plus récent que la ligne » que les autres faits
  (`recordEntryIfNewer`) — **c'est ce qui empêche un `catalog_product_changed`
  en retard, ou rejoué depuis les lettres mortes, de ressusciter la fiche** :
  il est plus ancien que la pierre tombale, il n'écrit rien ;
- laisse `catalog_items` **retirés** tels quels (ils le sont depuis
  l'archivage), avec leurs décisions (`catalog_item_overrides`) et leur
  historique de prix — rien n'est effacé côté commerce : une décision
  commerciale ne disparaît pas par cascade, et l'historique des prix est
  `append-only` ; une entrée `erased` ne se sert plus nulle part (le lecteur
  du catalogue la filtre comme une `archived`), et `ShelfChanges` purge le
  cache des rayons ;
- refuse (lettre morte visible) s'il trouve encore un article non retiré ou
  une exclusivité vivante — la course entre le verdict et le geste, que le
  `mirror_not_settled` rend improbable.

### Le registre des SKU, rendu infranchissable

Aujourd'hui, un SKU **imposé** à la création d'une déclinaison ne passe pas
par `isTaken` (`add-product-variant.ts`), et le registre s'écrit par un
`upsert` muet (`prisma-product.repository.ts`) : c'est l'unicité de
`product_variant.sku` qui rattrape le doublon, parce que la ligne d'origine
n'a jamais disparu. **Après un effacement, plus rien ne la rattraperait.**
Avant E2 : le registre s'écrit par un `create` qui **échoue** sur la clé
(`SkuAlreadyUsedError`, comme le modèle le promet déjà), et la porte
`sku-never-recycled` vérifie qu'aucun `skuRegistry.upsert|delete|deleteMany`
n'existe. Le commentaire de tête de la porte, qui affirme « aucune ligne n'est
jamais supprimée », est réécrit : **une fiche archivée jamais vendue l'est,
par sa commande, et son SKU reste au registre**.

### La page

`/pim/catalogue/archives` (back-office, `pim_catalog:read` pour voir,
`pim_catalog_erasure:write` pour effacer) : la liste des fiches archivées,
chacune avec son verdict — **Effaçable**, ou **Retenue par** la liste des
retenues (« 12 lignes de commande », « exclusivité accordée à Les
Tommeuses », « miroir pas encore à jour ») — et ses avertissements (« visée
par 1 promotion, 2 règles de prix ») ; un bouton « Effacer » sur les
effaçables seulement, avec confirmation qui répète le SKU, le nom et les
avertissements. Une fiche retenue reste archivée : c'est son état final.

## Partie 2 — le détail technique

### Vérifié dans le code le 2026-11-10

- `SaleReferenceUsage` (`pim/channels/b2b-platform/sale-reference-usage/sale-reference-usage.ts`) :
  port déclaré par le référentiel, implémenté par
  `b2b/catalog/infrastructure/prisma-sale-reference-usage.ts` (douze
  lectures : `orderLine`, `orderDraft` et `shopCart` par charge JSON,
  `subscriptionLine`, réassorts, `bundleChoice`, `priceTemplate` par lignes,
  `priceRule` / `priceFloor` / `volumeLadder` / `volumeCommitment` par portée,
  mercuriales), par lot, référence calculée par `shopSkuOf`.
- Clés vers `Product` et `ProductVariant` (`RESTRICT` / `CASCADE`) : lues
  dans `product.prisma`, `editorial-media.prisma`, `regulatory-sheet.prisma`,
  `channels.prisma` et les migrations `20260820160000_schema_pim`,
  `20260823170000_conditionnements`, `20261030170000` (`detached_from_variant_id`).
- `CatalogEntryStatus` connaît `inactive | active | archived`
  (`catalog-facts.ts`) ; `recordEntryIfNewer` et `applied_seq`
  (`prisma-catalog-product-facts.projection.ts`) ; le relais de la boîte
  d'envoi ordonne par `next_attempt_at` et les lettres mortes se rejouent
  (`ReplayOutboxDeliveryHandler`) — d'où la pierre tombale.
- `growth.product_audience_counters` compte des vues, des ajouts au panier
  et des suggestions (`growth.prisma`).
- `promotion_scope_rules` et `pickup_discount_rules` visent par `target` +
  `target_id` = **id** de fiche ; `order_time_limit.scope_id` est un id ;
  `price_rules.scope_id` est un SKU.
- `add-product-variant.ts` (SKU imposé sans `isTaken`) et
  `prisma-product.repository.ts` (`skuRegistry.upsert … update: {}`).
- `sku-never-recycled.mjs` : `PROTECTED = ["product", "productVariant"]`,
  `.delete|.deleteMany` en clair seulement.
- Aucun précédent d'effacement d'une fiche dans `src/`.

### Les lots

- **E1 — la question** : `holdsOf` sur le port (kinds, sévérités,
  `SaleReferenceHold`), l'implémentation côté commerce (lectures neuves :
  exclusivités, promotions / remises par id, vitrine, suggestions,
  `hidden_skus`, état du miroir) avec une spec par lecture ; les
  avertissements du référentiel (`operation_item`, `order_time_limit`) ; les
  SKU passés par `sku_registry.owner_id` ; la requête
  `ListArchivedProductsWithHolds` et sa route `GET pim/products/archives`
  (contrat `ArchivedProductView` dans `@lfd/pim-contracts`) ; e2e : retenue
  par une commande, retenue par une exclusivité, retenue « miroir pas à
  jour », publiée jamais vendue avec avertissements ⇒ effaçable, jamais
  publiée ⇒ effaçable.
- **E2 — l'effacement** : la ressource `pim_catalog_erasure` (migration,
  enum, portée, libellé, graine) ; le registre infranchissable (E2 **commence
  par là**) ; `forgetLineage` sur l'agrégat et le fait `product.lineage_cut` ;
  `EraseArchivedProductCommand`, le dépôt d'effacement (ordre des clés), le
  fait `pim.catalog_product_erased` avec `seq`, le journal `product.erased`
  et sa phrase au back-office ; côté commerce, `erased` dans
  `CatalogEntryStatus` et son abonné durable ; la liste admise de
  `sku-never-recycled` et son commentaire ; le `CLAUDE.md` §3 (l'exception
  nommée, datée) ; e2e : effacée, journal, registre intact, révision encore
  lisible, entrée `erased` au miroir après drainage, un
  `catalog_product_changed` ancien rejoué **n'écrit rien**, refus nommé si
  une retenue est apparue entre le verdict et le geste, l'effacement d'un
  fruit de détachement réémet l'origine.
- **E3 — la page** (Angular, fold-ng).
- **Plus tard, même socle** : la déclinaison arrêtée, la famille archivée
  vide (ses retenues : règles, promotions, limites, remises de site qui la
  visent par id — les orphelins silencieux signalés dans la réponse au mail
  de l'équipe), puis visuels orphelins, ingrédients, conditionnements.

### Ce qui n'a pas de lecteur, et pourquoi c'est accepté

Les colonnes qui portent un SKU sous un autre nom ou dans un JSON sont
connues **une par une** par le commerce (c'est son métier) ; une colonne
neuve, demain, mal nommée, n'est couverte que par la relecture — comme toute
convention. Le lexique dit : **une colonne qui porte un SKU s'appelle `sku`,
`*_sku` ou `*_skus`** (ajouté le 2026-11-10).

## §6. Le verdict de `vitruve` sur la v1 (2026-11-10), intégré

Bloquants : la croissance et les réglages du fournil rangés en « retient »
par schéma (classement trop grossier → le port, par usage) ; le registre des
SKU qui ne tient pas seul (`upsert` muet, SKU imposé sans `isTaken` → le
registre infranchissable) ; la clé `detached_from_variant_id` oubliée et une
fiche vivante réécrite sans agrégat ni réémission (→ `forgetLineage`) ; le
`DELETE` du miroir qui détruit son garde d'ordre (→ pierre tombale avec
`seq`, `productId` dans le fait) ; le scanner par nom de colonne aveugle aux
promotions et aux sémantiques par table (→ `holdsOf` sur le port existant).
Sérieux : le JSON invisible (→ le port le lit déjà) ; **`SaleReferenceUsage`
existait** ; la revérification n'est pas un verrou tant que le miroir n'a pas
convergé (→ `mirror_not_settled`) ; le droit (→ `pim_catalog_erasure`) ; les
portes contournées (→ plus de scanner) ; les décisions commerciales emportées
par cascade (→ rien n'est effacé côté commerce). Mineurs repris : plus de
« révision publiée » parmi les retenues, `order_time_limit` rangé une fois,
`catalog_price_history` jamais effacé, un seul lot `= ANY($skus)` par lecture.
