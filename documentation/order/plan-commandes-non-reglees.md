# Plan — une commande carte non réglée n'est pas une commande

**Statut** : 📐 plan du 2026-10-09, décidé par Hugo le même jour. Rien n'est bâti.
Touche l'argent (règlement, chiffre d'affaires) → `vitruve` avant de bâtir.

## 0. Le constat (production, 2026-10-09)

Hugo, particulier connecté, a lancé quatre commandes pour une seule payée :

| Commande | status    | payment_status |
| -------- | --------- | -------------- |
| `…0XXX`  | placed    | paid           |
| `…NYFH`  | placed    | pending        |
| `…C9SA`  | cancelled | failed         |
| `…NDEV`  | placed    | pending        |

> « dans mes commandes j'ai plein de commandes qui sont apparues alors que je
> n'avais pas validé le paiement » · « dans commercial ça me met chiffre
> d'affaires du mois 3 € alors que ça devrait mettre 1,90 » · « reglement
> reglée cb était une information fausse en front » — Hugo, 2026-10-09.

Le fournil, lui, est protégé : `settlementAllowsProduction`
(`b2b/orders/domain/services/production-plan.ts`) et `settlementWhere`
(`infrastructure/plan-filter.ts`) excluent `pending` et `failed`.

## 1. Les causes (relues le 2026-10-09)

1. La commande est écrite **avant** le paiement (`place-shop-order.handler.ts`,
   `place-order.handler.ts` : `payByCard` → `pending`), puis la boutique mène à
   `/reglement/:id`. Le panier est vidé à la passation : un nouvel essai est un
   nouveau panier, sous une nouvelle clé d'idempotence, donc une nouvelle
   commande.
2. Rien n'expire une commande `pending` avant la clôture de la journée
   (`pending-settlement-sweep.service.ts`, appelé par `close-production-day`).
   Fermer l'onglet ne fait rien ; seul « Abandonner » annule.
3. « Mes commandes » ne filtre pas le paiement : `listPersonal`
   (`prisma-order.reader.ts`) et `isLive` (`mes-commandes/order-rows.ts`).
4. L'étiquette « Réglée · CB » (`client/copy/screens/orders.copy.ts`,
   `payCard`) se lit sur le **régime** (carte), pas sur `paymentStatus` :
   `history-table.ts`, `order-detail.ts`.
5. Le chiffre d'affaires du mois du cockpit commercial
   (`lfd-backoffice-frontend/src/app/commercial/cockpit/revenue-pace/`) compte
   les commandes passées sans regarder leur règlement — source API à retrouver.

## 2. Ce qu'on bâtit

### 2.1 « Mes commandes » ne montre que des commandes

- Liste et historique : une commande **carte** n'apparaît que si elle est
  `paid` (ou remboursée). Les commandes au compte, gratuites, ne changent pas.
- **Exception** : la commande `pending` la plus récente de la personne,
  si elle n'a pas expiré, apparaît en tête avec l'état « Paiement à finaliser »
  et un bouton « Régler » vers `/reglement/:id` (aucune nouvelle commande).
- Le filtre vit **côté API** (la boutique ne trie pas ce qu'elle ne doit pas
  voir), pour la liste personnelle comme pour celle d'une société (un pro qui
  paie par carte a le même défaut).

### 2.2 Une seule commande carte en attente par acheteur

- À la passation d'une commande carte, les commandes `pending` antérieures du
  **même acheteur** (même `placedByUserId`, même espace : société ou perso)
  sont annulées, et leur intention Stripe aussi — par le même chemin
  qu'« Abandonner » (`abandon-order.handler.ts`), jamais par une écriture nue.
- Une intention déjà encaissée entre-temps (course) n'est jamais annulée : le
  chemin d'abandon le refuse déjà, ou le webhook `succeeded` gagne ; le
  bâtisseur cite où.

### 2.3 Expiration à 30 minutes

- Une commande carte `pending` depuis **30 minutes** est annulée avec son
  intention, par un balayage périodique (le même service que la clôture,
  `PendingSettlementSweep`, avec une fenêtre en âge), déclenché par le cron
  existant de l'API (`wrangler.jsonc` / `container/worker.ts`, cf. l'autopilot
  de la facture du mois) — pas un `setInterval` en mémoire.
- Le délai est une constante nommée du domaine.
- Les deux `pending` actuelles de production (`…NYFH`, `…NDEV`) partent au
  premier passage, sans geste en base.
