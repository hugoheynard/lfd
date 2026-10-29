# Plan — montrer chaque déclinaison en vignette

> 📐 Écrit et bâti le 2026-10-29 (un seul lot, non commité). Demande de Hugo
> du jour : une option par fiche, « Montrer chaque déclinaison en vignette » ;
> cochée, chaque déclinaison vivante a sa vignette au rayon ; décochée, seule la
> déclinaison par défaut, comme avant. « En comportement de base, on va affiner
> après ce déploiement » : **cochée par défaut**, fiches neuves comme existantes
> (pré-release, CLAUDE.md §0).

## 1. Ce qui existe (ouvert le 2026-10-29)

- La vitrine ne compose que l'article par défaut : `shopCatalogueOf` saute
  `!item.isDefault` (`apps/lfd-api/src/b2b/catalog/application/shop-catalogue-view.ts`),
  et ses quatre décorations (prix au kilo, limites, langue, tarification) se
  réindexent toutes par SKU **produit** via l'article par défaut.
- `ShopItemView.sku` est le SKU **produit** (`packages/contracts/src/shop-catalogue.ts`).
  Le panier, le devis et `POST /orders` le renvoient tel quel ; la boutique
  (`apps/lfc-ecommerce-frontend`) ne fait que le recopier — fiche
  (`PieceRequest.open(sku)`, `/boutique/<slug>/<sku>`), panier, devis : **le
  SKU est opaque pour le front**, aucun code n'y suppose sa forme.
- Le serveur résout ce SKU par `CatalogReader.findDefaultByProductSku` /
  `listDefaultsByProductSkus` (`prisma-catalog.reader.ts`) — `productSku` +
  `isDefault`. Tout le chemin de commande en dépend : prix
  (`CatalogBackedProductCatalog`), opérations datées (`SaleOperations`), vente
  au poids (`ArticleSaleUnits`), rayon d'atelier
  (`CatalogWorkshopShelvesReader`), rangement de livraison
  (`PrismaOrderLineClassificationReader`, en Prisma direct).
- `catalog_items.name` est le nom de la **déclinaison** (`catalog-fact-mapping.ts`) ;
  le nom de la fiche voyage dans le fait (`product.name`) mais n'est rangé que
  dans `catalog_entries`.
- Une déclinaison archivée (`is_discontinued`) n'est pas émise
  (`projectProductFact`) : le commerce la retire (`withdrawn_at`, `STILL_SOLD`).
  « Vivante » = présente dans `listSellable`.
- Le fil : la fiche voyage par le fait `pim.catalog_product_changed`, dont la
  forme reprend `syncProductSchema` (`@lfd/catalog-sync`, v15).
- Visuels : portés par la **fiche** (`product.image`, `product.thumbnail`),
  recopiés sur chaque article ; il n'existe pas de visuel par déclinaison.
- `documentation/catalogue/plan-vendre-le-variant.md` (2026-09-13, non bâti)
  traite la question voisine — vendre la déclinaison À LA PLACE du produit —
  et nomme des murs qui s'appliquent ici (§4).

## 2. Décisions

| #   | Question                                    | Décision                                                                                                                                                                                                                                                                                                                                                                          |
| --- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1  | Où vit l'option                             | `pim.product.variants_as_tiles BOOLEAN NOT NULL DEFAULT true`. Méthode `Product.showVariantsAsTiles(bool)`, commande colocalisée `set-product-variants-as-tiles.ts`, route `PUT /pim/catalogue/products/:id/variants-as-tiles`, fait `product.variants_as_tiles_changed`.                                                                                                         |
| V2  | Le fil                                      | **v16** : `variantsAsTiles` sur `syncProductSchema`. Le fait le lit `true` quand il est absent (fait d'avant), ce que vaut la colonne.                                                                                                                                                                                                                                            |
| V3  | La projection                               | Deux colonnes de fiche descendues sur chaque article, comme `requires_cold` : `catalog_items.variants_as_tiles BOOLEAN NOT NULL DEFAULT true` et `catalog_items.product_name TEXT NULL` (`NULL` = reçu avant ce lot).                                                                                                                                                             |
| V4  | Le SKU d'une vignette — **le SKU de vente** | Le défaut garde le SKU **produit** (rien ne change pour l'existant, ni pour les commandes passées) ; une autre déclinaison se vend sous **son propre SKU** (`VIE-001-2`). Une seule fonction le dit : `shopSkuOf(item)`. Le lecteur résout les deux formes ; une déclinaison non défaut ne se résout que si sa fiche a l'option cochée — la caisse vend ce que la vitrine montre. |
| V5  | Le nom d'une vignette de déclinaison        | « nom de la fiche — nom de la déclinaison », composé **au lecteur** (`catalogItemDisplayName`) : la vitrine, le devis et la ligne de commande portent donc le même nom. Le défaut garde son nom d'aujourd'hui. Traduit : la fiche en français (le fait ne porte pas ses traductions), la déclinaison traduite.                                                                    |
| V6  | Prix, minimum, prix au kilo, unité, limites | Ceux de la déclinaison — ils sont déjà sur sa ligne `catalog_items`. Les visuels sont ceux de la fiche.                                                                                                                                                                                                                                                                           |
| V7  | La boutique                                 | Rien à changer : le SKU y est opaque. Le contrat `ShopItemView.sku` change de définition (« le SKU de vente »), sans changer de forme.                                                                                                                                                                                                                                            |

