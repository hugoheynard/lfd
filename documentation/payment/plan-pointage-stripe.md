# Plan — pointer chaque ligne Stripe (description, commande, client)

> 🚧 **En cours** (2026-11-26) : les lots 1 à 3 sont bâtis ; les lots 4 et 5,
> et la décision D4, restent. Contredit par `vitruve` le même jour : ses
> objections sont intégrées ci-dessous (§ 5), les décisions qu'elles demandent
> sont au § 6.

## 1. Le besoin

Dans le Dashboard Stripe, les paiements, les compléments après modification de
commande et les remboursements portent bien leur montant, mais **ni
description, ni client, ni email, ni nom de facturation**. Hugo, le
2026-11-26 : « on doit pouvoir pointer ». Chaque ligne Stripe doit se
rapprocher sans ambiguïté :

- d'une **commande** (son numéro lisible, pas seulement un identifiant interne) ;
- de l'**application d'origine** (boutique, pro, saisie staff, lien de paiement) ;
- du **type de mouvement** (paiement initial, complément, lien, remboursement) ;
- du **client** qui a payé.

## 2. L'existant (vérifié le 2026-11-26)

| Appel Stripe                  | Fichier                                                                              | Ce qui part aujourd'hui                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| `paymentIntents.create`       | `apps/lfd-api/src/payment/card/infrastructure/stripe/stripe-card-provider.ts:67`     | `amount`, `currency`, `payment_method_types: ["card"]`, `metadata.companyId` (= `tag` : `companyId`, `personal` ou `pay-link:<id>`) |
| `refunds.create`              | `apps/lfd-api/src/payment/card/infrastructure/stripe/stripe-refund-calls.ts:73`      | `amount`, `reason`, `metadata` `lfd_refund_request`, `lfd_generation`, `lfd_order_id` (= le SUJET, `order:ord_…`)                   |
| `confirmPayment` (navigateur) | `apps/lfc-ecommerce-frontend/src/app/client/payment-collection/card-collector.ts:99` | rien d'autre que `elements`                                                                                                         |

Un remboursement n'a pas de client à lui : Stripe affiche celui de la
`PaymentIntent` d'origine. Corriger la création corrige donc aussi l'affichage
des remboursements.

`CardPayments.prepare(subjectType, amountCents, tag)`
(`apps/lfd-api/src/payment/channels/requests/card-payments.ts`) a **cinq
appelants** :

| #   | Appelant                                                                                  | Application      | Type       |
| --- | ----------------------------------------------------------------------------------------- | ---------------- | ---------- |
| 1   | `lafoliecoffee/orders/application/services/order-settlement.ts:53` (passation pro)        | pro              | initial    |
| 2   | `lafoliecoffee/orders/application/commands/place-shop-order.handler.ts:324`               | boutique         | initial    |
| 3   | `lafoliecoffee/orders/application/services/staff-order-placement.ts:289`                  | saisie staff     | initial    |
| 4   | `lafoliecoffee/orders/revision/application/commands/propose-card-increase.handler.ts:139` | pro / boutique   | complément |
| 5   | `payment/link/application/commands/start-pay-link-payment.handler.ts:126`                 | lien de paiement | lien       |

🔴 **Le numéro de commande n'existe pas quand Stripe est appelé** pour 1, 2 et
3 : `prepare` part hors transaction, **avant** l'insertion qui attribue le
numéro. Pour 4 (complément) et 5 (lien), la commande existe déjà.

## 3. Décisions prises

- **D1 (Hugo, 2026-11-26)** — l'email du client part sur un **Customer Stripe**
  et en métadonnées, **jamais** en `receipt_email` : Stripe n'envoie aucun reçu
  en plus des e-mails de la plateforme.
- **D2** — le bloc `payment` reste agnostique (CLAUDE.md § 3) : il reçoit un
  **libellé** composé par l'appelant, sans savoir ce qu'est une commande.

## 4. Le plan

### Lot 1 — le libellé à la création

`prepare(subjectType, amountCents, tag, label)`, avec :

```ts
interface CardPaymentLabel {
  /** Ex. « LFD · La Folie Coffee boutique · Commande n° 2026-01234 · complément ». */
  readonly description: string;
  /** Clés de l'appelant, préfixées et validées par le bloc (§ 5, obj. 8). */
  readonly metadata: Readonly<Record<string, string>>;
  /** Le payeur, s'il est connu et que c'est bien lui qui paie (§ 5, obj. 6). */
  readonly payer?: { readonly userId: string; readonly name: string; readonly email: string };
}
```

