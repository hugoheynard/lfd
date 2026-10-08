# Plan — la facture d'une commande payée par carte, et les remboursements

> 📐 **Plan v2, 2026-10-08** (v1 contredite par `vitruve` le même jour : quatre BLOQUANTS, neuf SÉRIEUX, repris au § 8 et dans le § 2 bis qui prime sur les §§ 2 à 4), écrit en l'absence d'Hugo (« fais tout, tiens
> une liste des questions arbitrées »). Lot **E5** de
> [`plan-emission-de-la-facture.md`](plan-emission-de-la-facture.md), qui
> l'attendait derrière « le suivi des remboursements ». Touche **l'argent** :
> contredit par `vitruve` avant d'être bâti (§ 8). Arbitrages reportés dans
> [`../arbitrages-en-absence.md`](../arbitrages-en-absence.md).

## 1. Ce qui existe (vérifié le 2026-10-08)

- **Aucun remboursement n'est suivi.** `PaymentStatus` a une valeur
  `refunded` que **rien n'écrit** (grep des écritures : aucune). Le webhook
  (`stripe-payment-gateway.ts`) ne réduit que `payment_intent.succeeded`,
  `…payment_failed` et `checkout.session.*` ; tout le reste est `ignored`.
  Un remboursement fait dans le tableau de bord Stripe est invisible ici.
- Une commande payée après son annulation sonne la cloche
  (`RingRefundDue`) : un humain rembourse **dans Stripe**.
- **Le retrait est un fait durable** : `OrderHandedOverEvent`
  (`b2b/orders/domain/events/order-handed-over.event.ts`), écouté par
  `on-order-handed-over.handler.ts`. Même bloc que la comptabilité (`b2b`).
- **La facture et l'avoir existent** : `Invoice.issue`, `Invoice.creditNote`
  (avoir sur une facture, plafonné par les avoirs antérieurs :
  `assertWithinCorrected`), numérotation sans trou, PDF (E3b), e-mail (E6).
- **Le régime** d'une commande est figé à la passation
  (`settlement-regime.ts` : `paid | due | account | free`).

## 2. La règle

| Régime            | Facture                                     | Remboursement                     |
| ----------------- | ------------------------------------------- | --------------------------------- |
| Pro **au compte** | facture du mois (E4)                        | hors champ : pas de carte         |
| Pro **par carte** | **une facture par commande, à son retrait** | **un avoir** du montant remboursé |
| Public            | jamais (ticket)                             | suivi, sans avoir                 |

