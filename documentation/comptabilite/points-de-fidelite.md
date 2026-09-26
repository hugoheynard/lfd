# Les points de fidélité

> État : **partiellement implémenté** au 2026-09-26. Le programme se **gagne**
> et se **règle**, mais ne se **convertit** ni ne s'**utilise** encore (§8).
> Écrit à l'affirmative le 2026-09-26, chaque phrase confrontée au code ce
> jour-là. Commits : `1057ecfa3` (grand livre, bons, réglage),
> `b862ee9fb` (écran), `9f1ebf2c8` (crédit), `2fe402b2e` (passage de nuit).
>
> L'histoire — la demande, les deux contradictions de `vitruve`, les réponses de
> Hugo — est dans [`plan-points-de-fidelite.md`](plan-points-de-fidelite.md).
> Ce document dit ce que le code **fait**.

## 1. En une phrase

Une commande **remise et payée** crédite ses points à son **titulaire**, à
raison d'un point par centime de marchandises TTC. Les points se convertissent
en **bons d'achat** par paliers entiers, à un ratio réglé dans
**Comptabilité › Fidélité**. Tant que ce réglage n'est pas enregistré, le
programme est **fermé** : rien ne se gagne, et rien ne se convertit.

```mermaid
flowchart LR
  subgraph orders["b2b/orders"]
    H["remise<br/>OrderHandedOverEvent"]
    P["règlement Stripe<br/>OrderPaymentSettledEvent"]
    R["CompletedOrderReader<br/>fulfilled ∧ paid"]
  end
  subgraph loyalty["b2b/loyalty"]
    C["OrderPointsCrediting<br/>verrou du titulaire"]
    L[("loyalty_ledger_entries")]
    V[("loyalty_vouchers")]
    S[("loyalty_settings")]
  end
  H --> C
  P --> C
  N["cron 02 h UTC<br/>POST /admin/loyalty/sweep"] --> C
  C -->|lit par le port| R
  C -->|+ earned| L
  S -.ratio, clientèles.-> C
  L -->|conversion, lot E1| V
```

## 2. Le vocabulaire

| Terme                   | Ce que c'est                                                                                          | Dans le code                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------ |
| **titulaire**           | à qui appartiennent les points : la **société** pour une commande pro, la **personne** pour le public | `LoyaltyHolder` (`company` / `user`) |
| **grand livre**         | la suite des mouvements de points d'un titulaire ; on n'y efface rien                                 | `loyalty_ledger_entries`             |
| **solde**               | la **somme** du grand livre — aucune colonne ne la stocke                                             | `LoyaltyAccount`                     |
| **palier**              | l'unité de conversion : `pointsPerStep` points valent `stepValueCents` centimes TTC                   | `LoyaltyRatio`                       |
| **bon d'achat**         | un montant fixe en euros, issu d'une conversion, qui fige son ratio                                   | `LoyaltyVoucher`                     |
| **commande définitive** | une commande à la fois `fulfilled` et `paid`                                                          | `CompletedOrderReader`               |

## 3. Le stockage

Trois tables du schéma `public` (`prisma/schema/public/loyalty.prisma`,
migration `20260926160000_la_fidelite`, purement additive).

### `loyalty_settings` — le réglage, une ligne

| Colonne                             | Sens                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `id`                                | toujours `'default'` (`CHECK`)                                                 |
| `points_per_step`                   | points d'un palier, entier > 0                                                 |
| `step_value_cents`                  | valeur TTC d'un palier, entier > 0                                             |
| `open_to_public`                    | la clientèle publique gagne et convertit                                       |
| `open_to_pro`                       | la clientèle pro — **refusée à l'écriture** (§7)                               |
| `voucher_validity_days`             | durée de validité d'un bon (365 au premier enregistrement proposé par l'écran) |
| `updated_at`, `updated_by_staff_id` | qui a posé le réglage, et quand                                                |

**Aucune ligne n'est semée.** L'absence de ligne _est_ l'état « programme
fermé » : aucune valeur par défaut n'est inventée.

### `loyalty_ledger_entries` — le grand livre

| Colonne                   | Sens                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `company_id` / `user_id`  | le titulaire — **exactement un des deux** (`CHECK`)            |
| `kind`                    | `earned`, `converted` ou `adjusted`                            |
| `points`                  | entier **signé**                                               |
| `order_id`                | la commande d'un gain — identifiant opaque, sans clé étrangère |
| `voucher_id`              | le bon d'une conversion ou d'une annulation                    |
| `actor_user_id`           | la personne qui a converti (`ON DELETE SET NULL`)              |
| `staff_user_id`, `reason` | l'auteur et le motif d'un ajustement                           |