Stripe reçoit `description`, `metadata` (`companyId` conservé, plus `app`,
`kind`, `subject_id`, et `order_number` quand il existe déjà : complément,
lien) et **`customer`** dès la création (§ 5, obj. 4).

### Lot 2 — le numéro de commande après l'enregistrement ✅

Pour les appelants 1, 2, 3 : une fois la commande enregistrée,
`paymentIntents.update` pose la `description` définitive
(`LFD · La Folie Coffee <canal> · Commande n° X · paiement`) et les
métadonnées `order_number` et `subject_id` (Stripe fusionne : `companyId`,
`app`, `channel`, `kind` restent). **Rien d'autre** : ni montant, ni client,
posé au lot 1.

**Qui déclenche.** L'abonné est **côté commerce**, pas côté `payment` : la
matrice du § 3 de `CLAUDE.md` interdit `payment → lafoliecoffee`, et le bloc ne
sait pas ce qu'est une commande (D2). `DescribeCardPaymentOnOrderPlaced`
(`lafoliecoffee/orders/application/handlers/`) est un `@DurableHandler` de
`commerce.order_placed`, le fait que toutes les passations écrivent dans leur
transaction (passation pro, boutique, saisie staff — dont la saisie pour un
client et la conversion d'un reliquat, par `StaffOrderPlacement`). Il relit la
commande, ne fait rien sans intention (différée, au compte, gratuite, au
comptoir), compose le libellé (`order-card-label.ts` : le canal est
`staff` pour une commande d'origine `back_office`, sinon `pro` ou `shop`
selon la société) et appelle le port du canal
`CardPaymentLabels.describe(sujet, providerRef, libellé)` — un port à part de
`CardPayments` (ISP).

**Ce que fait `payment`.** Dans la transaction de l'abonné, il garde le
libellé dans `payment.card_intent_relabel` (une ligne par paiement,
migration `20261126150000_le_libelle_definitif_de_l_intention`, clé vers
`card_payment` en `CASCADE`) — seulement si l'intention est bien un paiement de
ce sujet. Après validation, `IntentRelabelPoster` appelle
`CardProvider.describeIntent` hors transaction (`assertOutsideTransaction`
sur `Stripe.paymentIntents.update`). Le balayage
`admin/card-payments/labels/sweep` (cron de rafraîchissement du Worker, toutes
les cinq minutes) reprend ce qui n'a pas abouti.

**Idempotence et reprises.** L'agrégat `IntentRelabel` porte les règles : un
libellé identique ne relance rien (fait relivré), un libellé différent monte la
**révision**, et chaque écriture se conditionne à la révision lue — un essai
lancé sur l'ancien libellé ne conclut rien. Une panne (`unavailable`) se
reprend après 5 min, doublées jusqu'à 6 h ; huit essais au plus. Un refus du
prestataire (`refused` : intention inconnue, requête invalide) ou les essais
épuisés : `abandoned`, journalisé par identifiants seuls, le paiement jamais
touché.

**L'écho du webhook.** Un `payment_intent.updated`, si l'endpoint y est
abonné, est réduit en `other` (`stripe-event-reduction.ts`) : le bloc en écrit
un fait `card_payment.unmatched` sans remboursement, que
`OnRefundWithoutOrder` ignore. Aucun paiement n'en bouge ; c'est une ligne de
journal par mise à jour.

### Lot 3 — les remboursements ✅

Métadonnées `order_number` et `app` en plus. Les clés `lfd_*` existantes ne
bougent pas : `isOurs` (`stripe-refund-calls.ts`) et la réduction des
événements les lisent. `lfd_order_id` porte le **sujet** (`order:ord_…`),
`order_number` le **numéro lisible** : les deux coexistent.

Le numéro vient du sujet, opaque pour le bloc : `SubjectDescription` (le port
retour, `payment/channels/subjects/`) porte des `metadata` facultatives, que
la commande remplit (`orderCardMetadata` : `app`, `order_number`). L'exécuteur
les lit sous ses verrous (`refundLabelOf`), les borne par
`IntentLabel.metadataOf` et les passe dans `RefundParams.labelMetadata` ;
l'adaptateur les pose AVANT les clés `lfd_*`, qui ne peuvent donc pas être
recouvertes. Une clé refusée ou un sujet qui ne se décrit pas : le
remboursement part sans clés de pointage, jamais bloqué. Le **canal** n'y est
pas : la lecture du sujet par le bloc ne le porte pas.

**Le lien de paiement** pose désormais `app = la-folie-coffee` (la valeur
`providerApp` de son origine, au registre `pay-link-origins.ts`) et garde
l'origine persistée sous `origin` (`lafoliecoffee`, `lafoliecoffee_test`) :
un seul filtre `app` réunit commandes, compléments, liens et remboursements.

### Lot 4 — le navigateur

Au plus le **nom** dans `billing_details`, et seulement s'il est cohérent avec
le Customer posé par le serveur. L'email ne part pas du navigateur : une seule
source, le serveur (§ 5, obj. 7).

### Lot 5 — RGPD

- Inscrire le flux « nom + email client → Stripe (Customer) » au registre et
  dans la politique de confidentialité. Phrase validée par Hugo le
  2026-11-26, écrite dans `../legal/texte-politique-de-confidentialite.md` ;
  elle reste à saisir au back-office (le texte publié vit en base).
- Ajouter au parcours « supprimer mon compte »
  (`documentation/legal/plan-supprimer-mon-compte.md`) la suppression ou
  l'anonymisation des Customers Stripe du client, **sur chaque compte**.

## 5. Objections de `vitruve` (2026-11-26) et réponses

| #   | Gravité  | Objection                                                                                                                                                                                | Réponse dans ce plan                                                                                                                                   |
| --- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | BLOQUANT | « Après le commit, au mieux » ne dit pas qui déclenche. Un fait du commerce lu par `payment` traverse un bloc (`durable-cross-block`) ; un appel direct perd le libellé sur un plantage. | Lot 2 : abonné durable, idempotent, reprises bornées.                                                                                                  |
| 2   | BLOQUANT | `customers.search` relit avec du retard (environ une minute) : deux commandes rapprochées feraient deux Customers. Un Customer appartient à UN compte Stripe, et il y en a plusieurs.    | Correspondance `(compte, lfd_user_id) → customer` gardée dans le schéma `payment`, création avec une clé d'idempotence déterministe. Pas de recherche. |
| 3   | SÉRIEUX  | La porte `rgpd-staff` ne voit que des colonnes ; le Customer survit à la suppression du compte.                                                                                          | Lot 5.                                                                                                                                                 |
| 4   | SÉRIEUX  | `update` d'une intention déjà `succeeded` avec `customer` : non garanti.                                                                                                                 | Customer posé au lot 1, à la création. Le lot 2 ne pose que `description` et `metadata`.                                                               |
| 5   | SÉRIEUX  | Les intentions adoptées ou rejouées (`provider-payment-resolver.ts`, `block-card-payments.ts`, `replay-first-payments.handler.ts`) n'auraient aucun libellé.                             | Décision D4 (§ 6).                                                                                                                                     |
| 6   | SÉRIEUX  | Lien et saisie staff : le payeur peut être anonyme, ou ne pas être le client de la commande.                                                                                             | Décision D5 (§ 6).                                                                                                                                     |
| 7   | SÉRIEUX  | `billing_details` côté navigateur : une adresse non vérifiée, une seconde source.                                                                                                        | Lot 4 réduit au nom.                                                                                                                                   |
| 8   | SÉRIEUX  | Métadonnées libres : limites Stripe (50 clés, 40 caractères par clé, 500 par valeur) et collision possible avec `companyId` / `lfd_*`.                                                   | Le bloc préfixe, borne et réserve ses clés.                                                                                                            |
| —   | MINEUR   | `log-no-email` ne couvre peut-être pas le nom.                                                                                                                                           | Ne journaliser que les identifiants.                                                                                                                   |

Ce que `vitruve` n'avait pas vérifié est tranché au lot 2 : un
`payment_intent.updated` est réduit en `other`, sans effet sur un paiement ;
et l'abonné vit côté commerce, ce que `lint:durable-cross-block` admet pour un
`@DurableHandler`.

## 6. Décisions encore ouvertes

- **D3** — le **format de la description**. Proposition :
  `LFD · <application, ex. La Folie Coffee> <canal> · Commande n° <numéro> · <type>` — décidé par Hugo le 2026-11-26. Métadonnées `app` (`la-folie-coffee`) et `channel` séparées.
- **D4** — l'**historique** : un rattrapage idempotent des intentions adoptées
  ou anciennes, ou l'aveu écrit que le pointage ne couvre que les nouveaux
  paiements.
- **D5** — le **payeur** de chaque appelant :
  - pro, boutique, complément : l'acheteur connecté ;
  - saisie staff : le client de la commande, ou aucun si c'est un tiers qui paie
    au comptoir ;
  - lien de paiement : aucun Customer (payeur anonyme), seulement le numéro et
    l'application.
