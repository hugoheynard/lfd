# Plan — les articles de réassort seulement

> **Plan**, ouvert le 2026-11-24. Lot A bâti le même jour ; B et C restent. Décision de Hugo du même jour : **une
> audience « réassort » dédiée**, plutôt qu'un drapeau « hors vitrine » sur un
> article public. Entrée du dossier : [`README.md`](README.md).

## 1. En très simple

Certains produits ne se vendent à personne en ligne, mais les boutiques doivent
pouvoir les commander au fournil : le **cookie formule** (non emballé), qui sert
aux formules de la boutique.

Aujourd'hui c'est impossible : le catalogue du réassort **est** la vitrine
publique. Un produit absent de la vitrine est absent du réassort.

On ajoute une quatrième réponse à la question « à qui la fiche vend-elle ? » :

| Audience              | Vitrine publique | Catalogue pro | Réassort des boutiques |
| --------------------- | :--------------: | :-----------: | :--------------------: |
| `public`              |        ✓         |               |           ✓            |
| `pro`                 |                  |       ✓       |                        |
| `both`                |        ✓         |       ✓       |           ✓            |
| **`resupply`** (neuf) |                  |               |         **✓**          |

Aucune lecture de la vitrine ni du catalogue pro ne demande `resupply` : ces
articles leur sont invisibles **par construction**, sans filtre à ne pas oublier.

```mermaid
flowchart LR
  F["Fiche au référentiel<br/>audience = resupply"] -->|"fait de la fiche"| C["Copie du catalogue<br/>au commerce"]
  C -->|"servedTo(public) = non<br/>servedTo(pro) = non"| V["Vitrine et catalogue pro<br/>ne le voient pas"]
  C -->|"lecteur « réassort »"| R["ResupplyCatalogue<br/>le comptoir le commande"]
```

## 2. Ce qui existe (ouvert le 2026-11-24)

- `ResupplyCatalogue` est lu par `CatalogResupplyCatalogue`
  (`apps/lfd-api/src/lafoliecoffee/resupply/infrastructure/catalog-resupply-catalogue.ts`) :
  `listSellable(staffViewer("public"))` filtré par `isShownAsTile`, et
  `findByShopSku` pour valider. Aucun prix ne traverse.
- L'audience d'une fiche vit au référentiel : `pim.product.audience`
  (nullable, hérite de `category.audience`, défaut `both`), tenue par les CHECK
  `product_audience_check` et `category_audience_check`
  (`prisma/migrations/20261015100000_l_audience_du_catalogue/migration.sql:17,21`),
  valeurs `pro | public | both`.
- Le type `Audience` du référentiel **est** `OperationAudience`
  (`src/pim/catalogue/shared/domain/value-objects/audience.ts:13`, de
  `@lfd/pim-contracts`) : fiche et opérations datées partagent la même liste.
- Côté commerce, la copie porte `catalog_items.audience` et
  `catalog_categories.audience` (`prisma/schema/public/catalog.prisma:127,433`),
  lues par `catalogAudienceOf` (`lafoliecoffee/catalog/domain/served-to.ts:100`),
  puis jugées par `servedTo` — **la** règle unique du masquage.
- `ShopAudience = "pro" | "public"` (`catalog/domain/ports/catalog.reader.ts:205`).
- `listSellable` du rayon refuse un article sans taux de TVA
  (`snapshot-catalog.reader.ts:43`).

## 3. 🔴 Le piège qui ordonne les lots

`catalogAudienceOf` lit **une valeur inconnue comme `null`, donc `both`** — vendue
à tout le monde (`served-to.ts`, plusieurs lecteurs y ajoutent `?? "both"`). Si
le référentiel émettait `resupply` avant que le commerce le connaisse, le cookie
formule partirait **en vitrine et chez les pros**.

D'où l'ordre : **le commerce apprend `resupply` d'abord** (lot A, sans que rien
ne puisse encore l'écrire), le référentiel ne l'ouvre qu'ensuite (lot B).

L'ordre est tenu **par le compilateur**, pas par la discipline : le récepteur
du fait de fiche passe l'audience typée du référentiel à
`CatalogProductFactsProjection.putOnSale(…, audience: CatalogAudience)`. Un
référentiel qui élargirait son `Audience` sans que `CatalogAudience` le
connaisse ne compilerait plus.

Décidé en bâtissant le lot A : **pas** de lecture « inconnue = servie à
personne ». Il aurait fallu une valeur sentinelle visible de toutes les vues
du staff, pour une défense que le typage donne déjà.

