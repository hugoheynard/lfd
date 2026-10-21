# Plan — filtrer par date et récapituler des commandes dans la boutique

> **Doc-first, 2026-10-21.** Rien n'est bâti. Demandé par Hugo le 2026-10-21 :
> « filtrer aussi par date, sélectionner les rows de commande et demander un
> récapitulatif avec une agrégation des skus ». Touche à l'argent (HT, TVA,
> TTC) : contredit par `vitruve` avant d'être soumis. **Contredit le 2026-10-21 :
> trois BLOQUANTS ; le §6 l'emporte sur les §1 à §4 là où ils divergent.**

## 0. Ce qui existe (ouvert le 2026-10-21)

- **« Mes commandes »** de la boutique
  (`apps/lfc-ecommerce-frontend/src/app/client/mes-commandes/`) : la liste
  `GET /companies/:companyId/orders?site=…` (`CompanyOrderListItemView`,
  [`plan-commandes-des-sites.md`](../comptes-client/plan-commandes-des-sites.md),
  C1–C2) — un principal y voit les commandes de ses sites.
- **Une ligne de commande** (`order_lines`) porte un instantané figé à la
  passation : `sku`, `product_name_snapshot`, `quantity`,
  `unit_price_millicents` (HT), `vat_rate`, `line_total_cents` (HT),
  `unit_price_ttc_cents`, `line_total_ttc_cents`.
- **La TVA d'une commande** se calcule sur la commande entière
  (`computeOrderTotals`, `orders/domain/entities/order.ts` : `vatCents`,
  `vatShares`, `totalCents`) — pas comme la somme des TVA de ses lignes.
- **La date de remise** : `orders.requested_delivery_date`.

## 1. Ce qu'on bâtit

- **Filtre par date** de retrait/livraison (`requested_delivery_date`), du…
  au…, relu au serveur, combiné au filtre site (Hugo, 2026-10-21).
- **Sélection** de lignes dans la table (cases à cocher), « tout sélectionner
  ce qui est affiché ».
- **Récapitulatif** des commandes sélectionnées : par produit (SKU), la
  quantité totale, le HT, la TVA et le TTC ; en bas, les totaux. À l'écran
  (panneau), en PDF A4 et en tableur CSV (Hugo, 2026-10-21).

## 2. Les règles

- **Calculé au serveur**, jamais au front : une route
  `POST /companies/:companyId/orders/summary` (corps : ids de commandes ;
  formats JSON, PDF, CSV) relit les commandes par le MÊME mur que la liste
  (`wallOf` de C1 : la société, ou ses sites pour owner/admin du principal),
  en une lecture. Un id non visible → refus qui le nomme, jamais un
  récapitulatif partiel.
- **Les montants viennent des instantanés**, jamais d'un prix d'aujourd'hui.
- **Par produit** : quantité = somme des `quantity` ; HT = somme des
  `line_total_cents` ; TTC = somme des `line_total_ttc_cents`. Un même SKU
  vendu à deux prix reste UNE ligne (prix unitaire moyen non affiché, ou
  affiché « moyen »).
- **Les totaux** du bas = somme des totaux des COMMANDES (`vatCents`,
  `totalCents`), qui font foi — et non la somme des lignes produit, qui peut
  s'en écarter d'un centime par arrondi. L'écart, s'il existe, est dit.
- **Commandes annulées** : exclues du récapitulatif (et dites exclues).
- **Plafond** de commandes sélectionnables, refus nommé au-delà.

## 3. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                   | Agent     |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **R1** | Serveur : filtre de date sur la liste ; route du récapitulatif (JSON) sous le mur de C1 ; agrégation pure dans le domaine, testée (deux prix pour un SKU, plusieurs taux, annulée, écart d'arrondi, sites mêlés) ; e2e (mur, refus nommé) | batisseur |
| **R2** | Serveur : PDF A4 (même trousse et même logo que la matrice et le bon) et CSV                                                                                                                                                              | batisseur |
| **R3** | Boutique : filtre de date, sélection, panneau du récapitulatif, boutons PDF et Tableur                                                                                                                                                    | pablo     |

## 4. Questions ouvertes

- **Q1** — Récapitulatif d'un principal sur plusieurs sites : une seule table,
  ou une table par site puis le total ?
- **Q2** — Un particulier (commande personnelle) a-t-il ce récapitulatif ?

## 5. Décisions (Hugo, 2026-10-21)

- Quantités + HT + TVA + TTC ; à l'écran, PDF et CSV ; filtre sur la date de
  retrait/livraison.

## 6. Révision après `vitruve`, tranchée par Hugo (2026-10-21) — l'emporte

**Ce que le §0 taisait** : une commande porte aussi `discount_cents`,
`voucher_discount_cents`, `delivery_fee_cents`, `late_fee_cents`,
`vat_shares` (TVA ventilée par taux après remise, port selon
`deliveryVatMode`) et `principal_sees_amount`. `line_total_ttc_cents` est
NULL pour toute commande pro (`orders.prisma`) : il n'existe pas de TTC par
ligne pour un pro.

