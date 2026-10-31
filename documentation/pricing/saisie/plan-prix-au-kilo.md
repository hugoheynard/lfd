# Plan — le prix au kilo, saisi à part

> 📝 Plan du 2026-10-28, doc-first. Demande de Hugo : « dans tarif et TVA d'une
> fiche produit on ajoute prix au kilo pro HT et prix au kilo public TTC, et
> qu'on l'ajoute sur les fiches ouvertes de produit ». Précisé le même jour :
>
> - **deux montants SAISIS**, « une autre info » — **pas de calcul
>   automatique** depuis le prix de la pièce et le poids ;
> - sur la fiche ouverte de la boutique, **chacun le sien** : un particulier lit
>   le prix au kilo public TTC, un pro le prix au kilo pro HT — comme le prix à
>   la pièce aujourd'hui.

## 1. Ce qui existe (relu le 2026-10-28)

| Maillon          | Aujourd'hui                                                                                                                                                                                                                                                                                                |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saisie           | Section « Tarif & TVA » (`product-form/form-sections/pricing/`) : prix public TTC (`priceEur`), prix pro HT en texte (`proPriceHtText`, cinq décimales). Le poids (`weightGrams`) se saisit ailleurs et part avec le tarif.                                                                                |
| Écriture         | `PUT …/variants/:id/pricing`, `updateVariantPricingPayloadSchema` (`packages/pim-contracts/src/product.ts`) → `UpdateVariantPricingCommand` (`update-variant-pricing.ts`) : `priceCents`, `weightGrams`, `proPriceHt?` (texte ; absent = inchangé, `null` = effacer), lu par le value object `ProPriceHt`. |
| Stockage PIM     | `pim.product_variant` : `price_cents`, `weight_grams`, `pro_price_millicents` (`prisma/schema/pim/product.prisma`).                                                                                                                                                                                        |
| Journal          | `product.pricing_*` : `pricingChanges()` (`packages/contracts/src/journal-facts/referential-catalogue.ts`) — `priceCents`, `weightGrams`, `proPriceMillicents`, chacune facultative pour qu'une ligne d'avant reste lisible.                                                                               |
| Vers le commerce | `projectVariant` (`pim/channels/b2b-platform/products/projection.ts`) rend un `SyncVariant` (`packages/catalog-sync/src/snapshot.ts`, `CATALOG_SNAPSHOT_VERSION = 12`) ; les faits (`catalog-facts.ts`) passent par la même fonction.                                                                      |
| Commerce         | `public.catalog_item` (`schema/public/catalog.prisma`) porte `weight_grams` ; `catalog-fact-mapping.ts`, `catalog-item-columns.ts`, `catalog-item-rows.ts`, `CatalogItem.weightGrams`.                                                                                                                     |
| Boutique         | `ShopItemView` (`packages/contracts/src/shop-catalogue.ts`) construit par `toItem` (`shop-catalogue-view.ts`) et repris par `ShopCataloguePricing` ; ne porte **pas** le poids. La fiche ouverte (`lfc-ecommerce-frontend/.../shop/product-sheet/`) dit le prix à la pièce, HT ou TTC selon `showsTtc()`.  |

## 2. Le modèle

Par **déclinaison** (le prix et le poids y sont déjà), deux montants
facultatifs, indépendants de tout autre :

| Champ                      | Unité         | Pourquoi cette unité                                                                                         |
| -------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------ |
| `proPricePerKgMillicents`  | millicentimes | Le prix pro HT se saisit à cinq décimales, en millicentimes ; le kilo pro suit la même saisie et le même VO. |
| `publicPricePerKgTtcCents` | centimes TTC  | Le prix public se saisit TTC au centime ; le kilo public aussi.                                              |

- 🔴 **Une donnée INFORMATIVE, et rien d'autre** (Hugo, 2026-10-28 : « pour
  l'instant on s'en sert uniquement comme donnée informative »). Elle ne
  traverse ni la résolution du prix, ni le panier, ni le devis, ni la facture,
  ni aucune règle (`PriceRule`, mercuriale, plancher) : elle est lue, jamais
  appliquée. Le jour où elle facturera, c'est un autre plan.
- **Aucun calcul**, ni à la saisie ni à l'affichage : ce qui est saisi est ce
  qui est lu. Un poids changé ne touche pas au prix au kilo.
- `null` = non saisi, et rien ne s'affiche. Ce n'est **pas** une condition
  d'activation ni de vente : une fiche sans prix au kilo reste vendable.