## 4. Les lots

### A — le commerce comprend `resupply` ✅ bâti le 2026-11-24

- `CatalogAudience` (`lafoliecoffee/catalog/domain/served-to.ts`) gagne
  `resupply` ; `servedTo` le refuse aux pros comme au public, `servedToAnyone`
  aussi.
- `servedToResupply(item)` : servi au public, **ou** `resupply` non masqué
  (ni aux pros ni au public), ni réservé ni sur mesure. Aucun drapeau de
  validation : la fiche n'est montrée à aucun client. `awaitsReview` ne pose
  déjà aucun des deux drapeaux sur une ligne `resupply` (son audience ne
  contient aucun acheteur).
- `SoldAudience` = `CatalogAudience` sans `resupply` : l'audience d'un article
  **servi à un acheteur** (`ResolvedCatalogItem.audience`). `soldAudienceOf`
  lève `ResupplyOnlySoldError` (500) si une lecture d'acheteur en rendait un —
  ce qui ne peut arriver qu'en contournant `servedTo`.
- La lecture nommée du catalogue, `ResupplyOnlyArticlesReader`
  (`catalog/domain/ports/`), implémentée par `PrismaResupplyOnlyArticlesReader`
  sur la base (pas l'instantané : ces articles ne sont ni au devis ni au rayon) ;
  inscrite à `catalogue-door` et à `withdrawn-filter`, elle porte `STILL_SOLD`.
- `CatalogResupplyCatalogue` lit la vitrine **et** cette lecture ; chaque
  article réservé au réassort se range après le dernier article public de sa
  famille (`withinFamilies`), ou à la fin.
- Le contrat staff `CatalogItemAudience` gagne `resupply` (le back-office
  l'affiche « Réassort des boutiques ») ; `ShopItemAudience` ne bouge pas.
- Aucune migration : `catalog_items.audience` et `catalog_categories.audience`
  n'ont pas de `CHECK` (vérifié le 2026-11-24 dans les migrations).
- Tests : `served-to.spec.ts`, `catalog-resupply-catalogue.spec.ts`.

⚠️ Vu en bâtissant, à reprendre au lot B : le fournil marque `sellable` un
article servi à au moins une clientèle (`catalog-production-articles.reader.ts`) ;
un article `resupply` y sera dit « non vendable ». Il se fabrique quand même
(le fournil range des lignes déjà commandées) ; seul l'indicateur de la page
Postes est en cause.

### B — le référentiel ouvre `resupply`

- `sellable` du fournil : compter aussi `servedToResupply` (cf. lot A).

- **Séparer** `Audience` (fiche, famille) d'`OperationAudience` : une opération
  datée ne vise pas le réassort. Liste propre aux fiches dans
  `@lfd/pim-contracts`, sur-ensemble de celle des opérations.
- Migration additive : `product_audience_check` et `category_audience_check`
  admettent `resupply`.
- Le contrat du fait de fiche et du fait de famille (`packages/contracts`)
  admet `resupply`.
- `servedAudiences` (juge « chaque clientèle servie peut-elle être
  facturée ? ») rend une liste vide pour `resupply` : aucun prix n'est exigé.
- e2e : une fiche `resupply` traverse le fil, n'apparaît ni au rayon public ni
  au catalogue pro, n'est pas commandable (`isOrderable`), et apparaît au
  réassort du comptoir.

### C — l'écran de la fiche et de la famille

- Le sélecteur d'audience du back-office (référentiel) gagne « Réassort des
  boutiques seulement », avec une phrase qui dit ce que ça fait (ni en ligne,
  ni aux pros).
- La liste des articles du référentiel montre la pastille.

## 5. Points ouverts — tranchés au bâti, écrits ici

- **Le taux de TVA.** Le rayon refuse un article sans taux ; le réassort lit
  la même copie. La famille du cookie formule a un taux : rien à faire. Si un
  jour une famille `resupply` n'en avait pas, le réassort devra s'en passer —
  décidé au lot A, pas avant.
- **Le fournil** lit les lignes de réassort par leur libellé figé (doc
  `commander.md` § 1) : rien ne change pour lui. À confirmer au lot A en
  ouvrant `DayResupplies`.
- **`vitruve`** : ce plan ne touche ni à l'argent, ni à une migration de
  données (deux CHECK élargis), ni au mur tenant. Pas de contradicteur ; les
  affirmations du § 2 ont été ouvertes.