## 3. Ce qui est bâti

- PIM : colonne, agrégat, commande, route, fait de journal (contrat, phrase du
  back-office, `content-facts.ts`, `attribution.ts`), émission.
- Fil v16, projection `catalog_items`, lecteur à SKU de vente, vitrine.
- Back-office : la case « Montrer chaque déclinaison en vignette » dans la carte
  Audience de la fiche, enregistrée tout de suite.

### Après le déploiement — réémettre le catalogue

`catalog_items.product_name` reste `NULL` sur chaque article tant que sa fiche
n'a pas été réémise au fil v16. Tant qu'il manque, la vignette d'une
déclinaison porte **le nom de la déclinaison seul** (`shopItemName`, testé) —
jamais « null — 220 g » ; l'option, elle, vaut déjà `true` par la colonne.

Le geste existe : **Catalogue publié → « Tout réémettre »** au back-office
(`reemission-panel`), soit `POST /pim/reemit` avec `{}` (droit
`pim_channels`), qui réémet chaque fiche dans sa transaction
(`B2bCatalogReemission.everything`). Le suivi se lit sur
`GET /pim/reemit/latest`.

## 4. 🔴 Ce que ce lot ne tranche pas — à Hugo

Ce lot fait vendre une déclinaison non défaut sous son SKU. Trois murs que
`plan-vendre-le-variant.md` (§5 bis, §10) avait nommés s'appliquent, et aucun
n'est levé ici :

1. **Les décisions tarifaires visent le SKU produit.** Mercuriale, plancher,
   palier, promotion posés sur `VIE-001` ne s'appliquent **pas** à `VIE-001-2`
   (le contexte de prix prend le SKU reçu). Les décisions de famille et
   globales, elles, s'appliquent. C'est le sens sûr (une mercuriale
   « remplace à 2,10 € » sur un carton de dix serait pire), mais c'est une
   décision d'argent : la question n°2 de ce plan-là reste ouverte.
2. **La lecture datée du prix est indexée par produit**
   (`PrismaCanonicalPriceHistoryReader`, `distinct: ["productSku"]`). Un prix
   rejoué à une date passée refuse une déclinaison (`NoCanonicalPriceAtError`, 400) au lieu de la tarifer. Rien ne se facture faux : la question échoue.
3. **Le nom.** Hugo avait décidé le 2026-09-13 que « le nom d'une déclinaison
   est un nom INTERNE, il ne devient jamais le nom de boutique ». V5 l'y fait
   entrer, en suffixe. À confirmer ou remplacer.

Hors de ces trois points, le comportement des fiches à une seule déclinaison
est inchangé.

## 5. Reporté à un second temps (Hugo, 2026-10-29)

Hugo, le 2026-10-29 : « je voudrais qu'on déploie ce qu'on a et que tu notes
ces questions pour un second temps ». Le lot part donc en production avec les
réponses PAR DÉFAUT du § 4, et ces questions restent ouvertes :

1. **Les tarifs posés sur le produit** (mercuriale, plancher, palier, promotion
   sur `VIE-001`) valent-ils pour ses déclinaisons montrées en vignette
   (`VIE-001-2`) ? Aujourd'hui : non — un client au prix négocié paie la
   déclinaison au tarif normal. Question d'argent : `vitruve` avant de bâtir.
2. **Le prix à une date passée** d'une déclinaison est refusé (400). Et défaut
   probable antérieur : `PrismaCanonicalPriceHistoryReader` garde une ligne par
   `productSku`, donc le prix rejoué d'une fiche à plusieurs déclinaisons peut
   être celui d'une autre déclinaison. À vérifier puis corriger.
3. **Le nom d'une déclinaison devient public** — ✅ tranché le 2026-10-29 au
   soir : la vignette porte **le nom de la déclinaison seul** (Hugo, devant
   « Ancolie framboise — Ancolie framboise part »). Reste : il n'est pas
   traduit hors de ce que la déclinaison porte.
4. **Le bon de commande pro** (`ProductCatalogReader.all()`,
   `catalog-sellable-articles.reader.ts`) ne propose que la déclinaison par
   défaut.
5. **Le colisage et la livraison** (contenances des bacs, `requiresCold`) ne
   vérifient pas une ligne vendue sous le SKU d'une déclinaison.

**Après le déploiement** : lancer « Tout réémettre » (Catalogue publié), sans
quoi les vignettes affichent le nom de la déclinaison seul.

### Pistes de Hugo, à reprendre à froid (2026-10-29 au soir)

Notées telles quelles, **rien n'est décidé** (« c'est trop confus pour le
moment ») :

- une déclinaison devrait avoir une **identité autonome**, traduisible comme
  celle de la fiche ; le nom saisi à la création d'une déclinaison en
  deviendrait le nom **français** (le stockage le permet déjà : `name` est un
  `jsonb` `{ fr: … }`) ;
- le **pro** devrait voir les déclinaisons en vignette comme le particulier,
  quand elles sont dans son audience — lié à la question 1 (tarifs posés sur
  le produit), donc plan et `vitruve` avant de bâtir.
