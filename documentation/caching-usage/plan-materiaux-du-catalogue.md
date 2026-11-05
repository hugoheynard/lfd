# Plan — les matériaux du catalogue, chargés une fois

> 📏 **M0 mesuré le 2026-11-05** (`apps/lfd-api/test/catalogue-reads.e2e-spec.ts`,
> relevé au § 1). Depuis l'écriture du plan, le rayon est gardé par l'objet
> `ProShelves` (le recalcul n'a lieu qu'en cas d'absence) alors que le devis
> relit le catalogue à chaque changement de panier : **ordre proposé M2
> (devis) avant M1 (rayon), à confirmer par `vitruve` et Hugo.**

> 📝 **Plan du 2026-11-04, rien n'est bâti.** Demande de Hugo : « arriver par
> construction à un seul appel pour tout ce qui concerne le catalogue, que la
> taille de cet appel grandisse, mais le prix au kilo et les opérations datées
> en font partie d'office ». Touche le devis et la commande (l'argent) :
> contredit par `vitruve` avant Hugo. Partie 1 : comprendre. Partie 2 : le
> plan.

# Partie 1 — Comprendre

## Ce qui se passe aujourd'hui

Pour construire un rayon, plusieurs lecteurs vont chacun chercher leur morceau
du catalogue en base. La table des articles est lue **trois fois** pour une
seule visite : les articles en vente, puis les articles réservés aux
opérations, puis les prix au kilo — alors que le prix au kilo est **une
colonne** de cette même table. Le devis et l'estimation de la saisie refont le
même genre de lectures, chacun à sa façon.

Chaque lecture est une opération facturée par la base de production, et chaque
lecteur de plus est un endroit qui peut diverger des autres.

## Ce qu'on veut

**Un seul chargement du catalogue par requête**, par construction : une porte
unique qui rend tout ce dont le rayon, le devis et l'estimation ont besoin —
articles avec leur prix au kilo, familles, opérations datées et leurs articles,
heures limites, réservations. Le chargement peut grossir ; il ne se répète pas.

```mermaid
flowchart LR
  R["Rayon, devis,<br/>estimation"] --> P["La porte du catalogue"]
  P --> Q{"déjà chargé<br/>pour cette requête ?"}
  Q -->|"oui"| U["même chargement"]
  Q -->|"non"| M{"en mémoire de l'API<br/>et à jour ?"}
  M -->|"oui"| U
  M -->|"non"| B[("Base<br/>une lecture par table,<br/>en parallèle")]
  B --> U
```

Par-dessus, une **mémoire de l'API** garde ce chargement entre deux requêtes,
et l'oublie au signal `ShelfChanges` (le même que le cache des rayons) : tant
que rien n'a changé, le catalogue ne se relit pas du tout.

**La taille** : 161 articles font 121 Ko bruts, 11 Ko compressés (mesuré en
production le 2026-11-04). À 500 articles, ~375 Ko en mémoire : léger. Découper
par famille ne se justifierait qu'à plusieurs milliers d'articles.

# Partie 2 — Le plan

## 1. Ce qui est lu aujourd'hui (relevé dans le code le 2026-11-04)

Le rayon (`ShopCataloguePricing.pricedFor`,
`apps/lfd-api/src/b2b/catalog/application/shop-catalogue-pricing.service.ts`) :

| Lecteur (port)                               | Adaptateur                                         | Ce qu'il lit                                                                                                        |
| -------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `CatalogReader.listSellable`                 | `prisma-catalog.reader.ts`                         | `catalogItem.findMany` (avec dérogations et réservations), puis `catalogCategory.findMany` (la lignée des familles) |
| `CatalogOperationsReader.operationOnlySkus`  | `operationOnlySkusOf` (`prisma-catalog.reader.ts`) | `catalogItem.findMany` (les SKU réservés aux opérations)                                                            |
| `CatalogOperationsReader.sellableOperations` | `prisma-catalog-operations.reader.ts`              | `catalogOperation.findMany` (avec leurs articles)                                                                   |
| `ShopOrderCutoffsReader.list`                | `OrderCutoffsInForce` (bloc `order-cutoffs`)       | les heures limites                                                                                                  |
| `CatalogPricePerKgReader.bySkus`             | `prisma-catalog-price-per-kg.reader.ts`            | `catalogItem.findMany` — **les colonnes du kilo, relues**                                                           |
| `CatalogViewers.forCompany`                  | `prisma-served-company.reader.ts`                  | la société servie                                                                                                   |
| `Pricer.load`                                | `PricingMaterialsLoader` (+ cache)                 | règles de prix, estampille                                                                                          |

Mesuré à chaud sur le rayon public : 6 opérations, dont `CatalogItem` **trois
fois**, `CatalogOperation`, `OrderCutoff`, `PricingEvent`.

### Le relevé M0 (mesuré le 2026-11-05)