| `kind`      | Signe | Porte obligatoirement                | Unique par                   |
| ----------- | ----- | ------------------------------------ | ---------------------------- |
| `earned`    | > 0   | `order_id`                           | `order_id`                   |
| `converted` | < 0   | `voucher_id`                         | `voucher_id`                 |
| `adjusted`  | ≠ 0   | `staff_user_id` et un motif non vide | `voucher_id` si lié à un bon |

Les formes et les unicités sont des `CHECK` et des index partiels : une ligne
mal formée, ou un second crédit pour une même commande, est refusée par la
base, pas seulement par le code.

### `loyalty_vouchers` — les bons

Le titulaire (même `CHECK`), `value_cents`, `points_cost`, le **ratio figé**
(`ratio_points_per_step`, `ratio_step_value_cents`), `issued_at`,
`expires_at`, `status`, et les traces de fin de vie (`expired_at`,
`cancelled_at`, `cancelled_by_staff_id`, `cancellation_reason`).

- **Paliers entiers** (`CHECK`) : `value_cents` vaut exactement
  `points_cost / ratio_points_per_step × ratio_step_value_cents`. Seul un
  reliquat (`parent_voucher_id`, lot C) en est exempté.
- `expires_at > issued_at` ; une annulation porte son instant, son auteur et
  son motif ; une expiration porte son instant.

### Les clés étrangères

`company_id` et `user_id` sont en **`ON DELETE RESTRICT`** : un grand livre ne
s'efface pas. Aucun chemin applicatif ne supprime une société ou une personne
(vérifié le 2026-09-26). Les scripts de dev qui le font (`prisma/clone-dev.ts`)
vident d'abord les deux tables de fidélité, par un seul `TRUNCATE`.

## 4. Gagner des points

### La règle

`earningFor` (`domain/services/order-earning.ts`), une fonction pure :

| Situation                                            | Résultat                             |
| ---------------------------------------------------- | ------------------------------------ |
| aucun réglage                                        | rien — `program_closed`              |
| commande `pro`, `company_id` nul (société supprimée) | rien — `company_missing`             |
| commande `public` passée **sans compte** (invité)    | rien — `guest_buyer`                 |
| clientèle fermée au réglage                          | rien — `clientele_closed`            |
| assiette ≤ 0                                         | rien — `empty_basis`                 |
| sinon                                                | **assiette × 1** points au titulaire |

- **L'assiette** vaut `totalCents − deliveryFeeCents − lateFeeCents` : le TTC
  des marchandises après remises. Le port et la surtaxe ne rapportent rien.
