# Plan — la quantité minimale, par audience

> 📐 **Doc-first**, écrit le 2026-10-29. Rien n'est bâti au moment de l'écriture.
> Demande de Hugo, le 2026-10-29 : « dans commerce d'une fiche produit, la carte
> audience doit être la première carte, ensuite tarifs et TVA et ensuite nouvelle
> carte options du commerce avec qté minimale par audience », précisé « par
> audience et par contexte de vente », puis ramené **à l'audience seule** le
> même jour (Q2) : M1, M2 et M3 ont été réécrits avant tout envoi.

## 1. Ce qui existe (ouvert le 2026-10-29)

- **Aucune quantité minimale de commande n'existe.** Les `minQuantity` du dépôt
  sont les seuils des paliers de prix (`tiers`), pas un minimum d'achat. Le
  seul minimum est celui d'un article au poids, `weightMinGrams`
  (`vente-au-poids.md`).
- **Les contextes de vente** sont une donnée du référentiel (`pim.sales_context`) :
  `takeaway` (À emporter), `eatIn` (Sur place), `b2b` (B2B), relus en base de dev.
- **La boutique publique sert `takeaway`** (`PUBLIC_SALES_CONTEXT`,
  `apps/lfd-api/src/b2b/catalog/domain/public-context.ts`), et le prix public
  arrive déjà au commerce **par contexte** (`CatalogItem.publicByContext`, une
  carte indexée par clé de contexte).
- **L'audience** se règle à la fiche par sa propre route, hors de « Tout
  enregistrer » : `SetProductAudienceCommand`
  (`apps/lfd-api/src/pim/catalogue/product/application/set-product-audience.ts`),
  fait `product.audience_changed`, carte `app-audience-form`.
- **L'ordre des cartes du commerce** est Audience, puis Tarif & TVA, puis Limite
  de commande, Vente en opération et Logistique (`product-form-page.html`,
  changé le 2026-10-29).

## 2. Décisions

| #   | Question                         | Décision                                                                                                                                                                                                                                                                                                                                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Niveau                           | **La déclinaison**, avec l'option de recopie (Hugo, 2026-10-29 : « par déclinaison avec l'option de recopie ») : une déclinaison autre que le défaut peut **suivre** le minimum du défaut (`minQuantityFollowsDefault`, même idiome que `pricingFollowsDefault`), ou porter le sien.                                                                                             |
| Q2  | Forme                            | **Par audience seulement (Hugo, 2026-10-29, remplace la décision « trois cases » du même jour)** : « on ne sait pas distinguer d'office, au catalogue, le mode de consommation B2C (à emporter / sur place) ». Un minimum pro, un minimum public, par déclinaison, avec toujours « suit le défaut ». Plus aucun contexte de vente dans ce sujet. Vide (`null`) = pas de minimum. |
| Q3  | Unité                            | **Des pièces**, entier ≥ 2 (1 ne dit rien). Un article au poids garde `weightMinGrams` et la carte n'écrit rien pour lui.                                                                                                                                                                                                                                                        |
| Q4  | Effet à l'écran                  | **Tranché (Hugo, 2026-10-29)** : le sélecteur part du minimum, et le « − » ne descend jamais dessous — « on ne doit pas pouvoir faire − ». La vignette pose le minimum au premier « + », et son « − » retire la ligne entière.                                                                                                                                                   |
| Q5  | Effet au serveur                 | **Tranché** : le devis et la passation refusent une ligne sous le minimum de l'audience de la commande (`BusinessError`, 409, qui nomme l'article et le minimum).                                                                                                                                                                                                                |
| Q6  | Commandes du staff               | **Tranché (Hugo : « oui »)** : la règle vaut **partout**, comptoir et nouvelle commande pro du back-office compris — même sélecteur, même refus.                                                                                                                                                                                                                                 |
| Q7  | Contexte d'une commande en ligne | **Sans objet depuis Q2 réécrite** : le minimum ne dépend que de l'audience de qui commande.                                                                                                                                                                                                                                                                                      |

## 3. Les lots

### M1 — le référentiel (backend PIM) — ✅ bâti le 2026-10-29

Route réelle : `PUT /pim/catalogue/products/:id/variants/:variantId/min-quantities`.
Deux points tranchés au bâti : « suivre » est refusé sur une déclinaison au
poids ; un minimum posé puis passé au poids reste en base mais n'est plus servi.

- Sur `pim.product_variant` : `pro_min_quantity INTEGER NULL` et
  `public_min_quantity INTEGER NULL` (`CHECK (>= 2)` chacun), et
  `min_quantity_follows_default BOOLEAN NOT NULL DEFAULT false` (`CHECK` : le
  défaut ne se suit pas). Migration additive `20261029030000`.
- Agrégat `Product`, par déclinaison : `minQuantities: { pro, public }`
  (entier ≥ 2 ou `null`) + `changeMinQuantities(variantId, next | 'follow')`,
  qui refuse une quantité < 2, « suivre » sur le défaut, et tout minimum au poids.
- Commande `SetProductMinQuantitiesCommand` (fichier colocalisé), fait de
  journal `product.min_quantities_changed` (avant/après : `followsDefault`,
  `pro`, `public`), émission au catalogue comme l'audience.
- Le détail de la fiche sert les minimums de chaque déclinaison, et les
  minimums EFFECTIFS (résolus par l'héritage) partent sur le fil.

### M2 — le fil vers le commerce — ✅ bâti le 2026-10-29 (fil v15)

- Le fait catalogue porte `minQuantities: { pro: number | null, public: number | null }`.
- `catalog_items.pro_min_quantity` et `public_min_quantity`, `INTEGER NULL`,
  projetés (migration additive `20261029030100`). Un fait d'avant la v15 se
  range sans minimum.
- `ShopItemView.minQuantity?: number | null` : le minimum de l'audience de qui
  regarde (`minQuantityFor(audience)`).

### M3 — la carte « Options du commerce » (back-office) — ✅ bâti le 2026-10-29

- Troisième carte du commerce, après Tarif & TVA : deux champs, « Particuliers »
  et « Professionnels », pour la déclinaison de la barre de déclinaisons, avec
  la case « suit le défaut » sur les autres ; enregistrement immédiat sur sa
  route. Aucun contexte de vente lu.

### M4 — l'effet (boutique + serveur) — serveur ✅ bâti le 2026-10-29, écrans à faire

Le refus vit dans `OrderLinePricing.priceAll`, seul passage du devis (boutique
et staff), de la passation (en ligne, staff, comptoir) et des lignes NOUVELLES
d'une révision : `ensureMinimumQuantity` sur le total d'un SKU,
`QuantityBelowMinimumError` (409). ⚠️ Une ligne GARDÉE qu'on baisse en révision
n'est pas contrôlée (règle R3 du plan de modification : on ne relit pas le
catalogue) — à trancher par Hugo.

- Boutique : `firstQuantityOf` part du minimum ; le « − » s'arrête au minimum.
- Serveur : refus au devis et à la passation (Q5), routes staff comprises (Q6).
- Back-office : la nouvelle commande pro et le comptoir partent du minimum et ne descendent pas dessous.
- Tests : unitaires domaine, handlers, e2e « sous le minimum → 409 », e2e staff
  qui passe outre.

## 4. Ce qui n'est pas vérifié

- Le chemin exact du devis et de la passation où poser le refus de M4.
- Si une ligne déjà au panier sous un minimum posé après coup doit être relevée
  ou refusée à la passation (proposé : refusée, avec le message).
