# Plan — la quantité minimale, par audience et par contexte de vente

> 📐 **Doc-first**, écrit le 2026-10-29. Rien n'est bâti au moment de l'écriture.
> Demande de Hugo, le 2026-10-29 : « dans commerce d'une fiche produit, la carte
> audience doit être la première carte, ensuite tarifs et TVA et ensuite nouvelle
> carte options du commerce avec qté minimale par audience », précisé « par
> audience et par contexte de vente ».

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

| #   | Question                         | Décision                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Niveau                           | **La déclinaison**, avec l'option de recopie (Hugo, 2026-10-29 : « par déclinaison avec l'option de recopie ») : une déclinaison autre que le défaut peut **suivre** le minimum du défaut (`minQuantityFollowsDefault`, même idiome que `pricingFollowsDefault`), ou porter le sien.                                                                                                     |
| Q2  | Forme                            | **Trois cases, pas six** (Hugo, 2026-10-29) : un contexte appartient à une clientèle — « À emporter » et « Sur place » sont le B2C (`public`), « B2B » est le contexte pro général, retrait comme livraison (`pro`). Les paires croisées sont refusées (`MinQuantityContextOutsideAudienceError`). Une case vide = pas de minimum. Clé de contexte, pas son id : elle voyage sur le fil. |
| Q3  | Unité                            | **Des pièces**, entier ≥ 2 (1 ne dit rien). Un article au poids garde `weightMinGrams` et la carte n'écrit rien pour lui.                                                                                                                                                                                                                                                                |
| Q4  | Effet à l'écran                  | **Tranché (Hugo, 2026-10-29)** : le sélecteur part du minimum, et le « − » ne descend jamais dessous — « on ne doit pas pouvoir faire − ». La vignette pose le minimum au premier « + », et son « − » retire la ligne entière.                                                                                                                                                           |
| Q5  | Effet au serveur                 | **Tranché** : le devis et la passation refusent une ligne sous le minimum de l'audience et du contexte de la commande (`BusinessError`, 409, qui nomme l'article et le minimum).                                                                                                                                                                                                         |
| Q6  | Commandes du staff               | **Tranché (Hugo : « oui »)** : la règle vaut **partout**, comptoir et nouvelle commande pro du back-office compris — même sélecteur, même refus.                                                                                                                                                                                                                                         |
| Q7  | Contexte d'une commande en ligne | Le public commande dans `PUBLIC_SALES_CONTEXT` ; le pro commande dans `b2b`. Le jour où le sur place arrive, il arrive par sa propre porte (cf. `public-context.ts`).                                                                                                                                                                                                                    |

## 3. Les lots

### M1 — le référentiel (backend PIM) — ✅ bâti le 2026-10-29

Route réelle : `PUT /pim/catalogue/products/:id/variants/:variantId/min-quantities`.
Trois points tranchés au bâti : « suivre » est refusé sur une déclinaison au
poids ; une grille posée puis passée au poids reste en base mais n'est plus
servie ; un contexte hors service est refusé, comme pour la TVA.

- Table `pim.variant_min_quantity (variant_id, audience, context_id, quantity)`,
  clé `(variant_id, audience, context_id)`, et `product_variant.min_quantity_follows_default
BOOLEAN NOT NULL DEFAULT false`, `CHECK (quantity >= 2)`,
  `audience IN ('pro','public')`, FK contexte en `Restrict`. Migration additive.
- Agrégat `Product`, par déclinaison : `minQuantities` + `changeMinQuantities(variantId, next | 'follow')`, refusé pour « suivre » sur le défaut, qui refuse un
  contexte inconnu ou une quantité < 2.
- Commande `SetProductMinQuantitiesCommand` (fichier colocalisé), route
  `PUT /pim/catalogue/products/:id/variants/:variantId/min-quantities`, fait de journal
  `product.min_quantities_changed` (avant/après), émission au catalogue comme
  l'audience.
- Le détail de la fiche sert la matrice de chaque déclinaison, et la matrice EFFECTIVE (résolue par l'héritage) part sur le fil.

### M2 — le fil vers le commerce — ✅ bâti le 2026-10-29 (fil v15)

- Le fait catalogue porte `minQuantities: { pro: Record<ctxKey, n>, public: Record<ctxKey, n> }`.
- `catalog_items.min_quantities jsonb NULL` (null = avant le fil), projeté.
- `ShopItemView.minQuantity?: number | null` : le minimum **déjà résolu** pour
  l'audience et le contexte de qui regarde.

### M3 — la carte « Options du commerce » (back-office)

- Troisième carte du commerce, après Tarif & TVA : une grille audience ×
  contexte par déclinaison (celle de la barre de déclinaisons), avec la case « suit le défaut » sur les autres ; enregistrement immédiat sur sa route.

### M4 — l'effet (boutique + serveur)

- Boutique : `firstQuantityOf` part du minimum ; le « − » s'arrête au minimum.
- Serveur : refus au devis et à la passation (Q5), routes staff comprises (Q6).
- Back-office : la nouvelle commande pro et le comptoir partent du minimum et ne descendent pas dessous.
- Tests : unitaires domaine, handlers, e2e « sous le minimum → 409 », e2e staff
  qui passe outre.

## 4. Ce qui n'est pas vérifié

- Le chemin exact du devis et de la passation où poser le refus de M4.
- Si une ligne déjà au panier sous un minimum posé après coup doit être relevée
  ou refusée à la passation (proposé : refusée, avec le message).
