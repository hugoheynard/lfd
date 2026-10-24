# Plan — modifier une commande payée par carte (M2)

> **Doc-first, 2026-10-23.** Suite de
> [`plan-modifier-une-commande.md`](plan-modifier-une-commande.md) : M1 (commit
> `21aae837c`) refuse une commande payable par carte. Décision de Hugo : un
> article retiré d'une commande payée par carte est **remboursé au retrait**.
> Le reste est choisi par l'assistant, avec sa raison. Touche **l'argent** :
> `vitruve` avant de bâtir.

## 0. Ce qui existe (ouvert le 2026-10-23)

- **La carte est débitée tout de suite** (intention sans `capture_method`,
  `b2b/payments/infrastructure/stripe-payment-gateway.ts`) ; une commande porte
  **une** intention (`orders.stripe_payment_intent_id`), par laquelle le
  webhook la retrouve.
- **Les remboursements constatés** sont une table à plusieurs lignes par
  commande (`order_refund`, une par `re_…`), plafonnés au total
  (`orders.total_cents`). La **demande** de remboursement, elle, est unique par
  commande (`order_refund_request`, `orderId @id`), écrite par l'annulation.
- **La facture d'une commande pro payée par carte naît quand la commande est
  retirée ET payée** (`facture-carte-et-remboursements.md`), avec un acquit
  égal au **total de la commande** (`card-invoice-support.ts`,
  `prepayment.amountCents = totalCents`). Chaque remboursement constaté sur une
  commande facturée produit un **avoir**.
- **M1 ne modifie qu'avant l'inscription au plan** : à ce moment, **aucune
  facture carte n'existe** (elle naît au retrait).

## 1. Le découpage

| Lot     | Ce qu'il permet                                                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M2a** | Une commande **payée par carte** se modifie tant que son total **ne monte pas** : moins d'articles, autre date, autre créneau, autre point, retrait ↔ livraison si le total ne monte pas. La différence est remboursée **au retrait**. |
| **M2b** | Une commande carte **non encore payée** (intention en attente) se modifie librement.                                                                                                                                                   |
| **M2c** | Une commande **payée** dont le total **monte** : le complément.                                                                                                                                                                        |

_(Raison du découpage : M2a et M2b n'ajoutent aucune intention Stripe ; M2c
en ajoute une, et c'est là que vit toute la difficulté — vitruve, objections
2 à 5 du plan M1.)_

## 2. M2a — la baisse, remboursée au retrait

- **R1** — La révision d'une commande payée par carte est admise si le
  nouveau total est **inférieur ou égal** à l'ancien. Au-dessus : refus clair
  (« le total augmenterait : passez une seconde commande pour l'ajout, ou
  demandez au commerce ») jusqu'à M2c.
- **R2** — La différence s'accumule sur la commande dans un montant **dû au
  remboursement au retrait** (`orders.revision_refund_due_cents`, migration
  additive, ≥ 0). Deux baisses s'additionnent. _(Raison : la demande de
  remboursement est unique par commande ; on ne l'écrit qu'une fois, à la
  remise, avec le cumul.)_
- **R3** — **Au retrait** (`mark-order-fulfilled`), si le dû est positif, la
  demande de remboursement est écrite dans la même unité de travail, cause
  nouvelle `revision` (valeur d'énumération ajoutée par migration), montant =
  le dû ; l'exécuteur existant l'émet. Le dû passe à zéro.
- **R4** — **Annulée avant le retrait** : l'annulation rembourse ce qui a été
  **encaissé** (pas le total révisé) et remet le dû à zéro, dans sa
  transaction. Aucun double remboursement.
- **R5** — **La facture carte** naît au retrait sur la commande **révisée** :
  son acquit vaut le total révisé (inchangé : `totalCents`). Le remboursement
  de cause `revision` ne produit **aucun avoir** : il rend un trop-perçu sur
  un montant que la facture n'a jamais porté. _(Raison : sinon la baisse
  serait comptée deux fois, objection 3 du plan M1.)_ Les autres causes
  gardent leur avoir.
- **R6** — **Le plafond** des remboursements reste `Σ succeeded ≤ encaissé`.
  Il lisait `orders.total_cents` ; une commande révisée à la baisse a un total
  inférieur à l'encaissé : le plafond lit désormais **le montant encaissé**,
  conservé sur la commande à l'encaissement (`orders.captured_cents`, migration
  additive, rempli par `markPaid` ; repris de `total_cents` pour les commandes
  payées existantes). `paymentStatus = refunded` quand Σ = encaissé.
- **R7** — **Points de fidélité** : gagnés au retrait sur le total révisé,
  comme aujourd'hui (aucun changement).
- **R8** — **Ce que voit le client** : « 3,10 € vous seront remboursés à la
  remise » sur la commande, et dans le devis de la modification.

## 3. M2b — la carte non encore payée