- **Le titulaire** est `Order.companyId` pour `pro`, `Order.placedByUserId`
  pour `public`. Une `clientele` nulle (commandes d'avant ce champ) n'est
  jamais lue.
- **Un invité ne gagne rien** : `User.email` n'est pas unique, et ses points
  resteraient sur une fiche à laquelle personne ne peut se connecter.

### Quand : une commande définitive

Est définitive une commande `fulfilled` **et** `paymentStatus = paid`.
`not_required` **ne compte pas** : chez un pro, il veut dire « payé à terme »,
pas encaissé. Le port `CompletedOrderReader` (déclaré par `orders`) fait ce
filtre dans son `where`, et ne rend de l'identité de l'acheteur qu'un booléen
`buyerHasAccount`.

**Un seul chemin écrit `paid` sur une commande** (inventaire du 2026-09-26) :
le webhook Stripe `payment_intent.succeeded` → `ConfirmOrderPaymentHandler`
→ `markPaid`. Le comptoir n'écrit aucun règlement ; un lien de paiement libre
ne touche aucune commande.

### Comment : trois déclencheurs, une écriture

| Déclencheur                                    | Fichier                                       | Rôle                                |
| ---------------------------------------------- | --------------------------------------------- | ----------------------------------- |
| la remise (`OrderHandedOverEvent` du commerce) | `credit-points-on-handover.handler.ts`        | au fil de l'eau                     |
| le règlement (`OrderPaymentSettledEvent`)      | `credit-points-on-payment-settled.handler.ts` | au fil de l'eau                     |
| le rattrapage de nuit                          | `credit-pending-order-points.handler.ts`      | écrit ce que les abonnés ont manqué |

Les deux abonnés relisent l'état de la commande : le crédit n'a donc lieu
qu'au **second** des deux faits, quel que soit leur ordre. Ils passent par
`BackgroundWork`, qui **avale leurs échecs** : c'est pourquoi le rattrapage
existe. Il parcourt les commandes définitives par lots de 200, une
transaction par commande, et ne fait rien si le programme est fermé.

**L'écriture** (`OrderPointsCrediting.creditEarnedPoints`) :

1. prend le verrou du titulaire ;
2. relit, **sous ce verrou**, si la commande a déjà sa ligne `earned` ;
3. écrit la ligne et publie `loyalty.points_earned`, dans la même unité de
   travail.

Deux passages concurrents sur la même commande s'attendent, et le second ne
trouve rien à faire. L'index unique `(order_id) WHERE kind = 'earned'` est le
filet en base.

## 5. Convertir en bon d'achat

`ConvertLoyaltyPointsCommand` existe sur le bus et est éprouvée de bout en
bout. **Aucune route ne l'expose encore** (lot E1, §8).

1. **Qui peut** (`PrismaLoyaltyConversionGate`) :
   - pour une personne : elle-même, au statut `active` ;
   - pour une société : toute personne `active` qui y est rattachée, quel que
     soit son rôle, puisque le droit de commander n'a pas de rôle.
2. **Le verrou** : `pg_advisory_xact_lock` sur
   `loyalty.ledger:company:<id>` ou `loyalty.ledger:user:<id>`. L'espace de
   noms est propre, et le préfixe empêche un identifiant de société et un
   identifiant de personne de partager un verrou. Deux personnes d'une même
   société qui convertissent en même temps s'attendent.
3. **Sous le verrou**, le solde est relu, puis le bon et la ligne `converted`
   sont écrits dans la même transaction. **Le solde ne descend jamais sous
   zéro.**
4. **Le bon fige** son montant, son coût en points, son ratio, et sa date
   limite (`issued_at + voucher_validity_days`).

Changer le ratio ne modifie ni un bon émis, ni un nombre de points. Cela change
seulement ce que vaudront les **prochaines** conversions.

## 6. La vie d'un bon

```mermaid
stateDiagram-v2
  [*] --> available: conversion
  available --> expired: date limite passée
  available --> cancelled: geste motivé du staff
  available --> reserved: passation (lot C, pas bâti)
  reserved --> available: annulation de la commande (lot C)
```

| État        | Aujourd'hui                                                                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `available` | le seul état d'entrée                                                                                                                                                       |
| `expired`   | **lu à l'horloge** : un bon échu se lit expiré même si la base dit encore `available`. La nuit l'écrit (`ExpireLoyaltyVouchersCommand`, fait `loyalty.voucher_expired`).    |
| `cancelled` | par le staff, avec un motif, **seulement** si le bon est disponible et non échu. Ses points reviennent par une ligne `adjusted` liée au bon, une seule fois (index unique). |
| `reserved`  | **n'existe pas encore** : l'enum de la base ne le porte pas (lot C)                                                                                                         |

## 7. Le back-office

**Comptabilité › Fidélité**
(`apps/lfd-backoffice-frontend/src/app/comptabilite/fidelite/`), sous le droit
`b2b_accounting` : la lecture pour voir, l'écriture pour agir.

| Onglet           | Ce qu'on y fait                                                                                                                                                                                                        |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Réglage**      | poser le ratio (valeur saisie en euros, envoyée en centimes entiers), les clientèles, la validité. « Programme fermé » tant que rien n'est enregistré. Changer le ratio d'un programme réglé demande une confirmation. |
| **Soldes**       | le solde de chaque titulaire, et un ajustement ± motivé                                                                                                                                                                |
| **Bons d'achat** | chaque bon avec son état et son ratio figé, et l'annulation motivée d'un bon disponible                                                                                                                                |

Les routes (`admin/accounting/loyalty`, `@AdminSurface("b2b_accounting")`) :

| Verbe  | Chemin                | Commande ou requête           |
| ------ | --------------------- | ----------------------------- |
| `GET`  | `settings`            | `GetLoyaltySettingsQuery`     |
| `PUT`  | `settings`            | `SetLoyaltySettingsCommand`   |
| `GET`  | `balances`            | `ListLoyaltyBalancesQuery`    |
| `GET`  | `vouchers`            | `ListLoyaltyVouchersQuery`    |
| `POST` | `adjustments`         | `AdjustLoyaltyPointsCommand`  |
| `POST` | `vouchers/:id/cancel` | `CancelLoyaltyVoucherCommand` |

🔴 **La clientèle pro ne s'ouvre pas.** L'écran n'offre pas la case, et
`SetLoyaltySettingsHandler` refuse `openToPro` (`LoyaltyProNotYetOpenableError`,
409). Aucun signal ne dit aujourd'hui qu'une facture à terme est réglée. Le
crédit d'une société, lui, est déjà écrit et éprouvé : il n'attend que ce
signal.

⚠️ Un ajustement ne vise qu'un titulaire déjà présent dans les soldes. L'API ne
sert aucune recherche de société ou de personne.

## 8. Ce qui n'est pas bâti

| Lot    | Ce qu'il fera                                                                                      | Ce qu'il attend                                                |
| ------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **C**  | réserver un bon à la passation, le libérer à l'annulation, l'imputer au total, émettre le reliquat | **le traitement de TVA du bon**, question au cabinet comptable |
| **E1** | dans la boutique : le solde, « vous gagnerez N points », la conversion                             | le lot C — on ne distribue pas de bons inutilisables           |
| **E2** | dans la boutique : utiliser un bon au paiement                                                     | le lot C                                                       |
| **F**  | ouvrir aux pros                                                                                    | un signal « facture réglée »                                   |

Les décisions déjà prises pour ces lots sont écrites dans le plan : bon plus
gros que le panier → **reliquat**, émis quand la commande devient définitive et
gardant la date limite du bon d'origine ; un bon n'est libéré **que** par
l'annulation, jamais par un refus de paiement, puisqu'une commande refusée se
reprend.

### La TVA du bon : l'état de la question

| Traitement            | Effet sur la TVA                  | Ce que le code devra faire                                             |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------- |
| **rabais**            | réduit la base, ventilée par taux | une remise HT de plus dans `ventilateVat`, cherchée pour une cible TTC |
| **moyen de paiement** | TVA sur le prix plein             | un second règlement à côté de Stripe, et un reste à payer              |

Un bon **offert** est d'ordinaire traité comme un rabais ; un bon **vendu**
comme un moyen de paiement. Les nôtres ne sont jamais vendus. **À faire
confirmer par le cabinet comptable** : c'est irréversible pour les factures
émises.

`ventilateVat` fait déjà le calcul d'un rabais : retrait au prorata du poids HT
de chaque taux, un arrondi par taux. Il manque la fonction qui trouve la
remise HT dont l'effet TTC atteint une cible sans la dépasser. Exemple vérifié
à la main le 2026-09-26 : pour « −4 € » sur une tarte à 15 € (5,5 %) et un
chocolat à 5 € (20 %), la proportion directe donne 3,68 € HT, soit 3,99 € de
baisse ; 3,69 € HT donne exactement 4,00 €.

## 9. Le journal

| Fait                        | Quand                                                 |
| --------------------------- | ----------------------------------------------------- |
| `loyalty_settings.set`      | le réglage change (un réglage identique n'écrit rien) |
| `loyalty.points_earned`     | une commande définitive crédite                       |
| `loyalty.points_adjusted`   | un ajustement du staff                                |
| `loyalty.voucher_issued`    | une conversion                                        |
| `loyalty.voucher_expired`   | la nuit écrit une expiration                          |
| `loyalty.voucher_cancelled` | le staff annule un bon                                |

Ils se rangent sous la comptabilité dans le journal. `loyalty` est une zone
d'argent pour `lint:journal-tracked` : tout gestionnaire doit tracer sous
unité de travail.

## 10. Le passage de nuit

Chaque nuit à **02 h UTC** (`0 2 * * *` dans `apps/lfd-api/wrangler.jsonc`,
recopié à l'identique dans `LOYALTY_SWEEP_CRON`, `container/worker.ts`), le
Worker appelle `POST /admin/loyalty/sweep` avec le jeton du recompute
(`RecomputeGuard`). La route lance le rattrapage des crédits, puis
l'expiration des bons, et rend `{scanned, credited, expired}`.

⚠️ **Le rattrapage reparcourt toutes les commandes définitives** à chaque nuit,
en ne lisant que leurs identifiants. Son coût grandit avec l'historique.
⚠️ **Le branchement n'est éprouvé par aucun test** : `worker.ts` importe le
runtime Cloudflare. Son premier passage en production en sera la preuve.

## 11. Où c'est éprouvé

| Fichier                                                         | Ce qu'il prouve                                                                                                                                                         |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/b2b/loyalty/domain/**/__tests__/`                          | ratio, titulaire, motif, grand livre, bon, règle de gain                                                                                                                |
| `src/b2b/loyalty/application/commands/__tests__/`               | chaque commande avec ses ports doublés, dont le refus d'ouvrir les pros                                                                                                 |
| `test/loyalty.e2e-spec.ts`                                      | deux conversions concurrentes (une seule passe), `CHECK` du titulaire, paliers entiers, programme fermé, annulation qui recrédite une seule fois, journal               |
| `test/loyalty-earning.e2e-spec.ts`                              | crédit dans les deux ordres, jamais deux fois, `not_required`, `pending`, invité, société disparue, programme fermé, port et surtaxe exclus, rattrapage, 401 sans jeton |
| `apps/lfd-backoffice-frontend/src/app/comptabilite/fidelite/**` | l'écran : réglage, soldes, bons, lecture seule sans le droit d'écriture                                                                                                 |