Mesuré par `apps/lfd-api/test/catalogue-reads.e2e-spec.ts` : la sonde de
comptage (`SchemaOpsCounter`) y est remplacée par une sous-classe qui retient
aussi le **modèle** de chaque appel ORM (même point d'appel, même unité). Scène
du golden master, panier de deux lignes ; le rayon calculé par l'API, sans
`ProShelves` (absent en e2e). L'origine de chaque appel a été identifiée par
la forme de ses arguments (relevé ponctuel, non commité).

Les formes de lecture de `catalog_items` rencontrées :

| Code | Lecture                                                                                         | Adaptateur                                         |
| ---- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| A    | `listSellable` — tout le catalogue en vente, avec famille, dérogation, réservations (`include`) | `PrismaCatalogReader.listSellable`                 |
| B    | `listByShopSkus` — les lignes du panier, même `include`                                         | `PrismaCatalogReader.listByShopSkus`               |
| C    | le classement des lignes (produit, famille parente, sur mesure)                                 | `prisma-order-line-classification.reader.ts`       |
| D    | les SKU réservés aux opérations (`operationOnly`)                                               | `operationOnlySkusOf` (`prisma-catalog.reader.ts`) |
| E    | les colonnes du kilo, pour **tous** les SKU du rayon (un `IN` du catalogue entier)              | `prisma-catalog-price-per-kg.reader.ts`            |
| F    | la filiation (`detachedFromSku`)                                                                | `PrismaSaleReferenceLineageReader.parentsOf`       |

Et hors de `catalog_items` : `catalogOperation.findMany` (avec ses articles en
`include`) et `orderCutoff.findFirst` (l'heure limite générale,
`prisma-stored-order-cutoff.reader.ts`).

| Chemin                                       | `CatalogItem`     | `CatalogOperation` | `OrderCutoff` | Catalogue / total des opérations, froid → chaud |
| -------------------------------------------- | ----------------- | ------------------ | ------------- | ----------------------------------------------- |
| rayon public (`GET /shop/catalogue`)         | 3 (A, D, E)       | 1                  | 1             | 5 / 11 → 5 / 6                                  |
| rayon pro de base (`?audience=pro`)          | 3 (A, D, E)       | 1                  | 1             | 5 / 11 → 5 / 6                                  |
| rayon d'un pro (`GET /shop/catalogue/mine`)  | 3 (A, D, E)       | 1                  | 1             | 5 / 19 → 5 / 13                                 |
| devis anonyme (`POST /shop/quote`)           | 3 (B, D, C)       | 0                  | 0             | 3 / 11 → 3 / 6                                  |
| devis pro (`POST /shop/quote/mine`)          | 4 (B ×2, D, C)    | 0                  | 1             | 5 / 20 → 5 / 15                                 |
| estimation (`POST /admin/orders/estimate`)   | 5 (B ×3, D, C)    | 0                  | 2             | 7 / 31 → 7 / 25                                 |
| passation pro (`POST /orders`), pour mémoire | 5 (B ×2, D, C, F) | 0                  | 1             | 6 / 75 → 6 / 67                                 |

**Froid = chaud** pour le catalogue : rien ne le garde en mémoire, seuls les
matériaux des prix (règles, planchers, barèmes, promotions) passent à zéro à
chaud. Les familles, dérogations, réservations et articles d'opération ne
coûtent **aucun** appel : ils voyagent en `include` de leur parent.
`CatalogCategory` vaut 0 ici parce que le corpus n'a que des familles à plat :
la lignée (`PrismaCatalogReader.lineage`) n'est lue que si une famille a un
parent — +1 par lecture A ou B dans ce cas, **non relevé**.

**Les doublons** (même table relue dans le même appel HTTP) :

- le rayon lit `catalog_items` trois fois — A, puis D (une colonne de A), puis
  E (deux colonnes de A, pour les SKU que A vient de rendre) ;
- le devis pro relit les lignes du panier (B ×2) ; l'estimation trois fois
  (B ×3), et l'heure limite générale deux fois ;
- la passation relit B deux fois ;
- partout, D (`operationOnly`) est une colonne que A ou B a déjà en main, et C
  (classement) relit les mêmes lignes que B sous une autre projection.

**Ce que `CatalogueMaterials` doit donc contenir** : les articles en vente avec
famille, dérogation et réservations (A — B en devient un filtre), les colonnes
du classement (C : produit, famille parente, sur mesure), le drapeau
`operationOnly` (D), les colonnes du kilo (E), la filiation (F, si la
passation entre un jour dans la porte — elle n'y entre pas d'après le § 2), la
lignée des familles, les opérations avec leurs articles, et l'heure limite
générale. Soit, d'après ce relevé, trois appels à froid (articles, opérations,
heure limite) au lieu de 3 à 7 selon le chemin, et zéro à chaud une fois M3
bâti.

**Ce qui est prouvé, et ce qui ne l'est pas** :