- **R9** — L'intention en attente est **fermée** chez Stripe (`cancelIntent`)
  **avant** l'écriture, comme l'annulation ; si Stripe répond `already_paid`
  (le client vient de payer), la révision est refusée « le paiement vient
  d'aboutir, rechargez » et se rejoue alors en M2a. `in_progress` :
  refus « paiement en cours ». Après l'écriture, une nouvelle intention au
  nouveau montant est créée **à la demande**, par le chemin du lien de
  paiement existant. _(Raison : c'est l'ordre déjà éprouvé par l'annulation, et
  aucune intention ne survit à son montant.)_

## 4. M2c — le complément (non bâti ici)

Une commande payée dont le total monte demande une **seconde intention**, donc
une table des paiements d'une commande (n intentions), un webhook qui les
retrouve, un remboursement réparti entre elles, une facture acquittée de leur
somme. À concevoir à part, quand le besoin réel se présentera ; d'ici là, R1
refuse avec un geste de sortie (« passez une seconde commande »).

## 5. Tests

- Baisse payée par carte : dû accumulé, remise → demande cause `revision` au
  bon montant, exécutée ; facture carte acquittée du total révisé, **sans
  avoir** pour ce remboursement ; plafond sur l'encaissé.
- Deux baisses : cumul. Annulation après une baisse : remboursement de
  l'encaissé, dû remis à zéro.
- Hausse payée : refus avec le message.
- Carte en attente : intention fermée puis révision ; `already_paid` → refus ;
  nouvelle intention au nouveau montant.

## 6. Contredit par `vitruve` (2026-10-23) — **à reconcevoir, rien n'est bâti**

Trois objections bloquantes, que le plan ne sait pas lever sans changer de
mécanique :

1. **L'exécuteur des remboursements rend TOUT le reste**, pas un montant
   (`issue-order-refund.handler.ts` → `refundRemainder`, sans `amount` chez
   Stripe). Une demande `revision` de 3,10 € rembourserait la commande
   entière, marchandise retirée. Il faudrait un montant dans le port, l'appel
   Stripe, l'état de la demande et sa recherche « plus rien à rendre ».
2. **« Pas d'avoir pour la cause `revision` » n'a pas de mécanisme** : le
   carnet `order_refund` ne connaît pas la cause, la comptabilité émet un
   avoir pour tout remboursement réussi d'une commande facturée
   (`refund-reconciler.ts`), et le webhook peut constater le remboursement
   avant que la demande connaisse son `re_…`.
3. **M2b s'appuie sur un chemin qui n'existe pas** : la page de règlement ne
   crée jamais de nouvelle intention (`get-order-payment.handler.ts`) ; une
   intention fermée laisse la commande impayable.

Et huit sérieuses, dont : le montant facturé lu sur `total_cents` à cinq
endroits ; `captured_cents` mal défini ; un dû sans issue quand la commande
n'est jamais retirée ; les remboursements partiels déjà faits ; le
retournement d'un remboursement ignoré sur une commande retirée ; le
gestionnaire du retrait qui gagnerait une écriture rejouable sans fin ; et
**un écart assumé entre la banque et les factures** (trop-perçu sans avoir),
qui demande l'avis de Hugo.

### La piste plus simple, à proposer à Hugo

**Modifier une commande payée par carte = la remplacer.** L'ancienne est
annulée et **remboursée en entier** par le mécanisme existant (qui rend
justement tout le reste), la nouvelle est passée et payée comme n'importe
quelle commande, avec les prix des lignes déjà présentes conservés (R3 de M1).
Aucune facture n'existe encore (elle naît au retrait), aucun montant partiel,
aucune seconde intention, aucun avoir. Ce qu'on perd : le client est débité
du nouveau total avant d'être recrédité de l'ancien (quelques jours de
découvert sur sa carte), et la commande change de numéro — à moins de
garder l'ancien numéro visible comme « remplace la commande N ». Cela
contredit la décision 6 (« remboursé au retrait ») : c'est à Hugo de
trancher.

## 7. Décision de Hugo (2026-10-23) : le remplacement, sous le même numéro

« Ok pars sur le remplacement, mais j'aurais voulu garder le même numéro de
commande. » Les §1 à §5 sont **abandonnés** ; ce qui suit les remplace.

**Principe.** Modifier une commande payée par carte, c'est la **remplacer** :
une nouvelle commande, payée à part, puis une bascule qui donne son numéro à
la nouvelle et rembourse l'ancienne en entier. Chaque commande garde **sa**
propre intention Stripe : les webhooks, les remboursements et le carnet
retrouvent toujours la bonne commande (objection 3 de M1, objection 3 de M2
levées sans rien changer à leur mécanique).

