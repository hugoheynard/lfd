# Plan — modifier une commande payée par carte (M2)

> **Doc-first, 2026-10-23.** Suite de
> [`plan-modifier-une-commande.md`](plan-modifier-une-commande.md) : M1 (commit
> `21aae837c`) refuse une commande payable par carte. Décision de Hugo : un
> article retiré d'une commande payée par carte est **remboursé au retrait**.
> Récapitulatif pour décider : [`recap-modifier-une-commande-carte.md`](recap-modifier-une-commande-carte.md) (2026-11-09).
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

## 9. Le plan bâtissable (2026-11-09) — le remplacement, verrouillé

> **Doc-first, 2026-11-09.** Hugo : « vas-y pour M2, fais le plan et
> vitruve ». Ce paragraphe reprend la décision du §7 (le remplacement, sous le
> même numéro) et les pistes du §8, **relues dans le code ce jour-là** ; il
> remplace les deux comme référence pour bâtir. Rien n'est bâti.

### 9.1 Ce que le code dit aujourd'hui (ouvert le 2026-11-09)

- **Le remboursement ne sait rendre que TOUT le reste d'une intention** :
  `PaymentRefunder.refundRemainder` n'a pas de montant
  (`payments/domain/payment-refunder.ts`). C'est la raison du remplacement :
  une ancienne commande remboursée en entier est exactement ce qu'il sait
  faire.
- **Les causes d'une demande de remboursement** sont `cancellation`,
  `paid_after_cancellation`, `refund_reversed` (enum `OrderRefundCause`,
  `order-refund.prisma`) ; la demande est **unique par commande** (clé =
  `order_id`), écrite par `CancellationRefundRequester` sous le verrou de la
  ligne `orders`.
- **Le paiement réussi** (`confirm-order-payment.handler.ts`) fait `markPaid`
  et publie `order.paid` **durable** dans la même unité de travail. Ses
  abonnés : l'accusé (`send-order-settled-mail`), l'avis à l'invité, le
  remboursement d'une commande payée après annulation, les points (seulement
  si la commande est déjà retirée), la facture carte (seulement si elle est
  déjà retirée).
- **Une commande carte non payée n'entre pas au fournil** : `planWhere()`
  exclut `PAYMENTS_AWAITING` (`orders/infrastructure/plan-filter.ts`). Une
  commande carte **payée**, si : la nouvelle, payée et pas encore basculée,
  serait produite **en plus** de l'ancienne si la journée s'arrêtait entre
  les deux (trou non vu au §8).
- **Le fournil et le colisage recopient le numéro à l'inscription**
  (`ProductionOrder.reference`, `PackingOrder.reference`) ; ni la livraison ni
  le retrait n'en gardent une copie. Avant l'inscription, le numéro n'est
  copié que par les **alertes** (`alerts.prisma`, `order_number` figé), les
  **demandes clients** (`contact.prisma`, facultatif), les **factures**
  (nées au retrait seulement) et les courriels déjà partis. Stripe ne le porte
  pas (métadonnée `companyId` seule).
- **Le numéro** est `ORD-<rang>` (`order-number.ts`), unique en base ; un
  ancien format porte deux tirets (`ORD-MV84O2XA-Y9W3`).
- **L'expiration d'une carte non payée** ne vise que le particulier sans
  société (`unsettled-shop-order.where.ts`, clientèle `public`) : 30 min, et
  « la nouvelle passation du même particulier annule l'ancienne non réglée »
  (`replaceEarlier`, cause `replaced`, déjà écrite en base pour
  `order.payment_failed`).
- **Le noyau d'annulation** (`order-cancellation.service.ts`) ne connaît que
  deux acteurs (staff, client) et publie `OrderCancelledEvent`, dont les
  abonnés écrivent au client « votre commande est annulée ».

### 9.2 Le principe, en une image