- Le courriel d'expiration existe (`send-payment-expired-mail.handler.ts`) :
  le bâtisseur dit s'il part dans ce cas, et propose de ne pas l'envoyer pour
  une commande remplacée (§2.2).

### 2.4 L'étiquette dit le vrai règlement

- Carte : `paid` → « Réglée · CB » ; `pending` → « À régler » ;
  `failed` → « Paiement refusé » ; remboursée → inchangé.
- Le contrat de la vue client porte déjà `paymentStatus` ? Le bâtisseur le
  vérifie ; sinon il l'ajoute (`packages/contracts`, `pnpm test` racine).

### 2.5 Le chiffre d'affaires ne compte que le réglé

- Le CA du mois (et tout total du cockpit qui en dérive) ne compte qu'une
  commande **réglée** : carte `paid`, ou au compte / gratuite ; jamais
  `pending`, `failed`, ni annulée. Remboursement : déduit si la source le
  sait déjà, sinon signalé.

## 3. Tests attendus

- `listPersonal` / liste société : `pending` ancienne et `failed` absentes ;
  `pending` récente présente et marquée.
- Passation carte : la `pending` précédente du même acheteur est annulée, celle
  d'un autre acheteur non ; une `paid` jamais.
- Balayage : 29 min reste, 31 min annulée ; `paid` intacte.
- Étiquettes front : les trois cas.
- CA : une `pending` et une `failed` n'entrent pas.
- e2e : le parcours « deux essais, un paiement » ne laisse qu'une commande
  visible.

## 4. Arbitrages après `vitruve` (2026-10-09) — ils l'emportent sur le §2

1. **Périmètre : les commandes que le particulier passe lui-même à la
   boutique** (passation boutique, PaymentIntent direct, acheteur = auteur,
   clientèle `public`). Hors périmètre de l'expiration et du remplacement :
   les commandes passées par le staff pour un client (lien de règlement envoyé,
   payé quand le client le lit — `place-order-for-customer.handler.ts`), les
   commandes réglées par lien Checkout (Stripe a sa propre expiration), et les
   commandes d'une société (l'abandon pro ne touche pas Stripe). Elles gardent
   le balayage de clôture actuel.
2. **Un service neuf du commerce**, pas `PendingSettlementSweep` (port du
   fournil, cause `day_closed`) : `UnsettledShopOrderExpiry`, avec une cause
   neuve — `expired` (30 min) et `replaced` (nouvelle passation). **Aucun
   courriel** pour ces deux causes : la personne a quitté la page ou relancé
   elle-même ; `SendPaymentExpiredMail` continue de ne répondre qu'à
   `day_closed`.
3. **« Mes commandes »** : une commande carte annulée sans avoir été payée
   n'apparaît plus ; une commande carte `placed` non réglée (`pending` OU
   `failed`) apparaît avec l'étiquette « À régler » / « Paiement refusé » et un
   bouton « Régler » vers `/reglement/:id`. Expiration et remplacement en
   laissent au plus une. Une commande `failed` + `placed` expire aussi.
4. **Remplacement** : seulement l'acheteur qui passe lui-même (jamais le staff
   pour lui), même espace personnel. Si l'annulation de l'ancienne intention
   rend `in_progress` / `already_paid`, l'ancienne commande est **gardée**
   (elle est en train d'être payée), la nouvelle passe quand même, et c'est
   journalisé — jamais un refus de la nouvelle passation.
5. **Déclenchement** : par le cron de l'API. Réutiliser une entrée existante
   de période ≤ 10 min si elle existe, sinon en ajouter une (`*/5`). La
   promesse est « au plus 35 min », dite ainsi dans le code. Route admin
   dédiée, protégée comme l'autopilot de la facture du mois.
6. **Effet fournil** : neutre (`settlementAllowsProduction` exclut déjà
   `pending`/`failed`). Le rejeu « épargnée puis payée hors plan » de la
   clôture ne concerne pas ce périmètre : une commande annulée par
   l'expiration a son intention annulée ; un paiement arrivé quand même passe
   par le chemin « à rembourser » existant, que le bâtisseur cite.
7. **CA** : les quatre lecteurs qui partagent `REVENUE_ORDER_STATUSES`
   (`prisma-order-metrics.reader.ts`, secteurs, portefeuille, volume de marché)
   excluent une commande carte non `paid`. Pas de migration.
