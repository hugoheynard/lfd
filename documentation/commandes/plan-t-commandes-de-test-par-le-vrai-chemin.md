# Plan T — les commandes de test passent par le vrai chemin

> 🟡 **Tranche 1 bâtie le 2026-10-25** : `test/order-factory.ts` (`placeOrder`
> par `PlaceOrderCommand`, `placeOrderForCustomer` par
> `PlaceOrderForCustomerCommand`), 9 suites migrées sur 46, e2e complète
> verte (429 suites). Exceptions gardées et datées : `created_at` recalé pour
> antidater (aucune route ne passe une commande dans le passé),
> `fromSubscriptionId` posé après une vraie passation (aucun test ne génère
> d'abonnement). **Recompté** (toute chaîne qui commence par le préfixe,
> `test/` et `src/`) : `CMD-` 423 occurrences dans 208 fichiers, `LFC-` 75/31,
> `TRN-` 5/5, `ORD-` 186/82 — le § 0 sous-comptait. **Reste** : 37 fichiers en
> tranches, le renommage des écritures brutes restantes, puis le CHECK
> `^ORD-([1-9][0-9]*|[A-Z0-9]{8}-[A-Z0-9]{4})$`.
>
> 🟡 **Tranches 2 à 5 bâties le 2026-10-25** (suites touchées vertes, une
> chaîne à la fois) : 33 fichiers de `test/` de plus, dont les scènes
> `order-account-cancel`, `order-staff-cancel` (commandes sorties dans
> `apps/lfd-api/test/order-staff-cancel-orders.ts`), `order-customer-cancel` et
> `internal-transfer`. Le vrai chemin a refusé quatre fixtures impossibles
> (un particulier au village sans ouverture publique, une tranche hors de
> l'ouverture pro, une commande publique après l'arrêt du plan, une livraison
> pro sur une échéance non inscrite). Écritures brutes GARDÉES, datées dans
> leur fichier : `day-supervision` (matrice d'états d'un lecteur),
> `customer-sheet` (statut `draft`, plus écrit par aucune route),
> `pickups-before-s2-migration` (donnée d'avant migration), identifiant
> choisi de `order-account-cancel-scene` ; numéros au format `ORD-<n>`. **Reste** :
> 15 fichiers (scènes `collection-*`, `delivery-rounds`/`delivery-routing` —
> 102 et 42 suites clientes —, factures, relevés, `audiences`), les
> `order.update` de simulation d'état, puis le renommage et le CHECK.

> 🟢 **Tranches 6 à 8 bâties le 2026-10-25, et le CHECK posé** (commit `aef0c7b4f`) :
> les 15 fichiers restants passent par la vraie passation — relevés, dossier,
> factures, prélèvement (le demi-centime par une vraie mercuriale à 10 500
> millicentimes), `audiences`, `delivery-rounds-scene` (adresse au carnet,
> échéance, zone). Nouveau `test/served-order.ts` (bon servi avant une
> clôture, horloge FIXE ramenée à l'instant de passation). Écritures brutes
> GARDÉES et datées : `delivery-routing-scene` (commandes sans créneau ni
> ligne, que le calcul de tournée mesure), les formes de lecture de
> `cycle-statements` (deux taux, TVA non ventilée, total nul) et la surtaxe
> figée d'`invoice-dossiers`. Numéros `CMD-`/`LIV-`/`TRN-` et `LFC-` de
> commande renommés `ORD-…` (tests unitaires, semis `seed-fiche`,
> `seed-growth`) ; seuls les tests qui éprouvent un numéro atypique le
> gardent. Migration `20261025120000_le_numero_de_commande_a_son_format`.

> **Doc-first, 2026-10-24.** Hors de la chaîne E1–E9 de
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md),
> mais placé avant E6 (premier BL partiel, l'argent) : on ne bâtit pas sur
> des tests qui éprouvent un monde que la production ne voit pas. Pas
> d'argent, pas de frontière ; une **migration** (un CHECK) :
> `lecteur-de-migrations` au bâti. **Rien n'est bâti.**

## 0. Le constat (ouvert le 2026-10-24)

- **La règle** (CLAUDE.md § 5) : les données de test se construisent par les
  factories du domaine, jamais par un `prisma.x.create` qui contournerait les
  invariants.
- **Sa justification d'exception est fausse.** `apps/lfd-api/test/factories.ts`
  (l. 4-5) : « elles écrivent par Prisma parce que le contexte commerce n'a
  pas encore d'agrégat de domaine ». L'agrégat `Order` existe
  (`b2b/orders/domain/entities/order.ts`, `Order.draft`, `Order.revise`) au
  moins depuis le 2026-08-19.
- **L'ampleur** : 46 fichiers de `test/` créent des commandes par Prisma ;
  128 fichiers de `test/` et `src/` posent un numéro de commande en dur — `CMD-`
  93 fois, `LFC-` 4, `TRN-` 1, `ORD-` (le seul format réel) 40.
- **Le coût prouvé** : E1 a levé sur un numéro `CMD-…` dans l'unité de travail
  de l'arrêt du plan ; aucun test ne l'avait vu, parce qu'aucun ne semait un
  vrai numéro au bon endroit.
- **La fixture d'E4a** (`delivery-note-terms.fixture.ts`) écrit `vatShares`
  sous une forme (`{ratePercent, baseCents, vatCents}`) qui n'est pas celle que
  `orders` écrit (`{rate, amountCents}`, `prisma-order.repository.ts`).

## 1. Ce que fait T

1. **Le chemin** : une factory de test `placeOrder(…)` qui passe par la
   **commande de passation par le bus** (celle que servent `POST /orders` et
   `POST /admin/orders`) : le numéro, les prix, la TVA, les contrôles sont ceux
   de la production. Les factories Prisma de commande restantes deviennent des
   enveloppes de ce chemin, ou disparaissent.
2. **Les exceptions** : une suite qui a besoin d'un état **impossible par les
   routes** (simuler une panne, une donnée d'avant une migration) le dit par
   un commentaire daté au-dessus de l'écriture brute. Rien d'autre n'écrit
   `orders` en Prisma dans `test/`.
3. **L'interdiction** : un CHECK en base sur `orders.order_number` — le format
   court `ORD-<chiffres>` ou l'ancien `ORD-<8>-<4>` (les deux formats réels ;
   comptage de production du 2026-10-24 : 0 numéro atypique). Une donnée
   inventée devient irréalisable, y compris en test.
4. **Les fixtures** : `CMD-` / `LFC-` / `TRN-` → `ORD-…` dans les fichiers qui
   gardent une écriture brute justifiée ; la forme de `vatShares` de la
   fixture d'E4a alignée sur celle de `orders`.
5. **La justification** de `test/factories.ts` réécrite, datée.

## 2. En tranches

Le lot touche beaucoup de suites e2e : bâti en tranches d'environ dix
fichiers, une chaîne e2e à la fois, chaque tranche verte avant la suivante ;
la migration du CHECK **en dernier**, quand plus rien ne sème un numéro
atypique.