- **prouvé** (2026-11-05, base e2e locale, client compté) : un `findMany` avec
  `include` compte pour **un** appel dans la sonde (`$allOperations` ne voit
  que l'appel du client), et Prisma 7 sans `relationJoins` l'exécute en
  **plusieurs** instructions SQL — deux appels (`catalogItem` avec famille,
  dérogation, réservations ; `catalogOperation` avec ses articles) ont donné
  **6** instructions ;
- **affirmé, non prouvé ici** : que Prisma Postgres facture par appel du
  client et non par instruction SQL. C'est ce que disent le JSDoc de
  `SchemaOpsCounter` et la tarification publiée de Prisma ; seule la facture
  de production peut le confirmer.

## 2. La forme

- **Un port, `CatalogueMaterials`**, côté application du catalogue : `load()`
  rend un objet immuable — articles (avec prix au kilo, dérogations,
  réservations), familles (lignée), opérations datées et leurs articles, SKU
  réservés aux opérations, heures limites. Les lecteurs d'aujourd'hui deviennent
  des **vues** sur ces matériaux, sans base (fonctions pures sur l'objet).
- **Une lecture par table, en parallèle** : Prisma facture par appel du client,
  pas par requête SQL ; une lecture avec ses tables liées (`include`) compte
  pour une opération. Cible : articles + lignée + kilo en **un** appel, les
  opérations avec leurs articles en **un**, les heures limites en **un**.
- **Une fois par requête** : la porte garde le chargement pour la requête en
  cours (le contexte de requête, comme l'estampille des prix) — deux lecteurs du
  même rayon ou du même devis partagent le même.
- **En mémoire de l'API entre deux requêtes**, sur le modèle de
  `PricingMaterialsCache` : une seule lecture en cours par clé, oubli au signal
  `ShelfChanges` (après la validation), durée de vie courte en filet. Les
  tables sont celles que `lint:shelf-writes` tient déjà : aucune écriture ne
  peut oublier le signal.
- **Ce qui ne passe PAS par là** : la société et les droits (propres à
  l'appelant, relus en base à chaque requête — règle du dépôt), et la passation
  d'une commande, qui relit la base pour ce qu'elle **écrit** (elle fait foi).
- **Le mur entre audiences** : les matériaux sont le catalogue **entier** ; ce
  que chaque lecteur a le droit de voir (réservations, audience) reste décidé
  par les vues existantes (`CatalogViewer`), jamais par le chargement.

## 3. Par construction

- **Une porte de CI** (`lint:catalogue-door`, sur le modèle de
  `lint:price-door`) : sur le chemin du rayon, du devis et de l'estimation,
  aucun code ne lit `catalogItem`, `catalogCategory`, `catalogOperation`,
  `catalogOperationItem` ni les heures limites en direct ; seul l'adaptateur
  de `CatalogueMaterials` le fait. Les écrans d'administration du catalogue
  gardent leurs lecteurs (ils lisent pour écrire).
- **Le budget** (`test/pricing-budget.e2e-spec.ts`) gagne le rayon, à froid et
  à chaud : `CatalogItem` lu **une** fois à froid, **zéro** à chaud.

## 4. Plusieurs instances

La mémoire est par instance. Comme pour les prix, il faut qu'une écriture sur
une instance invalide les autres : soit une **estampille** relue une fois par
requête (le modèle de `pricing_events`, une opération par requête), soit la
purge en éventail par le Worker. **À trancher** ; aujourd'hui une seule
instance (`max_instances: 1`).

## 5. Les lots

| Lot | Contenu                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0  | la mesure : la liste exacte des lectures du catalogue sur le rayon, le devis anonyme et pro, l'estimation, par la sonde de comptage des modèles ; elle fixe le contenu de `CatalogueMaterials` |
| M1  | le port, l'adaptateur (une lecture par table, en parallèle), la mémoire par requête ; les lecteurs du rayon deviennent des vues ; le budget du rayon                                           |
| M2  | le devis et l'estimation passent par la même porte ; la porte de CI                                                                                                                            |
| M3  | la mémoire entre requêtes, vidée par `ShelfChanges`, et la réponse à « plusieurs instances »                                                                                                   |

## 6. Ce qui n'est pas vérifié

- ~~la liste des lectures du devis, de l'estimation et de la passation~~ —
  mesurée le 2026-11-05 (§ 1) ;
- ~~qu'une lecture avec `include` compte pour une opération dans
  `SchemaOpsCounter`~~ — prouvé le 2026-11-05 (§ 1) ; reste **affirmé** que
  Prisma Postgres facture de même ;
- la taille du catalogue entier en mémoire (estimée, pas mesurée) ;
- que les heures limites (bloc `order-cutoffs`) puissent entrer dans le même
  chargement sans qu'un bloc lise les tables d'un autre (`lint:prisma-model-ownership`).