- **La facture suit la livraison, pas le paiement** (plan § 4) : un paiement
  avant retrait est un acompte. Émise par un abonné durable de
  `OrderHandedOverEvent`, pour une commande `clientele = pro` dont le régime
  est `paid` (carte encaissée). Date = jour local du retrait, jamais antidatée
  (règle d'E4).
- **Tout remboursement après la facture produit un avoir** de son montant,
  ventilé par taux de TVA au prorata de la facture (reste le plus fort,
  `invoiceVatBreakdown`), une ligne par taux, libellé « Remboursement ». Un
  avoir reste plafonné à ce que la facture n'a pas déjà corrigé.
- **Un remboursement avant le retrait** est noté et ne produit rien tout de
  suite ; au retrait, la facture est émise sur le **total**, puis l'avoir
  suit aussitôt. Une commande remboursée **en totalité** avant son retrait
  n'est pas facturée (pas de vente).
- **Le remboursement lui-même reste un geste Stripe** (tableau de bord) :
  on le **constate**, on ne l'initie pas. Initier un remboursement depuis le
  back-office est un autre chantier.

## 2 bis. Ce que la v2 change (prime sur les §§ 2 à 4)

1. **Deux déclencheurs, un seul émetteur.** Une facture carte naît quand la
   commande est **retirée ET payée**, dans l'ordre qu'on voudra : l'abonné de
   `order.fulfilled` (l'événement `OrderHandedOverEvent` des **commandes**,
   un par commande — pas `handover.handed_over`, émis à chaque geste)
   émet si la commande est déjà payée ; l'abonné du paiement réussi émet si
   elle est déjà retirée. Les deux appellent la même commande
   `IssueCardInvoice(orderId)`, **sans effet** si une facture 380 couvre déjà
   le bon (lecture avant émission, sous verrou de la ligne de commande ;
   l'unicité `invoice_order` reste le filet, jamais le chemin normal).
2. **Date d'émission = jour de l'émission** (`Clock`), jamais le jour du
   retrait : un rejeu après minuit ne heurte plus la chronologie
   (`last_issued_on`). Le jour du retrait est la **date de livraison**
   (BT-72) imprimée sur la facture.
3. **Webhook** : `refund.created`, `refund.updated`, `refund.failed`.
   `charge.refunded` ne porte plus la liste des remboursements depuis l'API
   2022-11-15. **Seul `status = succeeded` compte** ; `currency ≠ eur` est
   refusé et signalé. Un remboursement `pending` est noté, sans avoir.
4. **Une facture carte est acquittée.** `InvoiceState` gagne le montant
   déjà payé (**BT-113**, `PrepaidAmount`) et un moyen « carte » (code UNTDID
   4461 **48**) ; le XML écrit `DuePayableAmount = 0`, le PDF « Facture
   acquittée le … par carte ». Échéance = jour du paiement. Les mentions de
   pénalités restent exigées (art. L441-9 : toute facture entre
   professionnels), donc le blocage `payment_terms_missing` reste.
5. **L'avoir d'un remboursement** est ventilé au **prorata** des bases de la
   facture par taux (Stripe ne dit pas quel produit est rendu) — **question
   au cabinet** ; et **le remboursement qui solde la commande prend le
   reste exact** par taux (base et TVA), pour que la somme des avoirs égale
   la facture au centime et que `assertWithinCorrected` ne refuse jamais le
   dernier.
6. **Rien ne boucle.** Une facture carte impossible (acheteur sans SIREN ou
   TVA, pas d'émetteur : `invoiceIssuanceBlockers`) est **signalée** dans
   une table d'issues (`card_invoice_outcome`, comme
   `invoice_monthly_outcome`), visible à l'écran, et rejouable par un bouton ;
   l'abonné termine sans lever.
7. **Le rapprochement est un balayage**, pas un effet de bord : après chaque
   facture carte et chaque remboursement `succeeded`, `ReconcileRefunds(orderId)`
   émet un avoir pour chaque remboursement sans `credit_note_id` dont la
   commande a une facture. Sous verrou de la commande ; il rattrape donc
   aussi un remboursement noté avant le retrait.
8. **L'acheteur est le payeur légal** (`billedPayerOf`, comme la facture du
   mois), pas la société du site.
9. **`clientele` nul** (commandes anciennes) : une commande **avec société**
   est pro, sans société est publique.
10. **Remboursement d'un lien libre** : pas d'avoir automatique, il est
    noté et la cloche sonne (un lien peut solder un impayé facturé au mois :
    l'avoir est alors un geste humain).

## 3. Le modèle

Table `order_refund` (schéma `public`, contexte `b2b/orders`), une ligne par
remboursement Stripe :

| Colonne            | Règle                                             |
| ------------------ | ------------------------------------------------- |
| `id`               | ULID                                              |
| `order_id`         | la commande                                       |
| `stripe_refund_id` | `re_…`, **unique** : clé d'idempotence du webhook |
| `amount_cents`     | entier > 0                                        |
| `refunded_at`      | instant Stripe (`created`)                        |
| `recorded_at`      | `Clock`                                           |
| `credit_note_id`   | nullable : l'avoir qui l'a constaté               |

- `Σ amount_cents ≤ total encaissé` : refusé par l'agrégat (un excès est une
  panne qui se voit, pas un avoir faux).
- `paymentStatus` passe à **`refunded`** quand la somme atteint le total ;
  un remboursement partiel ne change pas le statut (la commande reste
  `paid`), et l'écran affiche « remboursée en partie (x €) ».
- Rien ne se supprime : un remboursement annulé ou en échec chez Stripe est
  noté par son statut (voir § 2 bis, Q3).

## 4. Le webhook

- Événements : **`charge.refunded`** (porte la liste des `refunds`) et
  **`refund.updated`** (échec ou annulation d'un remboursement). Le port
  réduit chaque remboursement à `{ kind: "refunded", paymentIntentId,
refundId, amountCents, at, status }`.
- Idempotence par `stripe_refund_id` ; un remboursement inconnu de nos
  commandes (paiement d'un lien libre) est ignoré et journalisé.
- **Runbook** : abonner le webhook de production à ces deux événements.

## 5. Les faits et le journal

- `order.refund_recorded` (montant, cumul) et `order.fully_refunded` au
  journal de la commande.
- `invoice.issued` pour la facture carte (E6 prévient le payeur, E3b rend le
  PDF) ; `invoice.credit_note_issued` pour l'avoir.

## 6. Les écrans

- Fiche commande (back-office) : les remboursements et l'avoir de chacun.
- Espace client : les factures **et avoirs** dans « Mes factures » (E6).

## 7. Questions — arbitrées en l'absence d'Hugo

- **Q1** — Facturer à la livraison, même payé avant ? **Oui** (déjà dans le
  plan d'émission, § 4).
- **Q2** — Une commande pro par carte remboursée en totalité avant retrait :
  facture + avoir, ou rien ? **Rien** : pas de livraison, pas de vente.
- **Q3** — Un remboursement qui **échoue** après son avoir ? Impossible en v2 :
  l'avoir n'est émis que sur `succeeded`. Un remboursement réussi puis
  contesté reste hors champ (litige bancaire, PA5).
- **Q4** — Le public : suivre ses remboursements sans facture ? **Oui** (statut
  et journal), pas d'avoir.

## 8. Contradiction (`vitruve`)

v1 contredite le 2026-10-08. **BLOQUANTS, corrigés** : retrait avant
paiement jamais facturé (§ 2 bis-1) ; date d'émission confondue avec la
livraison (2) ; `charge.refunded` sans la liste des remboursements (3) ;
facture carte rendue comme due (4). **SÉRIEUX, corrigés** : dernier avoir
refusé par l'arrondi (5) ; abonné qui boucle sur une facture impossible
(6) ; course retrait/remboursement (7) ; acheteur non nommé (8) ; événement
ambigu (1) ; `clientele` nul (9) ; Q3 (§ 7). **Assumé, au cabinet** : le
prorata de l'avoir (5). **MINEUR** : un remboursement total laisse le régime
`paid`, l'écran lit `paymentStatus` ; lien libre (10).

## 9. Lots

| Lot     | Contenu                                                                                          |
| ------- | ------------------------------------------------------------------------------------------------ |
| **R1**  | `order_refund`, webhook `charge.refunded` / `refund.updated`, statut `refunded`, journal         |
| **E5a** | facture carte acquittée (BT-113, code 48) au retrait ET paiement, issues signalées, rejouables   |
| **E5b** | avoir de remboursement (ventilé au prorata), et facture puis avoir pour un remboursement d'avant |
| **E5c** | écrans : fiche commande, « Mes factures » avec les avoirs                                        |
