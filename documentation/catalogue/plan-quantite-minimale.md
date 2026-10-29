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

| #   | Question                         | Décision                                                                                                                                                                                                               |
| --- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | Niveau                           | **La fiche**, comme l'audience : toutes ses déclinaisons partagent le minimum. (Hugo, 2026-10-29 : « par audience et par contexte de vente ».)                                                                         |
| Q2  | Forme                            | Une **matrice audience × contexte** : `pro` et `public` en lignes, chaque contexte de vente en colonne. Une case vide = pas de minimum. Clé de contexte, pas son id : comme `publicByContext`, elle voyage sur le fil. |
| Q3  | Unité                            | **Des pièces**, entier ≥ 2 (1 ne dit rien). Un article au poids garde `weightMinGrams` et la carte n'écrit rien pour lui.                                                                                              |
| Q4  | Effet à l'écran                  | ⚠️ **Proposé, non tranché par Hugo** : le sélecteur de la boutique part du minimum et ne descend pas dessous ; la vignette pose le minimum au premier « + ».                                                           |
| Q5  | Effet au serveur                 | ⚠️ **Proposé, non tranché** : le devis et la passation refusent une ligne sous le minimum de l'audience et du contexte de la commande (`BusinessError`, 409, qui nomme l'article et le minimum).                       |
| Q6  | Commandes du staff               | ⚠️ **Proposé, non tranché** : le comptoir et la nouvelle commande pro du back-office **passent outre**, sans refus ; ils affichent le minimum en information.                                                          |
| Q7  | Contexte d'une commande en ligne | Le public commande dans `PUBLIC_SALES_CONTEXT` ; le pro commande dans `b2b`. Le jour où le sur place arrive, il arrive par sa propre porte (cf. `public-context.ts`).                                                  |

## 3. Les lots

### M1 — le référentiel (backend PIM)

- Table `pim.product_min_quantity (product_id, audience, context_id, quantity)`,
  clé `(product_id, audience, context_id)`, `CHECK (quantity >= 2)`,
  `audience IN ('pro','public')`, FK contexte en `Restrict`. Migration additive.
- Agrégat `Product` : `minQuantities` + `changeMinQuantities(next)` qui refuse un
  contexte inconnu ou une quantité < 2.
- Commande `SetProductMinQuantitiesCommand` (fichier colocalisé), route
  `PUT /pim/products/:id/min-quantities`, fait de journal
  `product.min_quantities_changed` (avant/après), émission au catalogue comme
  l'audience.
- Le détail de la fiche sert la matrice.

### M2 — le fil vers le commerce

- Le fait catalogue porte `minQuantities: { pro: Record<ctxKey, n>, public: Record<ctxKey, n> }`.
- `catalog_items.min_quantities jsonb NULL` (null = avant le fil), projeté.
- `ShopItemView.minQuantity?: number | null` : le minimum **déjà résolu** pour
  l'audience et le contexte de qui regarde.

### M3 — la carte « Options du commerce » (back-office)

- Troisième carte du commerce, après Tarif & TVA : une grille audience ×
  contexte, champs numériques, enregistrement immédiat sur sa route.

### M4 — l'effet (boutique + serveur)

- Boutique : `firstQuantityOf` part du minimum ; le « − » s'arrête au minimum.
- Serveur : refus au devis et à la passation (Q5), pas aux routes staff (Q6).
- Tests : unitaires domaine, handlers, e2e « sous le minimum → 409 », e2e staff
  qui passe outre.

## 4. Ce qui n'est pas vérifié

- Le chemin exact du devis et de la passation où poser le refus de M4.
- Si une ligne déjà au panier sous un minimum posé après coup doit être relevée
  ou refusée à la passation (proposé : refusée, avec le message).
