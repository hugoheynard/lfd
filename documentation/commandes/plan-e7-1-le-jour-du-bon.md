# Plan E7.1 — le bon de livraison porte son jour, et le jour lit ses bons

> **Doc-first, 2026-10-25.** Lot E7.1 du programme
> [`plan-e7-le-reliquat.md`](plan-e7-le-reliquat.md) (§ 5), sur le recensement
> [`e7-recensement.md`](e7-recensement.md). Règle de Hugo : se rapprocher le plus
> de la réalité — **on fabrique, colise et livre des envois, pas des
> commandes**. Touche la production et une migration : `vitruve`. **Rien n'est
> bâti.** Tant qu'aucun BL-2 n'existe (E7.5), ce lot ne change **rien** de ce
> que voit l'atelier : c'est sa propriété de sûreté.

## 0. Ce qui existe

- Le BL-1 naît à l'arrêt du plan (E1), prévu, puis suit la commande (E2) ;
  il n'a pas de jour à lui : son jour est `orders.requested_delivery_date`.
- Les sources « du jour D » (recensement § 1, **JOUR**) sélectionnent les
  commandes par `requestedDeliveryDate = D` et lisent leurs **lignes de
  commande** : `listForProduction`, `findForPacking`, `prisma-day-orders.source.ts`,
  `prisma-expected-production.reader.ts`, `prisma-day-supervision.reader.ts`,
  `prisma-site-arrival-orders.reader.ts`, `prisma-order-plan-release.ts`,
  `prisma-delivery-orders.reader.ts`, `prisma-transfer-orders.reader.ts`,
  `prisma-deadline-orders.reader.ts`, `get-packing.handler.ts`,
  `prisma-unconfirmed-deliveries.reader.ts`, et côté retrait `quality-hold.ts`,
  `handover-departure-holds.ts`, `delivery-run-sheet.reader.ts`.

## 1. Le modèle

- **`delivery_note.service_day`** (`date`, NOT NULL après rattrapage) : le jour
  où l'envoi est fabriqué, colisé et livré. BL-1 : `= requested_delivery_date`
  (posé à sa naissance ; rattrapé en SQL pour les BL existants — même table
  `public`, aucune jointure inter-schémas). BL-2 : le jour choisi (E7.5).
- **« L'envoi du jour D »** est une notion du domaine du commerce : pour une
  commande, l'envoi qui se fabrique / colise / livre ce jour-là, avec **ses
  lignes**. Avant l'arrêt du plan (pas encore de BL), l'envoi du jour est la
  commande elle-même (ses lignes, son jour demandé) ; après, c'est le BL vivant
  dont `service_day = D`.

## 2. La bascule des sources du jour

**Une seule fonction de sélection** (`dayShipmentsWhere(D)`), écrite une fois
comme `planWhere` : une commande appartient au jour D si `requested_delivery_date
= D` **et** aucun BL ne l'a déplacée, **ou** si un BL vivant de rang > 1 a
`service_day = D`. Chaque source du § 0 l'épand et lit **les lignes de
l'envoi** (BL si présent, sinon commande). Tant qu'aucun BL-2 n'existe, la
sélection et les lignes sont **identiques** à aujourd'hui — un test de non-
régression le prouve sur le scénario de démonstration (mêmes listes, mêmes
quantités, pour chaque source).

## 3. Ce qui reste en dehors d'E7.1

L'état par BL (E7.2), le retrait par BL (E7.3), la préparation par BL et ses
clés (E7.4), la naissance d'un BL-2 (E7.5).

## 4. Contradiction de `vitruve` (2026-10-25) — à reprendre avant tout bâti

**BLOQUANTS** :

1. **La sûreté « rien ne change sans BL-2 » est fausse à cause d'E6b** :
   `departing-source.ts` réécrit le BL-1 aux quantités décidées (lignes à 0,
   en-tête recalculé). « Lire les lignes du BL si présent » changerait ce que
   voient le colisage, la tournée, la supervision et la production attendue
   dès qu'un manque est décidé. **À trancher source par source : le prévu (la
   commande) ou ce qui part (le BL décidé).**
2. **Une seule fonction `where` ne couvre pas les sources** : `quality-hold.ts`
   et `handover-departure-holds.ts` reçoivent le jour d'une commande par un
   canal (`handover → b2b` interdit) — il faut un `serviceDay` dans le contrat
   du canal ; `planWhere` est un filtre de statut, sans date ; « aucun BL ne
   l'a déplacée » (annulé ? BL-1 annulé ?) n'est pas exprimé ; deux formes de
   lignes (`order_lines`, `delivery_note_line`) — quinze adaptateurs à
   réécrire, non chiffrés.
3. **`requested_delivery_date` est nullable**, et des BL naissent hors plan
   (Q-E5) : un BL sans jour ne se rattrape pas, et `SET NOT NULL` échouerait.

**SÉRIEUX** : qui réécrit `service_day` du BL-1 quand la date de la commande
change (réouverture, `replanFrom`) ; un découpage en déploiements à déclarer ;
une preuve d'« identique » source par source sur un corpus avec BL partiel, BL
annulé, commande sans jour, réouverture ; le fournil lit-il encore le commerce
après l'arrêt (`prisma-expected-production.reader.ts`).

**Constat de l'assistant (2026-10-25)** : le programme E7 est un chantier de
plusieurs semaines, pas un lot. Il reste **ouvert** ; E6 (départ incomplet,
reste abandonné) se déploie sans lui.
