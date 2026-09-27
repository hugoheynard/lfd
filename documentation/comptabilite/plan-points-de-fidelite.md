# Plan — les points de fidélité

> 📘 **Ce qui est bâti est décrit à l'affirmative dans
> [`points-de-fidelite.md`](points-de-fidelite.md)** (2026-09-26), qui fait
> foi. Ce plan reste l'**histoire de la décision** : la demande, les deux
> contradictions de `vitruve`, les réponses de Hugo. Il reste aussi la
> référence des lots **C, E1, E2 et F**, qui ne sont pas bâtis.

**Statut** : 🟡 **partiel**, 2026-09-27. **Bâtis : A, B, C, D, E1** (§4) — le programme
est livrable fermé ; rien ne se convertit ni ne s'utilise encore (E1, C, E2). Touche **l'argent**
(une remise qui réduit un total et sa TVA). **Contredit par `vitruve` le même
jour : 3 BLOQUANT, 8 SÉRIEUX** — ce document est la version d'après, le §6 dit
ce qui a changé. **Réécrit le même jour après les réponses de Hugo (§7)** :
les points se convertissent en **bon d'achat**. Il doit repasser par `vitruve`
avant le lot C.
**Portée** : gagner des points sur une commande, les convertir en **bon
d'achat**, utiliser ce bon sur une commande suivante, et régler le taux de
conversion dans Comptabilité. Ouvert à la clientèle **publique** d'abord,
conçu pour s'étendre aux pros sans refonte.

## 0. La demande

> « les points fidélité, plutôt ouverts au public de base mais extensible
> j'imagine. Facile, une commande donne son nombre de points en centimes, et
> en admin/comptabilité remise fidélité, on définit un ratio nombre de points,
> valeur euro » — Hugo, 2026-09-26.

Donc :

- **gagner** : une commande de 23,40 € rapporte **2 340 points** ;
- **convertir** : un ratio réglé à l'écran, par exemple **1 000 points = 5 €** ;
- **dépenser** : la personne convertit ses points en **bon d'achat**, puis
  utilise ce bon sur une commande.

> « 1 non. 2 je ne sais pas, documente. 3 la société. En fait la personne
> convertit ses points en bon d'achat » — Hugo, même jour, réponses au §5.

## 1. L'existant (ouvert et vérifié le 2026-09-26)

- **Rien n'existe.** Aucune occurrence de « fidélité » ou de `loyalty` dans le
  code, à part deux homonymes sans rapport (la « fidélité du miroir », le
  gabarit de mercuriale « Fidélité »).
- **Toute commande a une personne** : `Order.placedByUserId` → `User`, y
  compris sans compte. Un invité est un `User` dont `auth0_sub` est `NULL`
  (`account.prisma`, plan `order/plan-commande-sans-compte.md`). `companyId`,
  lui, est nul pour le public.
- **La commande porte `clientele`** (`pro` | `public`), nullable
  (`orders.prisma:109`).
- **Les montants figés** à la passation sont en centimes : `subtotalCents` (HT),
  `discountCents` (remise du point de retrait, **HT**), `deliveryFeeCents`,
  `lateFeeCents`, `vatCents`, `vatShares`, `totalCents` (TTC).
- **La seule remise existante entre HT** dans `ventilateVat` (`@lfd/money`) :
  `discountCents` se répartit sur les lignes avant la TVA, et il est plafonné
  au sous-total (`vat.spec.ts`).
- **Statuts** : `placed → confirmed → in_production → ready → fulfilled`, plus
  `cancelled`. **L'annulation n'est pas bâtie** : `cancelled` n'est écrit par
  aucun chemin, et le plan est bloqué par `vitruve`
  (`order/plan-annulation-de-commande.md`). `refunded` n'est jamais écrit.
- **Comptabilité** a déjà un réglage global à clé fixe : `AccountingSettings`
  (`id = 'default'`, `paymentLinkMaxCents`), gardé par `b2b_accounting`, avec
  son fait de journal `accounting_settings.payment_link_cap_set`.

## 2. Ce qu'on bâtit, en une phrase

Chaque **titulaire** a un **grand livre de points** où l'on écrit sans jamais
effacer. Le titulaire est la **société** pour un pro, la **personne** pour un
particulier. Le passage à `fulfilled` d'une commande réglée **crédite** ce
livre. Quand une personne le décide, elle **convertit** des points en un **bon
d'achat** d'un montant fixe. Le ratio est lu à ce moment-là, puis figé sur le
bon. Le bon s'utilise ensuite sur une commande, avec un traitement de TVA qui
reste à trancher (§3, D6). Il y reste attaché tant que la commande vit. Il ne
redevient disponible que si la commande est **annulée**. Un paiement refusé
ne suffit pas : une commande refusée se reprend par un lien de paiement.

```mermaid
flowchart LR
  F["commande fulfilled + paid<br/>(événement + rattrapage)"] --> E["+ points earned"]
  E --> L[("grand livre<br/>du titulaire")]
  L -->|la personne convertit| V["bon d'achat<br/>montant et ratio figés<br/>− points converted"]
  V -->|passation| O["commande<br/>rabais figé, bon used"]
  O -->|annulation seulement| V2["bon available à nouveau"]
  S["Comptabilité › Fidélité<br/>ratio, clientèles"] -.lu à la conversion.-> V
```

**Pourquoi le bon simplifie** : la dépense de points est un geste à part
entière, hors de la passation. La passation ne touche plus au livre : elle
réserve un bon. Une annulation rend donc un bon, pas des points, et le
ratio ne peut plus changer entre le panier et le paiement, puisqu'il est figé
sur le bon.

## 3. Les décisions

### D1 — Le titulaire : la société, ou la personne

- **Titulaire** = `company_id` pour un pro, `user_id` pour un particulier.
  Une table de titulaires n'est pas nécessaire. Chaque ligne du livre et
  chaque bon portent **l'un des deux, exactement** :
  `CHECK ((company_id IS NULL) <> (user_id IS NULL))`.
