# Effacer une fiche archivée qui n'a jamais servi

> **Doc-first, 2026-11-10** (Hugo : « une page dans catalogue pour la
> suppression de choses archivées… qui n'auraient jamais servi » ; « une
> suppression par type d'objet » ; « on peut commencer par la fiche »).
> Lu dans le code ce jour-là : `prisma/schema/pim/*.prisma`, les migrations
> d'origine, `dev-toolbox/gates/sku-never-recycled.mjs`, le canal
> `pim/channels/b2b-platform/`, les projections du miroir B2B. Rien n'est
> bâti.

## Partie 1 — ce qu'on décide

### Le principe : la règle appartient au type, la page ne sait rien

Chaque type d'objet du référentiel porte **sa** règle d'effaçabilité et
**sa** commande d'effacement. La page « Archives » du catalogue liste par type
et affiche le verdict que le type lui rend — « effaçable », ou « retenue
par : … ». Ce document ne traite que **la fiche produit** ; déclinaisons et
familles viendront sur le même socle (§4).

### Ce qu'« avoir servi » veut dire pour une fiche

**Hugo, 2026-11-10 : « publiée vers la plateforme, ça ne doit pas bloquer si
ça n'a jamais été vendu ».** Le critère est donc la **vente**, pas
l'exposition. Les traces d'une fiche se rangent en trois familles :

**1. Ce qui RETIENT** (la fiche ne s'efface pas) — toute trace d'une vente ou
de ce qui en découle :

| Retenue                                                                                              | Où ça se lit                                                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| elle n'est pas archivée                                                                              | `product.status ≠ archived`                                         |
| un de ses SKU (fiche ou déclinaisons) est dans une ligne de commande                                 | `public.order_lines.sku` (texte, sans clé)                          |
| …dans une **exclusivité** accordée à une société (« réservation » aujourd'hui, renommage au lexique) | `public.catalog_item_reservations` (clé `RESTRICT` vers l'article)  |
| …dans le fournil, le colisage, la livraison, la croissance                                           | les tables à `sku` de `production`, `packing`, `delivery`, `growth` |
| …dans un abonnement, un réassort, un bon de livraison                                                | `subscriptions`, `resupply`, `delivery_notes`                       |

**2. Ce qui SE NETTOIE avec elle** — ce que le référentiel et le miroir de la
plateforme possèdent : la fiche, ses déclinaisons et leurs satellites ; le
**binding** de publication ; **le lien de détachement** (Hugo, 2026-11-10 :
`origin_variant_id` / `detached_to_product` sont des clés `RESTRICT` qui ne
servent qu'à l'écran de lignée — l'effacement **coupe le lien** de l'autre
côté, et le fait `product.deleted` garde la lignée) ; et, côté plateforme, ses lignes du miroir
(`catalog_items`, `catalog_entries`, `catalog_price_history`, les décisions
par article `catalog_item_override` en cascade) — par un fait durable
`pim.catalog_product_deleted` que `b2b/catalog` écoute, avec le signal
`ShelfChanges` (porte `shelf-writes`).

**3. Ce qui RESTE ORPHELIN, listé** — les réglages qui visent le SKU par
identifiant opaque, sans clé : règle de prix, plancher, palier, grille de
mercuriale, promotion, placement de vitrine, suggestion, opération, limite
de commande. **Exactement ce qu'une famille archivée laisse déjà derrière
elle** (`settings.prisma` : « une famille retirée laisse une règle
orpheline »). La page les affiche en **avertissement**, sans bloquer, et le
fait `product.deleted` les inscrit au journal pour qu'on puisse les
nettoyer ensuite.

Les **révisions publiées** sont de l'histoire : elles citent le SKU en
texte, survivent à l'effacement et se lisent encore — ni retenue, ni
nettoyage.

### Pourquoi le référentiel ne peut pas le savoir seul, et comment il le demande

La moitié de ces traces vivent dans des blocs que le référentiel **n'a pas le
droit de lire** (`CLAUDE.md` §3 : `pim → b2b`, `pim → production` sont ✗). Il
**déclare** donc un canal, `pim/channels/holds/`, avec un port :

```
SkuHoldsReader.holdsOf(skus: string[]): Promise<SkuHold[]>
  SkuHold = { sku, kind: "order_line" | "catalog_mirror" | "pricing" | "promotion" | "storefront" | "suggestion" | "production" | "packing" | "delivery" | …, count, label }
```

que **chaque bloc qui range un SKU implémente pour ses tables** (`b2b` :
commandes, miroir, tarifs, promotions, vitrine, suggestions, abonnements,
réassort ; `production` ; `packing` ; `delivery` ; `growth`) et
qu'`appBootstrap` compose en un seul lecteur (`composite`, la figure de
`composite-media-carriers.ts`). Le référentiel ajoute ses propres avertissements (opération, limite de
commande) ; il n'a aucune retenue propre. Le même port rend les
**avertissements** avec leur `kind`, et c'est le genre qui dit s'il retient
ou s'il avertit — la liste est écrite dans le canal, pas dans la page. Un bloc qui
n'implémente pas le port n'est **pas** interrogé : c'est donc le bâti qui
tient la liste, et un test compte les implémenteurs contre la liste des
schémas qui ont une colonne `sku` (lue dans le catalogue Postgres, comme
`truncateAll`) — **une table à SKU sans implémenteur fait rougir le test**.

### Ce que l'effacement fait, dans l'ordre

`DeleteArchivedProductCommand(id)`, `pim_catalog:write`, dans **une**
transaction :

1. charge la fiche **sous verrou**, exige `archived` ;
2. **revérifie** toutes les retenues (le verdict de la page a pu vieillir) ;
   une seule ⇒ `BusinessError` qui **les nomme** (« retenue par 3 lignes de
   commande et 1 révision publiée ») ;
3. journalise **avant** d'effacer : `product.deleted` avec l'instantané
   (SKU, nom, famille, SKU des déclinaisons, auteur) — la trace survit à
   l'objet, comme pour l'archivage ;
4. coupe les liens de détachement (le fruit perd son `origin_variant_id`,
   une déclinaison d'origine perd son `detached_to_product`), puis efface
   les satellites dans l'ordre des clés : déclinaisons (allergènes,
   nutrition, déclaration, conditionnements, puis la déclinaison), readiness,
   TVA par contexte, ingrédients, médias **du produit** (la ligne de liaison ;
   le visuel de la médiathèque reste — il peut servir ailleurs), éditorial,
   binding, puis la fiche ;
5. **ne touche pas** `sku_registry` : le SKU reste pris pour toujours
   (`06-identifiants-et-sku.md`, « jamais libéré »), et la ligne garde
   `owner_id` comme trace ;
6. publie, **dans la même transaction**, le fait durable
   `pim.catalog_product_deleted` (SKU de la fiche et des déclinaisons) ;
   `b2b/catalog` l'écoute (`@DurableHandler`) et efface ses lignes du miroir
   (`catalog_items` et ce qui en cascade, `catalog_entries`,
   `catalog_price_history`), sous `ShelfChanges` ; une réservation vivante
   l'aurait retenue en amont (point 2).

### Ce qui change dans les gardes

- `sku-never-recycled` refuse aujourd'hui tout `product.delete` : le dépôt
  d'effacement entre dans sa **liste admise, daté, avec sa raison** (le seul
  chemin qui efface, et il ne libère pas le SKU) ; la porte gagne la
  vérification que `sku_registry` n'est **jamais** effacé par ce chemin.
