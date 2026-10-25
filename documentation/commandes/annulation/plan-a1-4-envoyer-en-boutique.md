# Plan A1.4 — envoyer en boutique le pain rendu : une sortie de réserve

> 🟡 **2026-10-25 : A1.4 bâti, pas encore commité.** Migration
> `20261025220000_envoyer_la_reserve_en_boutique` ; `PackingStock.sendToShop`,
> port `ReserveShopRelease` (`packing/channels/commerce/`), commande
> `SendReserveToShop` (`b2b/resupply/`), route `POST
admin/reserve-shop-releases/:serviceDay`, panneau « Envoyer en boutique » à
> la Supervision. Vérifié au bâti (§ 1) : `asapToLaunch`, « Réassorts à
> produire » et l'onglet de Prod manager (donc la carte « Au plus tôt »)
> n'écartaient PAS l'origine `reserve` — ils l'écartent désormais ; colisage
> et livraison ne voient un « au plus tôt » que lancé, donc jamais celui-ci ;
> la réception d'un « au plus tôt » ne lit pas le lancement. E2E écrits, pas
> lancés (`apps/lfd-api/test/reserve-sent-to-shop.e2e-spec.ts`).

> **Doc-first, 2026-10-25, troisième version. Rien n'est bâti.** Lot A1.4 du
> [plan A1](plan-a1-retirer-une-commande-inscrite.md) (§ 4, Q4, Hugo). Rien
> ne s'encaisse par notre système : la boutique vend à sa propre caisse.
> Chemins relatifs à `apps/lfd-api/src/`.

## 0. Pourquoi une sortie de réserve, et pas un réassort lancé

Deux versions ont été écartées le même jour :

1. **« Envoyer un réassort du fournil »** : envoyer n'est pas lancer — le
   réassort n'entre au plan, au colisage et au transfert que par « Lancer »
   (R4a), réfuté par le bâtisseur en ouvrant le code.
2. **« Un réassort lancé servi par la réserve »** (choix (a)+(b) de Hugo),
   contredit par `vitruve` : `PackingStock.reserve` ne vérifie jamais le
   libre et réserve **après** le commit, par un abonné durable ; un point
   servi sur place prend sa part des fournées réelles
   (`packing-handoffs.service.ts`) ; le geste aurait dupliqué « Lancer »
   avec un ordre de verrous inversé. Tout venait de la même erreur : faire
   passer un **mouvement de stock** par la **planification**.

**Hugo, 2026-10-25 : « réécris A1.4 en version A et bâtis »** — la version la
plus définitive : le pain rendu est déjà fabriqué et au colisage ; l'envoyer
en boutique, c'est le sortir de la réserve. Le même mouvement servira demain
à tout surplus du colisage, pas seulement à une annulation.

## 1. Le modèle

- **La réserve du colisage gagne un compteur `sentToShop`** (`PackingStock`,
  `packing/domain/entities/packing-stock.ts`) : `free = reçu − rendu au
fournil − au bac − envoyé en boutique − réservé`. Une méthode
  `sendToShop(quantity, productName)` **refuse** si le libre manque, sur le
  modèle de `take` (`LineNotProducedYetError` → une erreur nommée propre).
  Colonne `sent_to_shop INT NOT NULL DEFAULT 0` sur la ligne de réserve —
  migration additive.
- **La boutique le reçoit comme un réassort.** Le geste crée un
  `SiteResupply` d'origine **`reserve`** (troisième valeur de
  `ResupplyOrigin`, CHECK `site_resupply_origin_known` élargi — migration
  additive), **envoyé**, visée « au plus tôt », **jamais lancé** : il n'entre
  ni au plan, ni au four, ni aux réservations, ni au transfert. Il apparaît
  au comptoir dans « Réceptionner les réassorts » (« Pain rendu, envoyé par
  la réserve ») et se réceptionne comme les autres.
  - **À vérifier au bâti** : que `asapToLaunch`, la carte « Au plus tôt » du
    fournil, le colisage, la livraison et Prod manager **écartent** l'origine
    `reserve` (sinon il serait proposé au lancement) ; que la réception d'un
    `asap` du jour fonctionne sans lancement.
- **Le transport** : avec le prochain passage vers la boutique, hors système
  au départ (dit dans l'écran). L'attacher au transfert du point est une
  suite possible, sans rien défaire.

## 2. Le geste

- **À la Supervision**, sur la ligne « rendu par une annulation » (A1.3) :
  « **Envoyer en boutique** » → choisir la boutique, les quantités (pré-
  remplies avec ce qui a été rendu, bornées au libre affiché) → envoyer.
  **Geste de superviseur**, sous `production_resupply:write` (droit
  existant, lot R1d), accordé à l'écran des rôles.
- **Une commande du commerce**, `SendReserveToShop` (`b2b/resupply/`), dans
  **une** unité de travail :
  1. crée le `SiteResupply` `reserve` envoyé ;
  2. appelle **dans la transaction** un port déclaré et implémenté par le
     colisage dans `packing/channels/commerce/` (précédent `ShortfallDesk`),
     `ReserveShopRelease.send(day, lines, resupplyId)`, qui verrouille la
     réserve **par SKU, triés** (`stocks.lock(day, sku)`, comme
     `releaseToStock`) et appelle `sendToShop` — un refus annule tout,
     réassort compris.
- **Idempotence** : la commande porte une clé fournie par l'écran (une par
  ouverture du panneau) ; un second envoi avec la même clé ne fait rien.
- **Trace** : fait journalisé `packing_stock.sent_to_shop` (jour, boutique,
  lignes, réassort) publié par le colisage dans la transaction.

## 3. Tests

- Domaine : `sendToShop` refuse au-delà du libre ; le libre baisse ;
  `SiteResupply` d'origine `reserve` naît envoyé, jamais lançable.
- Application : envoi + sortie, ou rien ; double envoi avec la même clé.
- E2E : annulation après l'arrêt → envoyer en boutique → réserve diminuée,
  compte du four **inchangé**, aucun réassort à lancer au fournil, réception
  possible au comptoir ; libre insuffisant → refus nommé ; sans le droit → 403.

## 4. Décisions du bâti (2026-10-25)

- **La réserve du jour seulement** : la sortie ne part que de la réserve de
  la journée du geste (heure de Paris, par le `Clock`). Une autre journée est
  refusée (409 `packing.reserve.not_today`, `SiteResupply.sentFromReserve`).
- **Pas d'annulation** : un réassort d'origine `reserve` ne s'annule pas, le
  pain est physiquement parti (409 `resupply.order.reserve_not_cancellable`,
  `SiteResupply.cancel`). Le comptoir n'a pas de bouton d'annulation sur la
  carte de réception (vérifié le 2026-10-25 : aucun écran n'appelle
  l'annulation d'un réassort).
- **Deux envois simultanés de la même clé** : le second bute sur la clé
  primaire du réassort (`SiteResupplyAlreadyWrittenError`), sa transaction
  est défaite, et il rend la même réponse que le rejeu — rien ne se refait.

## 5. Ce qui reste

- **La pierre tombale** : une commande annulée AVANT le tirage n'a rien
  rendu (`released` vide), donc pas de bouton. Son pain, fabriqué quand même,
  arrive en réserve comme du libre, sans geste dédié pour l'envoyer en
  boutique. Laissé de côté, décidé le 2026-10-25.
- **Le transport** reste hors système (§ 1).
