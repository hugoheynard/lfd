# La carte « Tarif & TVA » — afficher le prix au kilo, et des blocs nommés

> Hugo, 2026-10-29. Bâti le même jour, sans validation intermédiaire (mandat :
> finir sans questions). Les choix faits à sa place sont au § 4, pour le point
> final. Prolonge [`plan-prix-au-kilo.md`](plan-prix-au-kilo.md).

## 1. Ce qui a été ouvert (2026-10-29)

- `pim/catalogue/product/domain/entities/variant.ts`, `product.ts` : les prix
  au kilo vivent dans l'instantané de la déclinaison, mutés par `price()` ; le
  tarif d'une déclinaison alignée est résolu par `resolvedSnapshot`.
- `update-variant-pricing.ts` : le fait `product.pricing_saved` trace un
  `changes` calculé sur `pricingOf` ; son schéma est dans
  `packages/contracts/src/journal-facts/referential-catalogue.ts`
  (`pricingChanges`, mode strict : une clé inconnue est refusée).
- `pim/channels/b2b-platform/products/projection.ts` : la projection recopie
  les deux prix au kilo vers le fil ; `packages/catalog-sync/src/snapshot.ts`
  les déclare déjà `nullable()`.
- Côté commerce, le seul lecteur des prix au kilo du miroir est la vitrine
  (`shop-catalogue-price-per-kg.ts`, via `CatalogPricePerKgReader`) ;
  `vitrine-item.ts` les ignore (`void`). Le catalogue pro ne les lit pas.
- La boutique (`product-tile`, `product-sheet`, `home-featured`,
  `per-kilo-hint`) ne dit rien quand le prix au kilo vaut `null` — couvert par
  leurs specs existantes.
- Le front : `pricing-form.*`, `product-form-store.ts` (brouillon,
  ligne de base, restauration par position), `section-alignment` (la case
  « aligner » rendue sous l'en-tête de **toutes** les cartes, par la page).

## 2. La case « Afficher le prix au kilo en boutique »

- **Colonne** `pim.product_variant.price_per_kg_shown BOOLEAN NOT NULL DEFAULT
true` (migration `20261029070000_afficher_le_prix_au_kilo`, additive,
  `lock_timeout 5s`, défaut constant : pas de réécriture). Tout l'existant
  reste affiché.
- **Domaine** : `VariantSnapshot.pricePerKgShown`, mutée par `price()` (absent
  = inchangé), résolue avec le tarif du défaut quand `pricingFollowsDefault`,
  reprise à la promotion en défaut.
- **Commande** : `pricePerKgShown?` dans `UpdateVariantPricingPayload` ; elle
  part avec « Tout enregistrer ». Elle entre dans `changes` du fait
  `product.pricing_saved` (clé ajoutée au schéma, optionnelle comme les autres).
- **Fil — pas de nouvelle version.** Décochée, la projection émet `null` pour
  les deux prix au kilo : c'est ce que le fil v-courant dit déjà d'un kilo non
  saisi, et le seul lecteur au commerce est la vitrine. Le commerce n'est pas
  touché : il range `null` et sert `null` dans `ShopItemView`.
- **Révision** : `pricePerKgShown: false` entre dans l'article de révision,
  **absent quand cochée** (même règle que le prix pro : les empreintes de
  l'existant ne bougent pas).

## 3. La carte en blocs nommés

Unité de vente · Prix · Prix au kilo (à la pièce) **ou** Vente au poids (au
poids) · TVA. Chaque bloc est une `section.block` titrée par
`fold-element-title variant="eyebrow"` ; espacement par `gap` ; la colonne
des prix et le bloc TVA passent l'un sous l'autre par `flex-wrap`. Comportement
inchangé : la colonne des prix se grise sous l'alignement (`.stack.is-inherited`,
la nouvelle case comprise), verrous de l'unité, refus du serveur dans le bloc
« Unité de vente », enregistrement par l'en-tête de section.

## 4. Choix faits à la place de Hugo

1. **La case « suit le tarif du défaut » reste sous l'en-tête de la carte**,
   pas dans le bloc « Prix ». La page la rend au même endroit pour toutes les
   cartes, et ce choix y est écrit (`product-form-page.html`) ; la déplacer
   pour une seule carte le défait. Le bloc « Prix » dit seulement, quand
   l'alignement est coché, « Suit le tarif de la déclinaison par défaut ».
2. **Décocher masque le kilo dans les DEUX audiences** de la boutique (public
   et pro) : la vitrine sert les deux montants aux deux, c'est l'écran qui
   choisit l'assiette.
3. **Au poids, la case n'est pas montrée** : le bloc « Prix au kilo » n'y existe
   pas (le prix EST au kilo), et la case ne touche jamais au prix de vente.
   Une valeur décochée posée à la pièce reste en base et vaut si l'on revient
   à la pièce.
4. **Nom** : `pricePerKgShown` / `price_per_kg_shown`.
5. Le libellé du titre « Unité de vente » remplace l'ancienne étiquette de
   champ du même nom (sinon il était dit deux fois) ; le sélecteur garde son
   `ariaLabel`.

## 5. Reste à faire

- Rien dans le périmètre. Le miroir du commerce ne portera la case qu'au
  prochain envoi de chaque fiche décochée (ou « Tout réémettre ») — sans effet
  pour l'existant, toutes cochées.
