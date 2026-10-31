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

## 2. Deux cases : « Afficher aux particuliers », « Afficher aux pros »

> Hugo, 2026-10-29, après la mise en production de la case unique (commit
> `8058a3f0d`) : « j'aurais préféré pouvoir choisir l'affichage par
> audience ». La case unique est remplacée par deux cases, sous les deux prix
> au kilo, cochées par défaut. Bâti le même jour (non commité à l'écriture).

- **Colonnes** `pim.product_variant.price_per_kg_shown_public` et
  `price_per_kg_shown_pro`, `BOOLEAN NOT NULL DEFAULT true` (migration
  `20261029160000_prix_au_kilo_par_audience`, additive, `lock_timeout 5s`).
  **Migration de données, petite** : chacune reprend `price_per_kg_shown`
  (`UPDATE … WHERE price_per_kg_shown = false`) — une fiche décochée reste
  masquée dans les deux audiences.
- **L'ancienne colonne `price_per_kg_shown`** (`20261029070000_afficher_le_prix_au_kilo`)
  **reste en base**, ni lue ni écrite (commentaire daté dans `product.prisma`).
  La retirer est une migration à part, sur ordre de Hugo.
- **Domaine** : `VariantSnapshot.pricePerKgShownPublic` / `pricePerKgShownPro`,
  mutées par `price()` (absente = inchangée), résolues avec le tarif du défaut
  quand `pricingFollowsDefault`, reprises à la promotion en défaut.
- **Commande** : `pricePerKgShownPublic?` / `pricePerKgShownPro?` dans
  `UpdateVariantPricingPayload` (`@lfd/pim-contracts`) ; l'ancien champ
  `pricePerKgShown` n'est plus accepté (pré-release, seul le back-office
  l'envoyait). Elles entrent dans `changes` du fait `product.pricing_saved`
  sous leurs deux clés ; la clé `pricePerKgShown` reste au schéma du fait,
  pour que les lignes écrites le 2026-10-29 restent lisibles.
- **Fil — pas de nouvelle version.** La projection émet `null` pour le prix
  au kilo public TTC quand « particuliers » est décochée, et pour le pro HT
  quand « pros » l'est — chacun selon SA case. Le commerce n'est pas touché.
- **Révision** : `pricePerKgShownPublic: false` / `pricePerKgShownPro: false`,
  **absentes quand cochées**. Une révision antérieure portant
  `pricePerKgShown: false` garde son libellé dans le diff ; l'empreinte d'un
  article décoché sous la case unique change au prochain calcul (clé renommée).
- **Front** : deux `fold-checkbox` dans le bloc « Prix au kilo » ; libellés du
  journal et du diff de révision pour les deux clés (l'ancienne gardée).

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
2. ~~**Décocher masque le kilo dans les DEUX audiences**~~ — remplacé le
   2026-10-29 par Hugo : une case par audience (§ 2). Chaque case retient SON
   montant ; la vitrine sert toujours les deux montants restants aux deux
   audiences, c'est l'écran qui choisit l'assiette.
3. **Au poids, les cases ne sont pas montrées** : le bloc « Prix au kilo » n'y existe
   pas (le prix EST au kilo), et la case ne touche jamais au prix de vente.
   Une valeur décochée posée à la pièce reste en base et vaut si l'on revient
   à la pièce.
4. **Nom** : `pricePerKgShownPublic` / `pricePerKgShownPro`
   (`price_per_kg_shown_public` / `_pro`) ; `price_per_kg_shown` est morte.
5. Le libellé du titre « Unité de vente » remplace l'ancienne étiquette de
   champ du même nom (sinon il était dit deux fois) ; le sélecteur garde son
   `ariaLabel`.

## 5. Reste à faire

- Le miroir du commerce ne portera une case changée qu'au prochain envoi de
  la fiche (ou « Tout réémettre ») ; la reprise de la migration ne change
  rien au fil (une fiche décochée l'est dans les deux audiences, comme avant).
- Retirer la colonne morte `price_per_kg_shown` : migration à part, sur
  ordre de Hugo.