- `prisma-model-ownership` : l'écrivain des modèles du PIM reste le PIM ;
  celui du miroir reste `b2b/catalog`, qui efface ses propres lignes sur le
  fait.
- Le CLAUDE.md § 3 (« pas de DELETE physique sur les agrégats métier ») gagne
  l'exception nommée : **une fiche archivée sans aucune trace**, par sa
  commande, après revérification — et dit pourquoi une archive qui n'a
  jamais servi n'est pas un agrégat métier mais une erreur de saisie.

### La page

`/pim/catalogue/archives` (back-office, `pim_catalog:read` pour voir,
`pim_catalog:write` pour effacer) : la liste des fiches archivées, chacune
avec son verdict — **Effaçable**, ou **Retenue par** la liste des retenues
(« 12 lignes de commande », « révision publiée du 2026-09-03 », « vitrine ») ;
les avertissements (« visée par 1 promotion, 2 règles de prix ») sous le
verdict ; un bouton « Effacer » sur les effaçables seulement, avec
confirmation qui répète le SKU, le nom et les avertissements ; après l'effacement, la fiche disparaît de la liste
et le journal porte `product.deleted`. Une fiche retenue ne s'efface pas
d'ici : elle reste archivée, c'est son état final.

## Partie 2 — le détail technique, ce qui est vérifié et ce qui ne l'est pas

### Vérifié dans le code le 2026-11-10