- Qui gagne : c'est la `clientele` de la commande qui tranche.
  - `pro` crédite `Order.companyId`. Si ce champ est nul, parce que la société
    a été supprimée (`orders.prisma:101-103`), il n'y a pas de crédit, et la
    sonde l'écarte explicitement ;
  - `public` crédite `placedByUserId` ;
  - une `clientele` nulle (commandes d'avant le champ) ne crédite rien.
- **Les clés étrangères vers `companies` et `users` sont `ON DELETE RESTRICT`**
  sur le livre et sur les bons. Un livre ne s'efface pas. Avant la migration
  du lot A, il faut vérifier quels chemins suppriment une société ou une
  personne, et ce que ce refus leur fait.
- **Seul un compte connecté gagne** (`auth0_sub` non nul) :
  - `User.email` n'est pas unique, et une commande sans compte reste
    rattachée à l'invité neuf (`plan-commande-sans-compte.md`) ;
  - les points d'un invité seraient donc inaccessibles, et s'attribuer ceux
    d'une adresse serait une faille.
- **Qui convertit, chez un pro** : toute personne active rattachée à la
  société, avec le droit d'y commander. La société est celle de **l'espace
  courant**, pas celle de la personne : une personne peut appartenir à
  plusieurs sociétés. Le rattachement est revérifié sous verrou. Une personne
  qui quitte la société ne part pas avec ses bons : ils sont à la société. Décidé par Hugo :
  **tout le monde**, pas seulement le titulaire du compte.

### D2 — Le grand livre

Nouvelle table `loyalty_ledger_entries` (schéma `public`, contexte
`b2b/loyalty/`) :

- le titulaire (D1) ;
- `kind`, `points` (entier **signé**), `order_id` et `voucher_id`
  (nullables) ;
- `occurred_at`, `actor_user_id` ou `staff_user_id`, et `reason` pour un
  ajustement.

Valeurs de `kind` :

- `earned` (+) : une commande remise et réglée ;
- `converted` (−) : un bon émis ;
- `adjusted` (±) : un geste du staff, avec un motif obligatoire.

Règles :

- **Le solde est la somme.** Aucune colonne de solde.
- **Unicités en base** : `(order_id)` pour `earned`, `(voucher_id)` pour
  `converted`. Un rejeu n'écrit rien de plus.
- **Le solde ne descend jamais sous zéro.** La conversion prend un
  `pg_advisory_xact_lock` sur le titulaire, selon la convention du dépôt
  (`prisma-person-attachment.lock.ts`). Son espace de noms est propre, et la
  clé est préfixée `company:` ou `user:`, pour qu'un identifiant de société et
  un identifiant de personne ne tombent jamais sur le même verrou. Elle relit ensuite la somme, puis
  écrit le bon et le débit **dans la même transaction**. Pour un pro, deux
  personnes de la même société qui convertissent en même temps attendent
  l'une l'autre.
- Faits de journal : `loyalty.points_earned`, `loyalty.points_adjusted`,
  `loyalty.voucher_issued`, `loyalty.voucher_reserved`,
  `loyalty.voucher_released`, `loyalty.voucher_expired`,
  `loyalty.voucher_cancelled`.
- `actor_user_id` : quand une personne est effacée, il passe à `NULL` sans que
  la ligne disparaisse. C'est la seule exception au `RESTRICT`, parce que
  l'auteur d'un geste n'est pas le titulaire.

### D3 — Créditer après remise et encaissement, par rattrapage idempotent

- **Condition** : la commande est `fulfilled` **et** `paymentStatus = paid`.
  `not_required` ne compte **pas** : chez un pro, cela veut dire « payé à
  terme », pas encaissé (`orders.prisma:206-210`). Le jour où l'on ouvre
  les pros, il faudra un signal « facture réglée ». Il n'existe pas
  aujourd'hui, et ouvrir `openToPro` sans lui n'est pas permis (lot F).
- **Pas de transaction partagée avec `orders`.** `markFulfilled` et
  `settle` écrivent en autocommit (`prisma-order.repository.ts:154-260`).
  Les faire écrire dans les tables de `b2b/loyalty/` ferait lire à une classe
  les tables d'un autre contexte en Prisma direct (`CLAUDE.md` §3).
- **Le mécanisme** : `b2b/loyalty/` crédite de deux façons, toutes deux
  idempotentes par l'unicité `(order_id)` sur `earned` :
  1. **au fil de l'eau**, un abonné à l'événement de remise et à celui de
     règlement. Au bout, il se déclenche sur le **second** des deux. Il écoute
     la classe publiée **par le commerce**
     (`b2b/orders/domain/events/order-handed-over.event.ts`), et non celle du
     canal `handover` ;
  2. **par rattrapage**, une tâche périodique qui **écrit** le crédit des
     commandes `fulfilled` et `paid`, d'une clientèle ouverte, qui n'ont pas
     encore de ligne `earned`. Elle lit les commandes par un port de lecture
     que `orders` expose, pas par Prisma direct.
     L'abonné peut échouer, puisque `BackgroundWork` avale son erreur. Le
     rattrapage garantit que le crédit arrive au plus tard au passage suivant.
- **Les chemins vers `paid` sont à inventorier au lot D.** `settle` en est un.
  Le lien de paiement en passe par un autre (`settle-payment-link.handler.ts`).
  Le comptoir est à vérifier. Le rattrapage les couvre tous, puisqu'il lit
  l'état et non les événements.
  **Inventaire fait au lot D (2026-09-26)** : un seul chemin écrit `paid` sur
  une commande — `PrismaOrderRepository.settle`, via `markPaid`, appelé par
  `ConfirmOrderPaymentHandler` sur le webhook `payment_intent.succeeded`, qui
  publie `OrderPaymentSettledEvent`. La page « régler » d'une commande refusée
  réutilise la même intention Stripe, donc le même chemin.
  `settle-payment-link.handler.ts` passe à `paid` un **lien libre**
  (`PaymentLink`, rattaché à une société, sans commande) : il ne touche aucune
  commande. Le comptoir n'écrit aucun règlement. Hors code de production, seul
  le semis de démonstration (`dev/seeding/orders.seed.ts`) écrit `paid`.
  **Bâti au lot D** : `CompletedOrderReader` (déclaré et exporté par
  `orders`), les abonnés `CreditPointsOnHandover` et
  `CreditPointsOnPaymentSettled`, et le rattrapage `POST /admin/loyalty/sweep`
  (porte machine, `RecomputeGuard`), qui enchaîne l'expiration des bons.
  ⚠️ Aucun Cron Trigger ne l'appelle encore : `wrangler.jsonc` et
  `container/worker.ts` sont à compléter, décision d'horaire à Hugo.

### D4 — L'assiette : les marchandises seulement

Décidé par Hugo : le port et la surtaxe **ne rapportent pas** de points.
Puis, le même jour : l'assiette est **hors taxe**, parce qu'un crédit calculé
sur le TTC rendrait au client la TVA qu'on reverse. L'assiette vaut
`subtotalCents − discountCents`, les marchandises HT après la remise du point
de retrait. (Bâti d'abord sur le TTC, `totalCents − port − surtaxe`, et
corrigé avant tout déploiement.)

⚠️ **Avec un bon, l'assiette dépend de D6.** En traitement A, le bon devient
une remise HT de plus, à soustraire aussi. En traitement B, le HT reste plein,
et c'est le règlement par bon qu'il faudra exclure. Le lot D n'en dépend pas : tant que le lot C
n'est pas bâti, aucune commande ne porte de bon. Le lot C fixera cette
soustraction.

### D5 — Le ratio : lu à la conversion, figé sur le bon

Nouvelle table `loyalty_settings`, clé fixe `id = 'default'` :

- `pointsPerStep` (ex. 1 000) et `stepValueCents` (ex. 500, TTC) ;
- `openToPublic` (vrai) et `openToPro` (faux) ;
- `voucherValidityDays` : **365**, décidé par Hugo (un an). Colonne non
  nulle, sans défaut en base : sa valeur est écrite au premier enregistrement
  de l'écran.

**Tant que la ligne n'existe pas, le programme est fermé.** L'écran est
**Comptabilité › Fidélité**, sous le droit `b2b_accounting`. Fait de journal :
`loyalty_settings.set`.

Règles de conversion :

- **On convertit par paliers entiers** : un bon vaut
  `n × stepValueCents` et coûte `n × pointsPerStep` points.
- **Le bon fige** son montant, les points qu'il a coûtés et le ratio appliqué.
  Changer le ratio n'altère ni un bon émis, ni un nombre de points. Cela change
  seulement ce que vaudront les **prochaines** conversions, et l'écran le dit
  au moment d'enregistrer.

### D6 — Le bon et la TVA : ce qu'on ne sait pas encore

**Non tranché**, à demander au cabinet comptable. Voici ce qu'on sait, pour
qu'il réponde vite.

Deux traitements sont possibles :

| Traitement                                 | Effet sur la commande                                                      | Effet sur la TVA                  | Coût de bâtisse                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------- |
| **A. Rabais** (réduction du prix de vente) | une remise de plus, figée à la passation                                   | réduit la base, ventilée par taux | une remise HT de plus dans `ventilateVat`, et un calcul du HT pour une cible TTC             |
| **B. Moyen de paiement** (comme un avoir)  | le total TTC reste plein ; le bon en paie une partie, Stripe paie le reste | TVA calculée sur le prix plein    | un second encaissement à côté de Stripe, un « reste à payer », une facture à deux règlements |

Ce qu'on lit habituellement, **non vérifié ici et à faire confirmer** : un bon
**remis gratuitement** par le vendeur, et utilisé chez lui, est traité comme
une **réduction de prix**, qui diminue la base de TVA (traitement A). Un bon
**vendu**, comme une carte cadeau, relève plutôt du traitement B. Nos bons ne
sont jamais vendus : ils naissent de points donnés. Le cas penche donc vers A.

Ce qui ne dépend pas de la réponse, et qu'on peut bâtir avant :

- le livre, la conversion et l'émission du bon (lots A, B, D) ;
- le bon en tant qu'objet, avec ses états et son verrou.

Ce qui en dépend :

- le lot C tout entier : l'effet sur le total, la facture, l'export comptable ;
- 🔴 **le choix est irréversible pour les factures émises.**

**Si la réponse est A**, voici la mécanique retenue après la contradiction :

1. La remise du point de retrait s'applique d'abord.
2. Le bon s'impute ensuite sur le TTC des marchandises restant. Il ne paie
   jamais le port.
3. Une fonction `@lfd/money`, `htDiscountForTtcTarget`, cherche par recherche
   entière la plus grande remise HT dont l'effet TTC, calculé par
   `ventilateVat` lui-même, ne dépasse pas la cible. La facture imprime la
   **baisse de TTC réellement obtenue** : 4,99 € possible, 5,01 € jamais.
4. `ventilateVat` reçoit la remise du bon à part de `discountCents`.

**Un bon plus gros que le panier donne un reliquat** (décidé par Hugo). La
différence devient un **nouveau bon** du même titulaire. Il porte
`parent_voucher_id` et garde **la date limite du bon d'origine** : sinon,
un reliquat en chaîne prolongerait indéfiniment la validité.

🔴 **Le reliquat n'est pas émis à la passation.** Il est émis quand la commande
devient définitive, c'est-à-dire `fulfilled` et `paid`, par le même abonné et
le même rattrapage idempotent que le gain de points (D3), avec l'unicité
`(parent_voucher_id)`. Émis à la passation, il pourrait être dépensé avant
qu'une annulation ne rende le bon d'origine : on aurait alors les deux.

### D7 — Le cycle d'un bon

| État        | Entre par                                           | Sort par                                                             |
| ----------- | --------------------------------------------------- | -------------------------------------------------------------------- |
| `available` | conversion, ou libération                           | passation (`reserved`), date limite (`expired`), staff (`cancelled`) |
| `reserved`  | la passation, sous le verrou du **titulaire**       | l'annulation de la commande (`available`)                            |
| `expired`   | un an écoulé, **seulement** si `available`          | —                                                                    |
| `cancelled` | geste du staff motivé, **seulement** si `available` | —                                                                    |

- **Pas d'état `used`.** Un bon `reserved` sur une commande qui vit est
  consommé. Il ne pourrait revenir que par l'annulation. `markPaymentFailed`
  ne libère **rien** : une commande refusée n'est pas terminée, elle se
  reprend par un lien de paiement (`payment-link.ts:28-32`). Libérer le bon à
  ce moment-là permettrait de le dépenser deux fois.
- **Un bon réservé n'expire pas.** Libéré après sa date limite, il passe
  directement à `expired`.
- **Annuler un bon** (staff) : il passe à `cancelled`, et une ligne `adjusted`
  liée au bon recrédite ses points.
- **Un bon par commande** (`voucher_id` sur `Order`, colonne additive
  nullable). La réservation vit dans la transaction de passation, par un port
  que `orders` déclare et que `loyalty` implémente, relié dans
  `appBootstrap`.
- **L'idempotence de passation passe avant la réservation** : un rejeu rend
  la commande existante et ne touche pas au bon.
- 🔴 **L'annulation, quand elle sera bâtie, libère le bon.** Le plan
  d'annulation, et le plan d'abandon s'il écrit `cancelled`, doivent le citer.
- Chez un pro, toute personne qui peut commander pour la société peut
  utiliser un bon de la société.

### D8 — Ce qu'on ne fait pas

- Les points au comptoir sans compte, la carte physique, le parrainage.
- La vente de cartes cadeaux : c'est l'autre régime de TVA, et un **chantier à part**, sans table ni code communs (Hugo annonce les cartes cadeaux le 2026-09-26 ; distinction écrite dans `points-de-fidelite.md`). Depuis ce jour, on dit **« bon de fidélité »**, jamais « bon d'achat ».
- Défaire une conversion depuis la boutique. Seul le staff annule un bon
  (D7).

## 4. Les lots

| Lot | Contenu                                                                                                                                                                                                                                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | ✅ bâti le 2026-09-26, `1057ecfa3` — migration additive : `loyalty_settings`, `loyalty_ledger_entries`, `loyalty_vouchers`, avec le CHECK de titulaire et les `RESTRICT`. Contexte `b2b/loyalty/` : le livre, le verrou, la conversion, le bon en états `available`, `expired` et `cancelled` seulement. Journal. Tests aux trois niveaux.     |
| B   | ✅ bâti le 2026-09-26, `1057ecfa3` (routes) et `b862ee9fb` (écran) — Comptabilité › Fidélité : le réglage, une vue des soldes et des bons, l'ajustement motivé, l'annulation d'un bon.                                                                                                                                                         |
| D   | ✅ bâti le 2026-09-26, `9f1ebf2c8`. le rattrapage et l'expiration passent **chaque nuit à 02 h UTC** (`0 2 * * *`, `wrangler.jsonc` et `LOYALTY_SWEEP_CRON` dans `container/worker.ts`) — le crédit : l'abonné et la tâche de rattrapage, par un port de lecture d'`orders` ; l'inventaire des chemins vers `paid`.                            |
| E1  | ✅ bâti le 2026-09-27, `4e3db4912` (conception §12, entrée « Ma fidélité » à part, rien en espace pro) — boutique : le solde, « vous gagnerez N points », et la conversion en bon.                                                                                                                                                             |
| C   | ✅ bâti le 2026-09-27, `562d929b0` (conception §11, corrigée §11 bis). **D6 tranché : rabais** (Hugo, 2026-09-27, §10). L'état `reserved`, la réservation à la passation, la libération à l'annulation, l'effet sur le total et sur l'assiette. Avant de bâtir : l'inventaire de tous les lecteurs du total. Ensuite, un passage de `vitruve`. |
| E2  | boutique : utiliser un bon au paiement.                                                                                                                                                                                                                                                                                                        |
| F   | ✅ le serveur **refuse** déjà `openToPro` (`LoyaltyProNotYetOpenableError`, `9f1ebf2c8`) ; ce lot lève le refus — ouvrir aux pros : un signal « facture réglée » avant tout `openToPro`.                                                                                                                                                       |

Le cycle du bon s'arrête volontairement à `available` dans le lot A.
L'imputation dépend de D6 : avec le traitement B, le bon devient un
règlement, et peut laisser un reliquat. Figer `reserved` avant de connaître la
réponse coûterait une migration de plus.

**Décidé par Hugo : E1 attend C.** On ne distribue pas de bons qu'on ne
pourrait pas encore utiliser. A, B et D peuvent être bâtis et livrés
programme fermé.

## 5. Questions ouvertes

1. ~~**D6**~~ — tranché par Hugo le 2026-09-27 : **rabais** (§10). La
   question au cabinet reste posée, en confirmation.

Tranchées le 2026-09-26 (§7) : l'assiette, le titulaire, le bon d'achat, le
reliquat, qui convertit, la date limite et l'ordre d'ouverture.

## 6. Ce que la première contradiction a changé (2026-09-26)

> ⚠️ **En partie remplacé par le §7 et le §8.** Le bon d'achat a supprimé
> `restored`, le débit à la passation et le 409 « barème changé ». Ce qui
> suit est gardé comme historique.

- **B1** — Des points débités restaient perdus si le règlement échouait ou
  était abandonné. Désormais, `restored` est écrit par chaque chemin de
  renoncement, et c'est une condition de bâtisse imposée aux plans voisins
  (D2).
- **B2** — Le crédit reposait sur un événement dont les échecs sont avalés.
  Il est maintenant écrit dans la transaction de `fulfilled`, avec une sonde
  de rattrapage (D3).
- **B3** — « L'invité retrouve ses points en ouvrant un compte » était faux,
  puisque l'adresse n'est pas unique. Désormais, l'invité ne gagne rien
  (aujourd'hui D1).
- **Sérieux** :
  - la conversion TTC vers HT est nommée et construite par recherche ;
  - on imprime la baisse de TTC réelle ;
  - l'ordre et le plafond des deux remises sont fixés ;
  - on ne dépense que des paliers pleins ;
  - le verrou suit la convention du dépôt, et le débit vit dans la
    transaction de passation ;
  - l'idempotence est vérifiée avant le calcul de fidélité ;
  - seules les commandes réglées rapportent des points ;
  - l'irréversibilité du rabais est dite ;
  - le ratio est figé sur la commande, et un barème changé donne un 409 ;
  - l'inventaire des lecteurs du total est une étape du lot C.

## 7. Les réponses de Hugo (2026-09-26)

- **Assiette** : le port et la surtaxe ne rapportent pas de points (D4).
- **TVA** : « je ne sais pas, documente ». D6 expose les deux traitements, ce
  qui ne dépend pas de la réponse, et ce qui en dépend. Le lot C attend.
- **Titulaire** : les points appartiennent à la **société** chez un pro (D1).
- **Bon d'achat** : la personne convertit ses points en bon, puis utilise le
  bon. Ce choix a remplacé la remise en points à la passation. Il a supprimé
  l'ancien `restored` : un échec de commande libère le bon, pas les points. Il
  a aussi supprimé le 409 « barème changé » : le ratio est figé sur le bon au
  moment de la conversion.

- **Second tour** : un bon trop gros donne un **reliquat** (D6), **toute
  personne** qui commande pour la société peut convertir (D1), un bon vaut
  **un an** (D5), et la conversion **attend** que les bons soient
  utilisables (§4).

## 8. Ce que la seconde contradiction a changé (2026-09-26)

- **B1** — Libérer le bon au refus de paiement permettait de le dépenser deux
  fois : une commande refusée se reprend. Désormais, seule l'annulation libère
  un bon, et l'état `used` disparaît (D7).
- **B2** — « Dans la même transaction que `fulfilled` » supposait une
  transaction qui n'existe pas, et une écriture d'`orders` dans les tables de
  `loyalty`. Le crédit passe maintenant par un abonné et par un rattrapage
  idempotent qui écrit, en lisant les commandes par un port (D3).
- **B3** — `not_required` n'est pas un encaissement. Seul `paid` crédite, et
  l'ouverture aux pros attend un signal « facture réglée » (lot F).
- **Sérieux** :
  - société supprimée : la sonde l'écarte ;
  - clés étrangères en `RESTRICT` ;
  - `clientele` nulle exclue ;
  - titulaire pris dans l'espace courant ;
  - espace de noms de verrou préfixé ;
  - assiette avec bon renvoyée au lot C ;
  - cycle du bon arrêté à `available` avant D6 ;
  - un bon réservé n'expire pas ;
  - les chemins vers `paid` sont couverts par le rattrapage.

## 9. La valeur du bon est hors taxe (2026-09-26)

> « je vote pour le calcul qui est le plus cohérent pour nous, au pire ça fait
> un peu plus de réduc pour le client » — Hugo.

`stepValueCents` est **HT**, comme l'assiette du gain. Ce choix remplace, dans
D5 et D6, tout ce qui parle d'un bon « TTC » et de la recherche
`htDiscountForTtcTarget` : en traitement A, la valeur du bon entre telle quelle
comme remise HT. Le client gagne la TVA en plus, par exemple 5,28 € de baisse
pour un bon de 5 € HT à 5,5 %. L'affichage devra montrer cette baisse réelle.
Rien n'était déployé : aucune donnée n'est à convertir.

## 10. Le bon est un rabais (2026-09-27)

> « je dis le bon est une remise » — Hugo.

D6 est tranché : **traitement A**. Le bon réduit la base de TVA ; sa valeur,
déjà HT (§9), entre telle quelle dans `ventilateVat`, à part de la remise du
point de retrait. Le traitement B, son second règlement et son reste à payer,
est écarté pour le bon de fidélité ; il reviendra avec les cartes cadeaux, qui
sont un autre chantier.

La question au cabinet n'est pas retirée : elle devient une **confirmation**.
Une réponse contraire, arrivée après la première facture émise avec un bon,
coûterait des factures rectificatives — c'est ce que « irréversible » veut dire
ici.

Le lot C n'attend plus la réponse. Il attend sa propre conception, qui doit
aussi citer les trois chemins qui écrivent `cancelled` depuis l'abandon du
règlement (l'abandon par le client, le balayage de clôture, `failAtClosing`) :
chacun devra libérer le bon (D7, 🔴).

## 11. Conception du lot C (2026-09-27)

> ⚠️ **Contredite par `vitruve` le 2026-09-27 : 3 BLOQUANT, 6 SÉRIEUX.** Le
> §11 bis dit ce qui change ; il l'emporte sur ce qui suit.
>
> **Doc-first, rien n'est bâti.** Écrite après l'inventaire des lecteurs du
> total et la lecture de la passation, des deux écritures `cancelled` et de
> l'agrégat du bon (ouverts le 2026-09-27). À contredire par `vitruve` avant
> Hugo : elle touche l'argent et porte une migration.

### C1 — Le calcul : `ventilateVat` ne change pas

Le total n'est calculé qu'à **un** endroit, `ventilateVat`
(`packages/money/src/vat.ts`), appelé par `computeOrderTotals` pour la commande
et par `quote-shop-cart.handler.ts` pour le devis. Les deux remises sont HT et
toutes deux retranchées des **marchandises** au prorata de chaque taux ; leur
somme se ventile donc exactement comme chacune séparément, à l'arrondi par taux
près — et c'est le même arrondi. On passe `discountCents + voucherDiscountCents`
à `ventilateVat`, sans toucher sa signature.

Ce que la commande garde **à part**, parce que la facture et l'assiette le
demandent :

- `discountCents` : la remise du point de retrait, inchangée ;
- `voucherDiscountCents` : la part du bon **réellement imputée**.

Ordre et plafond (D6) : la remise du point s'applique d'abord ; le bon s'impute
ensuite, plafonné au HT de marchandises restant :
`voucherDiscountCents = min(voucher.valueCents, subtotalCents − discountCents)`.
Il ne paie jamais le port ni la surtaxe, puisque `ventilateVat` ne retranche
rien des `extras`.

### C2 — La persistance

Migration **additive** sur `orders` :

- `voucher_discount_cents INT NOT NULL DEFAULT 0` ;
- `loyalty_voucher_id TEXT NULL`, clé étrangère `RESTRICT` vers
  `loyalty_vouchers`, **unique** : un bon ne sert qu'à une commande, et la base
  le refuse même si l'agrégat l'oubliait.

Sur `loyalty_vouchers` : la valeur `reserved` rejoint les états, et
`reserved_order_id` n'est **pas** ajouté — le lien vit sur la commande, une
seule fois. `appliedCents` non plus : la commande le porte.

### C3 — La réservation, dans la transaction de passation

`orders` déclare un port `LoyaltyVoucherRedemption` (domaine d'`orders`),
`loyalty` l'implémente, `appBootstrap` les relie — la forme de D7.

1. **Au drafting**, `quote(voucherId, holder, now)` lit le bon : titulaire =
   celui de la commande (la personne en public), `available`, non échu. Sinon
   un refus métier qui nomme le cas (« ce bon a expiré le … », « ce bon a déjà
   servi »). Rend `valueCents`.
2. `Order.draft` reçoit `voucher: { id, valueCents } | null`, calcule
   `voucherDiscountCents` (C1) et le total.
3. L'intention Stripe est créée sur ce total (inchangé : `order.totalCents`).
4. **Dans `unitOfWork.run`**, avant `orders.place` : `reserve(voucherId,
holder, now)` prend le verrou du titulaire (`loyalty.ledger:user:…`), relit
   le bon, le fait passer `available → reserved` par sa méthode
   (`LoyaltyVoucher.reserve(now)`, qui refuse l'échu et tout autre état), et
   sauve. Une course perdue lève le refus ; la transaction rend tout, la clé
   d'idempotence est rendue (erreur **avant** l'écriture de la commande).

⚠️ **L'intention Stripe créée en 3 reste orpheline si 4 échoue.** C'est déjà
le cas aujourd'hui pour toute erreur de `orders.place` ; elle n'est jamais
confirmée, donc jamais débitée. Le lot C l'annule quand même
(`cancelIntent`, qui ne lève jamais) : un bon disputé par deux onglets est le
seul chemin où ça devient courant.

L'idempotence passe **avant** : un rejeu rend la commande existante et ne
touche pas au bon (D7, inchangé).

**Qui peut utiliser un bon, au lot C** : un client **connecté** qui commande
pour lui-même (`PlaceOrderHandler`, `companyId` nul). Pas l'invité
(`PlaceShopOrderHandler` — il n'a pas de bons), pas le staff pour un client
(`place-order-for-customer`), pas un pro (lot F). Le contrat de ces trois
chemins n'expose pas le champ.

### C4 — La libération : les deux écritures `cancelled`

Il n'y en a que **deux** (vérifié le 2026-09-27) :
`PrismaOrderRepository.markAbandoned` (branche publique) et `failAtClosing`.
Toutes deux sont des `updateMany` conditionnés, justifiés en tête du dépôt.

Chacune, quand elle franchit (`count === 1`), libère le bon dans la **même
transaction** : `release(orderId, now)` → `reserved → available`, ou
`→ expired` si la date limite est passée (D7). La libération est donc portée par
un port d'`orders` appelé par le handler de l'abandon et par le service de
clôture, sous `unitOfWork`, pas par un abonné à un événement : un abonné dont
l'échec est avalé laisserait un bon réservé sur une commande morte.

La branche **pro** de `markAbandoned` n'écrit que `failed` et ne libère rien —
un pro n'a pas de bon au lot C, et un refus se reprend (D7).

### C5 — Le reliquat

`valueCents − voucherDiscountCents > 0` donne un nouveau bon, `available`, même
titulaire, **même date limite**, `parentVoucherId` = le bon consommé, et
`pointsCost = 0` (ses points ont été payés par le parent).

**Quand** : quand la commande ne peut plus être annulée. Les deux écritures
`cancelled` exigent un règlement `pending` ou `failed` ; une commande est donc
définitive dès qu'elle est **`paid`**, ou dès sa passation si elle est
**`not_required`** — un panier que le bon couvre entièrement, au retrait, a un
total nul et ne crée aucune intention (`place-order.handler.ts`,
`settle`). Deux déclencheurs :

- à la passation, dans la transaction, si `not_required` ;
- sinon, par le rattrapage de nuit du lot D, qui cherche les commandes `paid`
  dont le bon a un reliquat non émis. Idempotent par l'unicité de
  `parentVoucherId` (index unique partiel) : un seul enfant par parent.

Pas d'abonné à `payment_intent.succeeded` : le rattrapage suffit, un reliquat
émis au matin n'est pas une urgence, et c'est un chemin de moins.

### C6 — L'assiette des points

`order-earning.ts` : `basis = subtotalCents − discountCents −
voucherDiscountCents`. Le HT réellement payé. Un point dépensé ne rapporte pas
de point. **À confirmer par Hugo** — c'est la seule règle commerciale neuve du
lot.

### C7 — Les lecteurs (inventaire du 2026-09-27)

| Surface                                             | Changement                                                            |
| --------------------------------------------------- | --------------------------------------------------------------------- |
| `computeOrderTotals`, `Order.draft`, `OrderToPlace` | le bon entre, `voucherDiscountCents` sort                             |
| `quote-shop-cart.handler.ts`, `ShopQuoteView`       | `voucherId` optionnel au devis, pour que devis et commande concordent |
| `OrderView`, `CustomerOrderView`, `SheetMoney`      | `voucherDiscountCents` (additif, défaut 0)                            |
| `order-sheet-text.ts` (bon de commande, PDF)        | une ligne « Bon de fidélité » distincte de « Remise »                 |
| gabarits d'e-mail                                   | la même ligne                                                         |
| `order-earning.ts`, `CompletedOrderReader`          | C6                                                                    |
| intention Stripe, production, retrait               | rien : ils lisent le total final                                      |

Facture et export comptable : **n'existent pas** (`orderDocuments` annonce la
facture « pas encore disponible »). Rien à changer ; la future facture lira
`voucherDiscountCents` et `vatShares`, déjà figés.

L'**affichage de la baisse réelle** (5,28 € pour un bon de 5 € HT à 5,5 %) est
le travail d'E2 : le devis rend déjà le TTC avant et après.

### C8 — Tests exigés

- unitaire : `LoyaltyVoucher.reserve/release`, les refus ; `Order.draft` avec
  bon plafonné, bon plus gros que le panier, total nul ;
- e2e : réservation et course de deux commandes sur le même bon (une seule
  passe, l'autre 409, aucune commande ni clé écrite) ; libération par l'abandon
  et par la clôture, avec et sans échéance passée ; reliquat à la passation
  (`not_required`) et au rattrapage (`paid`), rejoué sans doublon ; parité
  devis/commande avec bon ; assiette de points ; un pro et un invité ne peuvent
  pas nommer de bon.

### C9 — Ouvert

1. C6 — l'assiette après bon (Hugo).
2. Le bouton « annuler un bon » du staff (lot B) refuse un bon `reserved` :
   l'agrégat ne sort de `cancelled` que depuis `available`. À garder ainsi —
   annuler un bon engagé sur une commande vivante est un geste sur la commande.

## 11 bis. Ce que la contradiction du lot C a changé (2026-09-27)

**Bloquants**

- **B1 — le reliquat viole un CHECK en base.** `loyalty_vouchers_amounts_positive`
  exige `points_cost > 0`. La migration du lot C le remplace par
  `points_cost > 0 OR parent_voucher_id IS NOT NULL` (et `points_cost >= 0`) :
  un relâchement, sans donnée à convertir.
- **B2 — un reliquat peut naître déjà échu** (bon qui arrive à échéance entre
  le paiement et le passage de 02 h ; `expires_at > issued_at` le refuserait,
  en boucle chaque nuit). Règle : **si la date limite du parent est passée à
  l'émission, aucun reliquat n'est émis** ; le fait
  `loyalty_voucher.remainder_lapsed` le journalise avec le montant. C'est ce
  qu'aurait fait l'expiration d'un bon non utilisé. **À confirmer par Hugo.**
- **B3 — l'unicité de `orders.loyalty_voucher_id` interdisait de réutiliser un
  bon libéré.** Elle devient **partielle** : `UNIQUE … WHERE status <>
'cancelled'`, en SQL écrit dans la migration. La commande annulée garde la
  trace du bon.

**Sérieux**

- **S4 — un bon peut rester `reserved` sans issue** : une commande épargnée à la
  clôture (`in_progress`) puis refusée reste `placed`/`failed`, et plus aucun
  balayage ne la relit. Ce n'est pas un trou du bon, c'est un trou de
  l'abandon du règlement (la commande elle-même reste pendante) ; le lot C ne
  libère pas pour autant — libérer une commande qui se reprend, c'est la double
  dépense (D7). Le rattrapage de nuit **signale** à la cloche tout bon
  `reserved` dont la commande n'est ni payée ni annulée passé son jour de
  service. **Le trou de l'abandon est à ouvrir en TODO dans `order/`.**
- **S5 — l'empreinte d'idempotence** (`order-fingerprint.ts`) reçoit
  `voucherId` : sans lui, rejouer la clé avec un autre bon rendrait la
  première commande comme un rejeu.
- **S6 — le contrat `loyalty.ts` n'accepte pas `reserved`.** Il est élargi, et
  le back-office l'affiche, dans le même lot. Risque nul au déploiement : aucun
  bon n'existe tant qu'E1 n'ouvre pas la conversion. Faute d'état `used`,
  l'écran lit la commande : `reserved` sur une commande vivante s'affiche
  « utilisé sur CMD-… ».
- **S7 — la facture devra dire l'assiette HT par taux**, que `vatShares` ne
  fige pas. La TVA figée est juste ; la base par taux se **recalcule** des
  lignes figées par une règle écrite maintenant pour le chantier facture :
  chaque remise répartie au prorata du HT de chaque taux, **plus grand reste**
  pour que la somme retombe au centime. Déterministe, puisque tout ce qu'elle
  lit est figé.
- **S8 — le port `orders → loyalty`** est lié par un module `@Global` dans
  `appBootstrap/` (forme de `debtor-mandate.module.ts`) : `LoyaltyModule`
  importe déjà `OrdersModule`, l'inverse ferait un cycle. `lint:context-boundaries`
  ne regarde pas l'intérieur de `b2b` : la frontière tient par discipline.
- **S9 — la libération** prend le verrou du titulaire, comme la réservation.
  `AbandonOrderHandler` et `PendingSettlementSweepService` reçoivent un
  `UnitOfWork` (le balayage tourne hors du `uow.run` de la clôture,
  `close-production-day.handler.ts`).

**Mineurs** : l'unicité de `parentVoucherId` existe déjà (`@unique` plein,
suffisant) ; `voucherDiscountCents` est borné à 0 ; l'intention orpheline
s'annule dans `placeOnce`, qui l'a sous la main, pas dans le `catch`
d'`execute` ; « au retrait » est retiré de C5 — tout total nul est
`not_required`.

**Tranché par Hugo le 2026-09-27** (« ok pour les trois ») : C6 — l'assiette
est le HT après remise **et** bon ; B2 — le reliquat échu s'éteint, journalisé ;
S4 — TODO ouvert :
[`../order/todo-commande-epargnee-a-la-cloture-puis-refusee.md`](../order/todo-commande-epargnee-a-la-cloture-puis-refusee.md).
Le lot C est lancé.

## 12. Conception du lot E1 (2026-09-27)

> Doc-first. Le mécanisme (livre, conversion, bon) est bâti et contredit ; E1
> ne fait que l'**exposer** au particulier. Vérifié soi-même plutôt que
> `vitruve` (§9 bis du CLAUDE.md) : aucune règle d'argent neuve, aucune
> migration. Ouvert le 2026-09-27 : `ConvertLoyaltyPointsHandler` (verrou,
> solde relu), `@ActingCompany()` (`my-shop-quote.controller.ts`),
> `earningFor` (`order-earning.ts`).

**Qui** : un particulier **connecté**, dans son espace personnel
(`@ActingCompany()` nul). Un espace société, un invité : rien (lot F). Le
programme fermé au public (`openToPublic` faux ou réglage absent) : la
boutique ne montre rien, et les routes rendent `{ open: false }`.

### E1.1 — Les routes, `me/loyalty`

| Route                         | Rend                                                                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET me/loyalty`              | `{ open: false }` ou `{ open: true, balancePoints, pointsPerStep, stepValueCents, convertibleSteps, vouchers[], entries[] }` |
| `POST me/loyalty/conversions` | corps `{ steps, expectedBalancePoints }` → 201 `{ voucherId }`                                                               |

- `vouchers[]` : les bons du titulaire, `available` et `reserved` d'abord
  (valeur HT, date limite, et pour un `reserved` le numéro de la commande),
  puis les 20 derniers `expired`/`cancelled`.
- `entries[]` : les 20 dernières lignes du livre, dans les mots du client
  (« Commande CMD-… », « Conversion en bon », « Ajustement »). Le motif d'un
  ajustement staff n'est **pas** exposé : il est écrit pour le staff.
- Le titulaire se prend **du principal**, jamais du corps : `user:<userId>`.
- 🔴 **`expectedBalancePoints` contre le double clic.** La conversion n'a pas
  de clé d'idempotence ; deux clics convertiraient deux fois, légitimement aux
  yeux du livre. Sous le verrou, si le solde relu diffère de celui que l'écran
  affichait, 409 « votre solde a changé, rechargez ». Le second clic échoue
  toujours : le premier a baissé le solde. Pas de table de clés pour ça.
- Les handlers existants servent : une query `GetMyLoyaltyQuery` neuve (lecture
  du livre et des bons par le titulaire, ports existants ou un lecteur neuf),
  et `ConvertLoyaltyPointsCommand` gagne `expectedBalancePoints: number | null`
  (nul depuis le staff, qui ne convertit pas aujourd'hui — vérifier).

### E1.2 — « Vous gagnerez N points »

Le devis connecté (`POST shop/quote/mine`) gagne
`loyaltyPointsToEarn: number | null` : nul si le programme est fermé au
public, si l'espace est une société, ou si l'assiette est vide. Calculé par
**la même fonction** que le crédit (`earningFor`), derrière un port que
`orders` déclare et que `loyalty` implémente, lié par le module `@Global` du
lot C. Une règle recopiée côté front divergerait au premier changement
d'assiette.

Le devis anonyme ne le porte pas (clé absente, pas nulle — contrat servi).

### E1.3 — La boutique

- ⚠️ **Corrigé le 2026-09-27** : « une carte de `mon-compte` » était faux —
  `mon-compte` est gardé par `companyWorkspaceGuard`, fermé à l'espace
  personnel, seul espace où la fidélité s'ouvre. **Hugo : une entrée à part,
  « Ma fidélité »**, route `ma-fidelite`, lien visible seulement en espace
  personnel quand le programme est ouvert.
- **Ma fidélité** : le solde, ce que
  vaut un palier (« 1 000 points = un bon de 5,00 € HT »), le nombre de paliers
  convertibles, un choix du nombre de paliers et une conversion confirmée en
  ligne (`fold-inline-confirm`) ; la liste des bons (« 5,00 € HT, valable
  jusqu'au 27 septembre 2027 », « utilisé sur CMD-… ») ; l'historique.
- Le bon s'affiche **HT avec sa mention** : c'est sa vraie valeur, et le
  client verra la baisse réelle au paiement (E2). Une phrase le dit : « Un bon
  réduit le prix hors taxe de vos achats ; la baisse sur votre total est
  un peu plus grande, TVA comprise. »
- Le décompte du panier : une ligne discrète « Vous gagnerez N points » sous
  le total, seulement si `loyaltyPointsToEarn > 0`.
- Programme fermé : ni carte, ni ligne. Rien ne dit « bientôt ».

### E1.4 — Tests

Back : e2e du mur (un client ne lit ni ne convertit que ses points ; un
espace société reçoit `open: false` et 403 à la conversion), du programme
fermé, du double clic (deux POST avec le même `expectedBalancePoints` → 201
puis 409, un seul bon), du devis avec et sans programme. Front : specs des
composants neufs, états ouvert/fermé/vide, conversion confirmée, 409 affiché.