- **R1 — La nouvelle commande** est composée comme une révision M1 (mêmes
  règles de qui, quand, quoi ; R3 des prix : les lignes déjà présentes gardent
  leur prix), mais **écrite comme une commande neuve**, liée à l'ancienne
  (`orders.replaces_order_id`, migration additive), sous un **numéro
  provisoire**, en attente de paiement par carte, par le chemin de passation
  existant (intention, page de règlement). Elle n'entre pas au fournil tant
  qu'elle n'est pas payée (règle actuelle d'une commande carte non payée — à
  vérifier, sinon l'exclure explicitement).
- **R2 — Tant que la nouvelle n'est pas payée, l'ancienne ne bouge pas.** Si
  le paiement échoue ou expire, la nouvelle est abandonnée comme toute
  commande carte non payée : rien n'a changé pour le client.
- **R3 — La bascule, au paiement réussi de la nouvelle**, en une transaction,
  sous le verrou des deux lignes `orders` et de la journée :
  1. l'ancienne est rejugée (toujours `placed`, non inscrite) ;
  2. son numéro devient un **numéro d'archive** (`<N>-R<k>`) ;
  3. elle est annulée, motif `replaced`, et sa demande de remboursement est
     écrite par le noyau d'annulation existant (remboursement **intégral**,
     ce que l'exécuteur sait faire) ;
  4. la nouvelle prend le numéro `<N>`.
     Si l'ancienne a été inscrite au plan entre-temps (la journée a clos), la
     bascule n'a pas lieu : la nouvelle est annulée et remboursée, le client et
     le staff sont prévenus.
- **R4 — Ce que voit le client** : la commande `<N>`, à jour. Le détail dit
  « remplace votre commande du … ; l'ancien paiement de X € vous est
  remboursé ». Le staff voit l'ancienne sous `<N>-R<k>`, « remplacée ».
- **R5 — Le fournil, la livraison, le colisage** voient une annulation et une
  passation, deux gestes qu'ils savent déjà traiter.
- **R6 — La facture** : aucune n'existe encore (elle naît au retrait) ;
  l'ancienne, annulée, n'est jamais facturée.
- **R7 — Une commande carte non encore payée** (intention en attente) :
  même chemin — la nouvelle remplace l'ancienne à son paiement, et l'ancienne
  est annulée (son intention fermée, comme une annulation).

À vérifier avant de bâtir, et à contredire par `vitruve` : le numéro
(`orders.order_number` unique, son générateur, ses lecteurs figés — bon PDF
archivé, courriels déjà partis, demandes clients, journal) ; l'unicité de
`<N>-R<k>` ; la bascule dans le webhook `markPaid` (idempotence, ordre des
verrous) ; le bon de fidélité imputé sur l'ancienne (restitué par
l'annulation, ré-imputé sur la nouvelle ?) ; la surtaxe et la dérogation
d'heure limite ; les points.

## 8. Le §7 contredit par `vitruve` (2026-10-23) — rien n'est bâti

Cinq bloquants, chacun avec la piste retenue si le chantier est lancé :

1. **Un refus de l'annulation dans le webhook défait le paiement** (l'unité de
   travail rejoint celle de `markPaid`) : Stripe rejoue des jours, le client
   débité reste sur une commande en attente. → Le webhook ne fait que
   `markPaid` + un fait durable `order.replacement_paid` ; **la bascule est un
   abonné durable** avec sa propre transaction et son repli.
2. **L'ancienne carte non payée** : fermer son intention est un appel Stripe,
   qui ne doit pas se faire sous verrou, et le client peut avoir payé les deux
   pages. → Même découpage ; `already_paid` se traite comme une ancienne payée
   (remboursement).
3. **Le bon de fidélité** finirait sur deux commandes, ou restitué alors que la
   nouvelle le déduit encore. → La nouvelle ne porte **aucun** bon à sa
   passation ; la bascule **transfère** l'imputation, sous le verrou du
   titulaire, sans restitution.
4. **L'annulation « remplacée » et l'acteur « système »** sont refusés par les
   contraintes de la base et par le contrat ; et ses abonnés enverraient au
   client « votre commande est annulée » au moment où on lui dit « à jour ».
   → Migration des contraintes, contrat élargi, et un courriel « votre
   commande a été modifiée » à la place de celui d'annulation.
5. **Une nouvelle commande à total nul** n'a pas de paiement, donc pas de
   bascule. → Bascule déclenchée à la passation dans ce cas.

Et des sérieuses : l'expiration d'une commande non payée ne vise que le
particulier (une nouvelle commande de pro resterait en attente sans fin) ; une
seule nouvelle commande en attente par ancienne (index unique partiel) ;
l'ancienne annulée entre-temps ; la nouvelle visible partout pendant
l'attente sous un numéro ordinaire ; les copies figées du numéro (demandes
clients, alertes, courriel) qui dépendent de l'ordre des étapes ; le client
qui avance deux fois le montant (plafond de carte, 5 à 10 jours de
remboursement) ; la dérogation d'heure limite restée sur l'ancienne.

**État** : à présenter à Hugo — c'est un chantier de taille (paiement,
annulation, bon de fidélité, numérotation, courriels), qui se bâtirait en deux
ou trois lots.
