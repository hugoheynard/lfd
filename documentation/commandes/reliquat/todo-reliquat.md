# TODO — le départ incomplet et le reliquat

> Ouvert le 2026-11-10, chaque point relu contre le code ce jour-là. L'état
> bâti est dans [`reliquat.md`](reliquat.md). Un point pris se réduit ici à un
> renvoi vers son plan.

## 1. Le départ incomplet d'une commande carte (E9)

**Ce qui manque.** Une commande réglée par carte (`due`, `paid`) ne part
jamais incomplète : `termsRefusalOf` rend `card`
(`apps/lfd-api/src/lafoliecoffee/orders/domain/services/shortfall-decidability.ts`) et
`CardOrderShortfallError` renvoie à « E9 ». Un particulier ne peut donc pas
emporter un sac incomplet.

**Ce qui le débloque, depuis le 2026-11-10.** Le remboursement d'un montant
existe (`CardRefunds.requestAmount`,
`apps/lfd-api/src/payment/channels/requests/card-refunds.ts`, lot P1), et
la baisse d'une commande carte le répartit déjà sur ses paiements
(`apps/lfd-api/src/lafoliecoffee/orders/revision/domain/services/revision-card-refund.ts`, lot S1).

**Ce qu'il faut trancher avant de bâtir** (argent : `vitruve`) :

- **Le montant à rendre** : commande − Σ des BL remis (le reste abandonné),
  demandé dans la transaction de la décision, avec une clé par décision.
- **La facture carte.** Elle compare encaissé − remboursé d'ajustement au
  **total de la commande** (`moneySquares`,
  `apps/lfd-api/src/lafoliecoffee/accounting/domain/services/card-invoicing.ts`) et
  facture les totaux de la commande (`frozen: toFrozenInvoiceOrder(order)`,
  `apps/lfd-api/src/lafoliecoffee/accounting/infrastructure/prisma-card-invoicing.reader.ts`).
  Une baisse S1 réécrit la commande, donc l'égalité tient ; un départ
  incomplet **laisse la commande intacte** : remboursé, la facture resterait
  `blocked` pour toujours, et elle porterait des lignes non livrées. Il faut
  que la facture carte lise les montants facturables (Σ des BL), comme la
  facture au compte, et que l'égalité les compare.
- **Quand la facture part** : Q-R4 (Hugo, 2026-10-25) la veut « au solde » ;
  elle part aujourd'hui à la remise, ce qui reste juste tant qu'il n'y a pas
  de reste.

## 2. Le reliquat de commande

**Décidé par Hugo le 2026-11-25** : pas de second envoi de la même commande
(L7, L8 et L9 abandonnés, « on fait trop compliqué »). Le reste reste
abandonné côté origine ; un **reliquat** (`Backorder`) naît dans la
transaction de la décision, et l'équipe le transforme en commande ordinaire,
aux prix de l'origine, ou l'abandonne. Le second envoi bâti (rangs,
`planRemainder`) est du code mort à retirer. Plan :
[`plan-reliquat-de-commande.md`](plan-reliquat-de-commande.md) (lots B1 à B5).

## 3. Le bon de fidélité

**Ce qui manque.** Une commande qui porte un bon de fidélité ne part jamais
incomplète (`VoucherOrderShortfallError`, « un départ incomplet ne sait pas
encore le répartir »). Le BL partiel ne sait pas où mettre un montant fixe de
bon : sur le BL-1 seul (comme le port d'un reste), ou au prorata. **À
trancher par Hugo**, puis à bâtir dans `departingSourceOf`.

## 4. Le manquant constaté à la porte ou au comptoir (G4, R1, R2)

**Ce qui manque.** Le retrait et la livraison n'ont ni manquant ni réserve à
la remise : `handover/` et `delivery/` lisent le manque du colisage pour
l'afficher (feuille de route, `stop-sheets.ts`), aucun geste n'en déclare un
(relu le 2026-11-10). Ni avoir, ni litige. C'est R1 (réserve par ligne sur le
BL remis) et R2 (l'avoir 381) du plan-cadre
([`../plan-commande-bon-de-livraison-facture.md`](../plan-commande-bon-de-livraison-facture.md),
§ 11.3), reportés par Hugo le 2026-10-24. Argent : `vitruve`.

## 5. Les petits restes

- **L'avertissement de retard d'un reste** : `warn-customer-of-delay.handler.ts`
  avertit une fois par commande, au rang 1.
- **Les colonnes mortes du manque sur `orders`** (`shortfall_reported_at`,
  `shortfall_lines`, `shortfall_cleared_at`) : le manque vit dans
  `order_shortfall` depuis LB ; leur resserrement est une migration à part.
- **Les cas de l'aperçu `not_drawn`, `withdrawn`, `sealed`, `counted`,
  `already_authorized`** ne sont éprouvés qu'en unitaire : la scène e2e ne les
  atteint pas au rang 1.
- **Une remise avant le tirage de la liste** n'a pas de fiche à sortir ; si le
  fournil tire ensuite une commande déjà retirée, sa fiche naîtra ouverte.
- **Questions laissées le 2026-10-26, non revérifiées** : faut-il retirer le
  réglage « dépôt autorisé » des adresses côté boutique, que la règle d'arrêt
  ne lit plus ? Une commande en attente de son reste laisse l'onglet Factures
  à « fait » : faut-il un état « en attente » ?

## Hors de ce dossier

Les autres chantiers du plan-cadre
([`../plan-commande-bon-de-livraison-facture.md`](../plan-commande-bon-de-livraison-facture.md),
§ 11) : A1 (annuler après l'arrêt) vit dans
[`../annulation/todo-annulation.md`](../annulation/todo-annulation.md), A2
(modifier après l'arrêt) dans [`../modification/`](../modification/modifier-une-commande.md) ;
H2 est ouvert (`draft` et `in_production` sont toujours dans l'énuméré
`OrderStatus`, relu le 2026-11-10) ; H1 n'est pas revérifié ici. E3 (le
retrait par BL) est bâti : lots L3d et L4b, [`reliquat.md`](reliquat.md) § 6.
