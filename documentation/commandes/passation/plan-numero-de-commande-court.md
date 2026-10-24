# Plan — un numéro de commande court : `ORD-1042`

> **Bâti le 2026-10-23, non commité.** Migration
> `20261023210000_le_numero_de_commande_court` (table `order_number_counter`,
> une ligne, déclencheur `order_number_counter_forward`), `formatOrderNumber`
> (`b2b/orders/domain/services/order-number.ts`), rang pris par
> `PrismaOrderRepository.place` dans la transaction de passation — seul
> écrivain de `order_number` en production, donc client, boutique, staff,
> devis et semis passent par lui. E2e `test/order-number.e2e-spec.ts`.

> **Doc-first, 2026-10-23.** Hugo : « pourquoi on met la référence en entier
> alors que seuls les 4 derniers caractères sont uniques ? » — puis « écris-le,
> format C-26-1042 », corrigé aussitôt : « juste CO-number », puis « ORD-1042 », sans année.

## 0. Ce qui existe (ouvert le 2026-10-23)

- Le numéro humain est fabriqué à la passation par
  `generateOrderNumber` (`apps/lfd-api/src/b2b/orders/infrastructure/prisma-order.repository.ts`) :
  `ORD-<instant en base 36>-<4 derniers caractères d'un ULID>`, rangé dans
  `orders.order_number` (`@unique`). L'identifiant réel de la commande reste
  son `cuid`.
- **Les 4 derniers caractères ne sont pas uniques** : environ un million de
  valeurs, donc une chance sur deux de collision vers 1 200 commandes. C'est la
  paire qui l'est, d'où sa longueur.
- **Rien ne décode le format** : `ORD-` n'apparaît hors du générateur que dans
  des commentaires, des exemples de phrase du journal et un exemple de saisie
  au comptoir (`handover-shop/scan-dialog`), vérifié le 2026-10-23 par
  recherche dans `apps/` et `packages/`.
- Le modèle d'un compteur sans trou existe : la numérotation des factures
  (lot ZA, compteur tenu en base).

## 1. Les règles

- **R1 — Format** : `ORD-<n>` — le préfixe déjà connu, puis un rang : `ORD-1`,
  `ORD-42`, `ORD-1042`. Il ne se confond pas avec un ancien numéro, qui porte
  toujours deux tirets (`ORD-MV84O2XA-Y9W3`). Ni année, ni zéros devant : il se dit et se tape au
  comptoir, et des zéros n'apporteraient rien.
- **R2 — Le rang** est **un seul compteur pour toute la plateforme**, qui ne
  repart jamais à 1 : `ORD-1042` désigne une seule commande, pour toujours.
- **R3 — Le compteur** est une ligne dans une table dédiée, prise sous verrou
  dans la transaction de la passation (`UPDATE … RETURNING`), comme celui des
  factures. Le rang est unique par construction ; un trou est permis (une
  passation qui échoue après le compteur le consomme) : une commande n'est pas
  une pièce comptable, et le trou est sans conséquence.
- **R4 — Le nouveau numéro va dans `orders.order_number`.** Tout ce qui
  affiche une commande — bons, courriels, Mes commandes, comptoir, back-office,
  journal, recherche — le montre sans changement de code. Les commandes déjà
  passées **gardent leur `ORD-…`** : il est imprimé sur des bons et cité dans
  des courriels partis.
- **R5 — La révision** (M1) et le futur remplacement des commandes payées par
  carte (M2) gardent le numéro de la commande.

## 2. Ce que ça touche

- Migration additive : la table du compteur (une ligne : le dernier rang).
- `generateOrderNumber` → le compteur ; il vit dans la transaction de
  `place`, donc dans l'adaptateur Prisma qui la tient.
- Les commentaires et exemples qui disent `ORD-…` (liste du §0) passent à `ORD-1042`.
- Le semis de développement et les e2e qui supposent la forme `ORD-` (à
  vérifier) suivent.

## 3. Tests

- Deux passations → `ORD-<n>` puis `ORD-<n+1>`.
- Passations concurrentes : rangs distincts, aucun doublon.
- Une commande ancienne garde son `ORD-…`.