**6.1 Comme une facture (Hugo)** : par produit, la quantité et le HT
seulement (somme des `line_total_cents`) ; un même SKU à deux prix reste une
ligne, sans prix unitaire affiché. Sous les produits : sous-total HT, puis
remises, bons, livraison, surtaxes (sommes des colonnes des commandes), puis
la TVA PAR TAUX (somme des `vat_shares`) et le TTC = somme des `totalCents`.
Le bas est donc EXACTEMENT la somme des commandes ; aucun écart à expliquer.

**6.2 Une table par site, puis le total (Hugo, Q1)** : pour un principal,
chaque société (lui-même, chaque site) a sa table et son bas ; un total
général par produit et par ligne de bas suit.

**6.3 Les montants des sites (Hugo)** : le détenteur et l'admin du principal
voient TOUS les montants de ses sites, dans la liste, le détail et le
récapitulatif — ils y agissent comme admin du site. `principal_sees_amount`
ne règle que les MAILS aux contacts du principal (N1–N4e) ; il n'entre pas
dans ce mur.

**6.4 « Montants à la commande »** : l'en-tête de l'écran, du PDF et du CSV
le dit — les remboursements et avoirs postérieurs ne sont pas déduits ; le
relevé comptable, ce sont les factures.

**6.5 La route** : une QUERY (aucune écriture), `POST
/companies/:companyId/orders/summary` parce que la sélection va dans le corps
(ids), format par champ du corps (`json` | `pdf` | `csv`). Plafond : 200
commandes, refus nommé ; l'écran dit le plafond quand « tout sélectionner »
le dépasse. Sont exclues ET listées comme telles : annulées, paiement en
attente ou refusé. Un id hors du mur → refus qui le nomme.

**6.6 Les dates** : bornes `AAAA-MM-JJ` validées par Zod, incluses, comparées
au jour de `requested_delivery_date` (`@db.Date`) ; une commande sans date
est exclue du filtre daté et le résultat le compte (« N sans date »).

**6.7 CSV** : les règles de cellule (BOM, `;`, virgule décimale) passent dans
`platform/` pour les deux contextes qui les écrivent (`accounting` et
`orders`), au lieu d'une cinquième copie ; une cellule qui commence par `=`,
`+`, `-` ou `@` est neutralisée (injection de formule).

**6.8 Q2** : non — une commande personnelle n'a pas de société ; le
récapitulatif des particuliers serait une autre route, en TTC. Hors de ce plan.

## 7. Ce qui est bâti

**R1 — serveur, bâti le 2026-10-21 (non commité à l'écriture de ces lignes).**

- **Filtre de jour** sur `GET /companies/:companyId/orders?from=&to=` :
  `AAAA-MM-JJ` par Zod (`companyOrdersQuerySchema`), jour existant et
  début ≤ fin vérifiés au handler (`apps/lfd-api/src/b2b/orders/application/queries/company-order-day-range.ts`), bornes
  incluses sur `requested_delivery_date`, en `AND` sous le mur. Une borne
  posée exclut les commandes sans date. ⚠️ **« N sans date » n'est PAS
  servi** : la réponse de la liste est un tableau (servi à C2), et le compter
  demande de changer sa forme ou d'ajouter un canal — à trancher.
- **Le mur** de C1 est sorti dans `apps/lfd-api/src/b2b/orders/infrastructure/company-order-wall.ts`,
  partagé par la liste et le récapitulatif.
- **Récapitulatif** `POST /companies/:companyId/orders/summary` (corps
  `{ orderIds, format: "json" }`, `companyOrderSummaryRequestSchema`) : query
  `SummarizeCompanyOrdersQuery`, port `CompanyOrderSummaryReader` (une
  lecture, sous le mur, SANS `CUSTOMER_VISIBLE` pour pouvoir nommer les
  exclues). Membre puis plafond (`ORDER_SUMMARY_MAX_ORDERS` = 200, 400) avant
  toute lecture ; id hors mur → 404 qui le nomme.
- **Agrégation pure** `apps/lfd-api/src/b2b/orders/domain/services/order-summary.ts` : une table par
  société (la société listée, puis les sites par nom), par SKU quantité + HT
  (`line_total_cents`) ; bas = sommes des colonnes (sous-total, remise, bon,
  livraison, surtaxe, TVA par taux depuis `vat_shares`, TTC = `total_cents`) ;
  une commande sans `vat_shares` voit sa TVA sommée dans
  `unventilatedVatCents`, sans taux inventé ; `amountsAt: "placement"`.
- Tests : domaine (`apps/lfd-api/src/b2b/orders/domain/services/__tests__/order-summary.spec.ts`), handler
  (`apps/lfd-api/src/b2b/orders/application/queries/__tests__/summarize-company-orders.handler.spec.ts`, `list-company-orders.handler.spec.ts`),
  e2e `apps/lfd-api/test/company-order-summary.e2e-spec.ts`, contrat
  (`packages/contracts/src/__tests__/company-orders.spec.ts`).