- Une déclinaison **alignée** sur le tarif de la déclinaison par défaut
  (`pricingFollowsDefault` côté serveur, `pricingAligned` à l'écran) hérite
  aussi de ses prix au kilo. Ce n'est **pas** gratuit : l'héritage est écrit
  champ par champ dans `product.ts` (l. 635-640) — les deux clés s'y ajoutent
  (K1).
- `> 0` en base, comme le poids : un prix au kilo à zéro n'a pas de sens, et
  s'afficherait « 0,00 € / kg ».

## 3. Lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Où                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| K0  | Migration additive PIM : `product_variant.pro_price_per_kg_millicents INT NULL`, `public_price_per_kg_ttc_cents INT NULL`, `CHECK (… > 0)`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | api               |
| K1  | Domaine et écriture. La déclinaison porte les deux montants (VO `ProPriceHt` réutilisé pour lire le texte pro ; centimes `> 0` pour le public). `UpdateVariantPricingInput` gagne `proPricePerKgHt?: string \| null` et `publicPricePerKgTtcCents?: number \| null` (absent = inchangé). **L'héritage** de `product.ts` (l. 635-640) et **`pricingOf()`** (`update-variant-pricing.ts`) gagnent les deux clés — sans quoi une saisie du seul kilo serait `untraced` et une alignée servirait ses propres valeurs. `pricingChanges()` gagne `proPricePerKgMillicents: millicents()` et `publicPricePerKgTtcCents: cents()`, chacune typée dans son unité ; `lint:journal-tracked` passe. La **révision** déclare les deux champs photographiés (`revision.ts` l. 109-120, `prisma-catalog-revision.source.ts` l. 67-72) : une publication qui ne change que le kilo est un écart, et se lit comme tel. La vue de la déclinaison les rend. | api, contrats     |
| K2  | Le fil passe en **v13** : `SyncVariant` gagne les deux champs **obligatoires et nullables** (le schéma du fil est strict, `snapshot.ts` l. 641 : un émetteur qui oublie un champ doit échouer) ; `storedCatalogSnapshotSchema` les tolère absents pour une version `< 13`. `projectVariant` les remplit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | api, catalog-sync |
| K3  | Commerce : migration additive `catalog_item.pro_price_per_kg_millicents`, `public_price_per_kg_ttc_cents` ; mapping des faits, colonnes, lignes, `CatalogItem`. 🔴 **Hors de `ResolvedCatalogItem`** : ce type nourrit la résolution, la vente et le réassort, et la promesse « informative » doit tenir par construction. La vue du rayon lit les deux montants par un **port à part**, à côté de la résolution, et les pose sur `ShopItemView` : **deux champs nommés par leur unité**, `proPricePerKgMillicents` et `publicPricePerKgTtcCents`, `null` si non saisis. Comme pour la pièce, **c'est l'écran qui choisit** (`showsTtc()`, `shop-price-basis.service.ts`) : le kilo se lit toujours dans l'assiette du prix juste au-dessus.                                                                                                                                                                                             | api, contrats     |
| K4  | Back-office : deux champs dans « Tarif & TVA », sous les prix qu'ils accompagnent (« Prix au kilo public TTC », « Prix au kilo pro HT »), grisés comme eux quand le tarif est aligné.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | back-office       |
| K5  | Boutique : sur la fiche ouverte, sous le prix à la pièce, « 12,40 € TTC / kg » (ou « HT ») quand le montant de l'assiette affichée est servi ; rien sinon — jamais l'autre assiette en repli.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | boutique          |

Hors de ce plan : la vignette de rayon, le flux XML de la vitrine, le bon et la
facture. Ils pourront lire `pricePerKg` ensuite ; rien ici ne les en empêche.

## 4. Ce qui reste à vérifier au bâti

- Que seul `catalog-facts.ts` appelle `projectVariant`, ou qu'un second chemin
  vers le commerce existe et doit aussi porter les deux champs.
- Que `lint:price-pipeline` et `lint:money-units` ne voient dans le port de K3
  ni un nouveau producteur de prix, ni une unité ambiguë.

## 5. Après le déploiement

Une fiche déjà publiée n'envoie ses prix au kilo qu'à son prochain geste.
Rien ne casse en attendant (`null` partout, rien ne s'affiche) ; « Tout
réémettre » (Vue d'ensemble du référentiel) les envoie d'un coup, sur ordre de
Hugo.

## 6. Contradiction

vitruve, 2026-10-28 : trois BLOQUANTS levés ci-dessus — le fil passe en v13
(au lieu de champs facultatifs sans version), l'héritage et le diff du journal
nommés dans K1, deux champs nommés par leur unité et l'écran qui choisit (au
lieu d'un `amount` sans unité choisi par le serveur). SÉRIEUX pris : hors de
`ResolvedCatalogItem`, révision déclarée, journal typé, réémission dite.