```mermaid
sequenceDiagram
  participant C as Client ou équipe
  participant O as Commerce
  participant S as Stripe
  participant B as Bascule (abonné durable)
  C->>O: modifier ORD-12 (payée par carte)
  O->>O: nouvelle commande ORD-40, « remplace ORD-12 », en attente
  O-->>C: page de règlement de ORD-40
  C->>S: paie le nouveau total
  S->>O: webhook payé
  O->>O: markPaid ORD-40 + fait order.paid
  O->>B: order.paid (ORD-40 remplace ORD-12)
  B->>O: une transaction : ORD-12 devient ORD-12-R1, annulée, remboursement demandé
  B->>O: ORD-40 devient ORD-12, entre au plan
  O-->>C: courriel « votre commande a été modifiée »
  O->>S: remboursement intégral de l'ancien paiement
```

### 9.3 Les règles

- **P1 — Quand.** Une commande **carte** (payée, ou intention en attente) se
  remplace aux mêmes conditions qu'une révision M1 : qui (client jusqu'à
  l'heure limite, équipe jusqu'à la préparation), quoi (R1–R7 de M1, prix
  figés des lignes déjà présentes), et **seulement avant l'inscription au
  plan** (`status = placed`, non inscrite). Après : la demande M4, que
  l'équipe ne peut appliquer sur une carte qu'en annulant (pas de complément
  après l'arrêt).
- **P2 — La nouvelle commande.** Composée par `OrderRevising.compose` (la
  même recomposition que M1), écrite comme une **commande neuve** par le
  chemin de passation carte existant (intention, page de règlement), avec :
  `replaces_order_id` → l'ancienne (migration additive), `replacement_state =
awaiting_payment` (enum neuf, nul pour toute autre commande), son propre
  numéro de compteur (provisoire), et **l'auteur de la modification**
  (`replaced_by_kind` / `_user_id` / `_staff_id`), qui sera celui de la
  bascule — il n'y a jamais d'acteur « système ».
- **P3 — Une seule à la fois.** Index unique partiel sur `replaces_order_id`
  où `replacement_state IN ('awaiting_payment','awaiting_swap')`. Une seconde
  modification pendant l'attente est refusée (« une modification attend déjà
  son règlement : réglez-la ou abandonnez-la »), avec un geste
  « abandonner ».
- **P4 — Invisible tant qu'elle n'a pas basculé.** `planWhere()`, le dossier
  du jour, la file du comptoir, les listes client et staff **excluent**
  `replacement_state IN ('awaiting_payment','awaiting_swap')`. L'ancienne
  porte, en lecture, « modification en attente de règlement » avec le lien
  de paiement. _(Raison : lève le trou du 9.1 — une nouvelle payée n'est
  jamais produite avant d'avoir pris la place de l'ancienne.)_
- **P5 — Le paiement ne fait que payer.** Le webhook reste tel quel
  (`markPaid` + `order.paid`). Si la commande payée est un remplacement,
  `markPaid` la passe aussi à `awaiting_swap` dans la même écriture.
  _(§8 objection 1 : aucun refus métier dans la transaction du webhook.)_
- **P6 — La bascule** est un abonné durable de `order.paid`
  (`orders.swap-replacement.on-paid`), qui ne fait rien pour une commande
  ordinaire. Dans **une** transaction, verrous dans l'ordre : ligne `orders`
  de l'ancienne, puis de la nouvelle, puis le bon (P9) :
  1. rejuger l'ancienne : toujours `placed`, non inscrite, non annulée ;
  2. l'ancienne prend le numéro d'archive `<N>-R<k>` (k = nombre de
     remplacements déjà faits + 1), `status = cancelled`, motif
     `superseded` (valeur ajoutée à la contrainte `cancelled_by_kind`,
     l'auteur de P2 recopié), et `superseded_by_order_id` ;
  3. si l'ancienne était payée : demande de remboursement, cause neuve
     `superseded`, montant = tout le remboursable, par
     `CancellationRefundRequester` (le même exécuteur) ;
  4. si l'ancienne était une carte non payée : son intention est fermée
     **avant** la transaction (`cancelIntent`, hors verrou) ; `already_paid`
     ⇒ on rejoue la bascule comme pour une payée (le webhook de l'ancienne
     l'aura marquée payée, la demande de remboursement la couvre) ;
     `in_progress` / `unavailable` ⇒ l'abonné échoue et la boîte d'envoi le
     rejoue ;
  5. la nouvelle prend le numéro `<N>` et `replacement_state = swapped` ;
  6. faits durables : `order.superseded` (ancienne → nouvelle, auteur), et
     `CommerceOrderCancelledFact` pour l'ancienne + le fait de passation que
     la livraison lit pour la nouvelle (les mêmes que M1 publie pour un
     changement d'acheminement).
- **P7 — La bascule refusée.** Si 1. échoue (ancienne inscrite entre-temps,
  annulée par ailleurs) : la nouvelle est annulée et intégralement
  remboursée (cause `superseded`, même chemin), `replacement_state =
abandoned`, et le client reçoit « votre modification n'a pas pu être
  appliquée : votre commande ORD-12 reste telle quelle, le nouveau paiement
  vous est remboursé ». L'équipe reçoit la cloche.
- **P8 — L'abandon.** Une nouvelle non payée meurt comme une carte non payée,
  **quelle que soit la clientèle** : 30 min, ou dès l'inscription de
  l'ancienne au plan, ou au geste « abandonner » — intention fermée, puis
  `replacement_state = abandoned`. Rien ne change pour l'ancienne.
  `replaceEarlier` (le particulier qui repasse commande) **ignore** les
  remplacements dans les deux sens.
- **P9 — Le bon de fidélité.** La nouvelle est **calculée** avec le bon de
  l'ancienne (même déduction), mais ne le **porte** pas avant la bascule ; la
  bascule le **déplace** (colonne de l'ancienne → nouvelle) sous le verrou du
  titulaire, sans libération ni restitution. P7 et P8 n'y touchent pas : il
  n'a jamais quitté l'ancienne. _(§8 objection 3.)_
- **P10 — Total nul.** Une nouvelle à total nul n'a pas de paiement : la
  bascule se fait à sa passation, dans la même requête, par le même service.
  _(§8 objection 5.)_
- **P11 — Ce que dit chaque abonné de `order.paid`** pour un remplacement :
  l'accusé de réception et l'avis à l'invité **se taisent** (le courriel est
  celui de la bascule) ; les points et la facture carte ne changent pas
  (la commande n'est pas retirée) ; le remboursement « payée après
  annulation » ne voit rien (la nouvelle n'est pas annulée).
- **P12 — Les courriels.** Un modèle neuf `customer.order-modified`
  (« votre commande ORD-12 a été modifiée — l'ancien paiement de X € vous est
  remboursé, sous 5 à 10 jours ») à la bascule, et
  `customer.order-modification-failed` pour P7. Aucun « annulée ».
- **P13 — Ce que voit chacun.** Le client : ORD-12, à jour, avec
  « modifiée le … ; ancien paiement remboursé ». L'équipe : ORD-12 et, dans
  son historique, ORD-12-R1 « remplacée ». Le journal porte
  `order.superseded` avec ses deux identifiants et ses deux numéros.
- **P14 — L'équipe qui modifie une commande carte** : la nouvelle est créée,
  et son lien de paiement part au client (`create-payment-link`, existant) ;
  l'écran le dit. L'équipe ne paie pas à la place du client.

### 9.4 Les lots

| Lot      | Contenu                                                                                                                                                                                        |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **M2.1** | Serveur : migration (colonnes, enum, index partiel, causes `superseded`), création de la nouvelle (P2–P4), `markPaid` → `awaiting_swap` (P5), bascule et refus (P6, P7), total nul (P10), P11. |
| **M2.2** | L'abandon (P8) et le bon (P9).                                                                                                                                                                 |
| **M2.3** | Courriels (P12, trois langues), écrans boutique et back-office (P3, P4, P13, P14).                                                                                                             |

### 9.5 Ce qui reste à décider (Hugo)

1. **Le client avance deux fois le montant** : il paie le nouveau total
   avant d'être remboursé de l'ancien (5 à 10 jours selon sa banque). Un
   plafond de carte peut refuser. Accepté ?
2. **Le numéro d'archive** `ORD-12-R1` a deux tirets, comme l'ancien
   format : à vérifier que rien ne le prend pour un ancien numéro ; et le
   numéro provisoire de la nouvelle (`ORD-40`) laisse un trou dans la suite.
   Acceptable ?
3. **Après l'arrêt du plan**, une commande carte ne se modifie pas (P1) :
   la demande M4 s'y applique en annulant et en repassant. D'accord ?

## 10. Le §9 contredit par `vitruve` (2026-11-09) — rien n'est bâti

Les cinq bloquants du §8 sont levés sur le papier ; quatre nouveaux, et sept
sérieux.

**Bloquants**

1. **`ORD-12-R1` est refusé par la base** : `orders_order_number_format`
   (`20261025120000_le_numero_de_commande_a_son_format`) n'admet que
   `ORD-<n>` ou l'ancien format ; deux lecteurs analysent le numéro
   (`inbound-message.ts`, `delivery-note-number.ts`).
2. **« Non inscrite » ne se lit pas sur `orders.status`** : le fournil prend
   ses `orderIds` à l'arrêt, le commerce les absorbe plus tard
   (`on-production-day-closed.handler.ts`). La bascule doit passer, comme M1,
   par `OrderInscriptionReader` sous le verrou de la journée — de l'ancienne
   ET de la nouvelle.
3. **La journée de la nouvelle n'est jamais rejugée** : arrêtée pendant
   l'attente, elle bascule sans être au plan.
4. **Une nouvelle de pro abandonnée puis payée tard** repasse à `paid`
   (`PAID_FROM` admet `failed`), invisible, jamais remboursée.

**Sérieux** : P11 oublie l'avis au principal d'un site
(`notify-principal-on-order-paid`) ; la passation de la nouvelle publie déjà
ses faits (journal de croissance, alertes, rattachement à la livraison) ;
**P4 n'a pas de mécanisme** — une cinquantaine de lecteurs de `orders` ne
passent par aucun fragment partagé (vitrine, comptoir, listes, livraison,
croissance, fiche client) ; le motif `superseded` ne peut pas vivre dans
`cancelled_by_kind`, qui porte l'acteur ; le bon a un index unique
« vivant » qui impose un ordre, et sa déduction change si le nouveau total
passe sous sa valeur ; la bascule recopierait le noyau d'annulation ; les
valeurs d'enum sont à figer avant le merge.

### Ce que ça dit du remplacement

Les bloquants 1 à 4 se lèvent chacun en quelques lignes. Le coût est ailleurs :
**une seconde ligne `orders` vivante** que cinquante lecteurs, et les faits
de passation, voient déjà. La rendre invisible demande un fragment partagé et
une porte qui le tienne partout — c'est la plus grosse part du chantier, et
la plus facile à rater.

**L'autre forme, à éprouver avant de choisir** : garder **la même ligne** —
même numéro, même bon, aucune invisibilité à tenir — et ne multiplier que le
paiement. La modification est un **projet** (lignes révisées + une nouvelle
intention au nouveau total) ; au paiement, la révision M1 s'applique à la
commande, et l'**ancienne intention** est remboursée en entier
(`refundRemainder` le sait, par intention). Le coût passe dans le paiement :
une table des intentions d'une commande (le webhook retrouve la commande par
n'importe laquelle), une demande de remboursement par intention et non plus
par commande, le plafond lu sur l'encaissé et non sur `total_cents`, et une
cause qui dit au rapprochement comptable de ne pas émettre d'avoir. Non écrit,
non contredit.