- Clés vers `Product` : `ProductVariant`, `ProductEditorial`, `ProductMedia`
  en `RESTRICT` ; `ProductContextVat`, `ProductReadiness`,
  `ProductIngredient`, `B2bChannelBinding` en `CASCADE` ;
  `originVariant` / `detachedToProduct` en `RESTRICT` (`product.prisma`,
  `editorial-media.prisma`, `regulatory-sheet.prisma`, `channels.prisma`,
  migration `20260820160000_schema_pim`).
- Clés vers `ProductVariant` : `ProductPackaging`, `NutritionDeclaration` en
  `RESTRICT` ; `VariantAllergens`, `NutritionValues` en `CASCADE`.
- `CatalogRevisionItem.sku` et `OperationItem.sku` sont opaques (pas de
  clé) ; une révision survit à l'effacement et se lit encore (`CatalogContent`
  n'est jamais purgé, `editorial-media.prisma`).
- `SkuRegistry` sans relation ; `isTaken` le lit
  (`prisma-sku-availability.ts`) ; la porte `sku-never-recycled` ne couvre
  que `product` / `productVariant` `.delete` / `.deleteMany` en clair.
- Le miroir B2B n'a aucune clé vers le PIM et ne connaît que `withdrawn_at`
  (`catalog.prisma`, `on-catalog-product-changed.handler.ts`) ; l'émetteur
  n'émet que pour un corps existant (`catalog-facts.emitter.ts`).
- Aucun précédent d'effacement d'une fiche dans `src/` ; le seul ordre écrit
  de traitement des tables à SKU est le rollback
  `prisma/rollback/20261029180000_*.sql` (fusion de SKU).

### Les lots

- **E1 — le canal et le verdict** : `pim/channels/holds/` (`SkuHoldsReader`,
  `SkuHold { sku, kind, severity: retains | warns, count, label }`) ; les
  retenues et avertissements internes du PIM ; les implémenteurs par bloc
  (`b2b` : commandes, réservations, abonnements, réassort, bons, tarifs,
  promotions, vitrine, suggestions ; `production` ; `packing` ; `delivery` ;
  `growth`) et le composite d'`appBootstrap` ; le test « toute table à SKU a
  son implémenteur » ; la requête `ListArchivedProductsWithHolds` ; e2e sur
  une fiche retenue par une commande, une publiée jamais vendue (effaçable,
  avec avertissements), une effaçable sans rien.
- **E2 — l'effacement** : `DeleteArchivedProductCommand`, le dépôt (ordre des
  satellites, verrou, journal `product.deleted` avec les avertissements +
  phrase au back-office), le fait `pim.catalog_product_deleted` dans
  `pim/channels/b2b-platform/` et son abonné durable dans `b2b/catalog`
  (effacement du miroir sous `ShelfChanges`), la liste admise de
  `sku-never-recycled`, le CLAUDE.md ; e2e : effacée, journal présent,
  registre intact, révision encore lisible, miroir vidé de ses lignes après
  drainage, refus nommé si une retenue est apparue entre le verdict et le
  geste.
- **E3 — la page** (Angular, fold-ng) : `/pim/catalogue/archives`, verdicts,
  bouton, confirmation, rafraîchissement.
- **Plus tard, même socle** : la déclinaison arrêtée (retenues : les mêmes
  par SKU + `is_default`, `detached`), la famille archivée vide (retenues :
  règles de prix, promotions, limites, remises de site qui la visent par id
  — exactement ce que la réponse au mail de l'équipe signale comme
  orphelins silencieux), puis les visuels orphelins, ingrédients,
  conditionnements, appellations, contextes de vente.

### Non vérifié, à ouvrir au bâti

- `diff-catalog-revisions.ts` : le diff d'une révision dont un SKU n'a plus
  de fiche.
- Les `deleteMany` imbriqués (`variants: { delete… }`) que la porte ne voit
  pas : à ajouter à sa recherche.
- La liste exacte des tables à `sku` par schéma (le test la lira dans le
  catalogue Postgres plutôt que de la recopier ici).

### Ce qu'on n'efface PAS, et pourquoi

Une fiche **vendue une fois** — une seule ligne de commande, un seul passage
au fournil — ne s'efface jamais : l'instantané de la commande se suffit,
mais l'histoire du référentiel (révisions, journal) et celle de la
plateforme (historique des prix, croissance) la citent, et l'effacer
reviendrait à nier une vente. Elle reste archivée, c'est son état final.
