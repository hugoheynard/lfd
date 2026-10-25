# Plan A2 — changer les quantités d'une commande inscrite au plan

> **Doc-first, 2026-10-25, deuxième version. Rien n'est bâti.** Deuxième lot
> de l'[étude de l'arrêt du plan](../etude-arret-du-plan-publication.md)
> (§ 5), après A1 ([`../annulation/plan-a1-retirer-une-commande-inscrite.md`](../annulation/plan-a1-retirer-une-commande-inscrite.md)).
> La première version, écrite trop vite, a été contredite par `vitruve` sur
> des faits qu'un fichier suffisait à voir (§ 6). Celle-ci part de ce qui a
> été **ouvert** le 2026-10-25. Touche le compte du four et l'argent :
> `vitruve` à nouveau avant Hugo. Chemins relatifs à `apps/lfd-api/src/`.

## 0. Ce qui existe

- **La révision** ([`plan-modifier-une-commande.md`](plan-modifier-une-commande.md)) :
  M1, M3, M4 bâtis ; **M2 (l'argent d'une carte) ne l'est pas** —
  `ensureRevisable` refuse toute commande payable par carte
  (`CardOrderNotRevisableError`, `b2b/orders/domain/entities/order-revision.ts`).
  Elle refuse aussi un départ incomplet décidé (`ensureNoShortfallDecision`)
  et passe par la règle commune de l'annulation, en dur sur
  `BEFORE_INSCRIPTION` (`OrderRevising.standingOf`,
  `b2b/orders/application/services/order-revising.service.ts`) : prête,
  remise, engagée en comptabilité, remboursement en vol → refus.
- **Le guichet du fournil** `OrderRevisionDesk.note` rend `noted` ou
  `inscribed` (= refus).
- **Le compte du four** se refait par `countOf`
  (`production/domain/services/production-count.ts`), qui **remet les coches
  à nul** : le retirage et le lancement matérialisent d'abord les coches en
  fournées (`ProductionDay.materialize`). Les fournées sont tenues **par
  article pour la journée**, jamais par commande.
- **La feuille du colisage** naît du fait `production.packing_list_drawn`,
  écrite en `createMany … skipDuplicates` par (jour, commande, article) :
  « inscrite si elle n'y est pas, jamais réécrite »
  (`packing/infrastructure/prisma-packing-shadow.ledger.ts`).
- **A1 ne fait jamais baisser le compte du four** : une commande retirée
  reste comptée, le surplus va en réserve, et un fait explique l'écart.

## 1. Le périmètre de départ

Hugo, 2026-10-25, pour un pro : « à partir du moment où c'est parti en prod
c'est de la quantité ». A2 est ce geste, **et rien de plus** :

| Qui               | Quelles commandes    | Quoi                                               | Jusqu'à                                                           |
| ----------------- | -------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| **le staff** seul | **au compte** (pros) | **les quantités des lignes existantes**, 0 compris | la commande prête, et tant qu'aucun bac de livraison n'est vivant |

- **Pas les particuliers** : leurs commandes se paient par carte, et la
  révision carte (M2) n'existe pas. A2 n'ouvre rien que M2 n'a pas ouvert.
- **Pas d'article nouveau** : un article neuf n'a pas de ligne au colisage,
  et le fait d'arrêt pourrait l'écrire plus tard avec l'ancienne
  composition. Quantités seulement — la clé (jour, commande, article) ne
  bouge jamais, donc `skipDuplicates` ne peut rien réintroduire.
- **Pas la date, le mode, le lieu** : refusés comme aujourd'hui.
- **« Jusqu'à la commande prête »**, pas « jusqu'au bac fermé » : la règle
  commune refuse déjà une commande prête, un bac rouvert garde la commande
  prête — même borne qu'A1.
- **Un bac de livraison vivant** (déclaré, partagé, chargé) → refus nommé,
  comme `delivery_bin` d'A1 : une hausse pourrait ne plus tenir dans le bac
  ou la demi-caisse.

## 2. Ce que chaque poste fait

### 2.1 Le fournil — ce qu'on a demandé au four ne baisse jamais

`production_order` porte **ce qui a été demandé au four** pour la
commande. Après l'arrêt, chaque ligne devient `max(demandé, révisé)` :

- **une hausse** monte la ligne et le compte : le four cuit la différence ;
- **une baisse ne touche pas le fournil** — même règle qu'A1 : ce qui est
  demandé ou sorti reste, le surplus ira en réserve au colisage.

Sous le verrou de la journée : `materialize()` d'abord (les coches deviennent
des fournées), puis la ligne montée, puis `countOf` sur toutes les commandes
et les réassorts figés — exactement le chemin du retirage, extrait en une
méthode d'agrégat partagée plutôt que recopié. Les commandes retirées par A1
restent comptées comme avant.

Le guichet `OrderRevisionDesk.note` gagne une autorisation et une issue
`raised` / `unchanged` (hausse ou non) ; fait journalisé et durable
`production.order_quantities_raised` (jour, commande, lignes montées, de →
à), seulement sur une hausse. Aucun abonné ; la fiche d'atelier et le
dossier du jour le lisent pour dire « +2 baguettes, ORD-… ».

### 2.2 Le colisage — la feuille dit la vérité de la commande

Port déclaré et implémenté par le colisage, `PackingRevisionDesk.revise(day,
orderId, lines)` (`packing/channels/commerce/`, précédent
`PackingWithdrawalDesk`), dans la transaction :

- **feuille absente** (fait d'arrêt pas encore livré) : les lignes ne sont
  pas encore là ; le guichet écrit la feuille et ses lignes **révisées** à
  partir de l'en-tête que le fournil sert (`InscribedOrderHeaderReader`,
  A1.2) ; le fait arrivera ensuite et `skipDuplicates` gardera les lignes
  révisées ;
- **feuille présente** : `PackingSheet.reviseDue(lines)`, gardée par
  `assertNotWithdrawn` et refusée si le bac est fermé. Une ligne due qui
  passe **sous ce qui est au bac** rend l'excédent à la réserve par le
  service extrait du retrait d'un contenant (même figure que
  `packing-container-voiding.ts`, A1.2), jamais par `giveBack` ;
- **un manque signalé** (E6a) reste écrit ; si la nouvelle quantité due est
  couverte, le coliseur ferme le bac complet, ce qui efface le signal comme
  aujourd'hui. Aucun fait de plus.

Fait journalisé `packing_sheet.revised` (jour, commande, lignes de → à,
rendu à la réserve).

### 2.3 Les verrous et l'idempotence

Ligne `orders` → journée du fournil → feuille → bac (`BinDesk`, lecture
seule : vivant → refus) → réserve par article trié. La révision porte son
numéro (R7 : 409 si elle a changé entre-temps) ; un rejeu du même numéro ne
fait rien.

### 2.4 Le bon de livraison et l'argent

- Le BL prévu suit la commande (E2) : réécrit, `content_version` monte,
  l'avertissement de réimpression s'affiche.
- Au compte : la facture lit les montants facturables recopiés de la
  commande (E6c) ; une commande engagée est déjà refusée par la règle
  commune.

## 3. Questions pour Hugo

| #   | Question                                                          | Proposition         |
| --- | ----------------------------------------------------------------- | ------------------- |
| Q1  | Le staff seul, pros au compte, quantités seulement                | Oui, pour commencer |
| Q2  | Une baisse ne fait pas baisser le four (le surplus va en réserve) | Oui, comme A1       |
| Q3  | Refus dès qu'un bac de livraison est vivant                       | Oui                 |

## 4. Lots

A2.1 le fournil (guichet, montée, recompte partagé avec le retirage) ;
A2.2 le colisage (guichet, feuille, excédent à la réserve) ; A2.3 la
révision staff ouverte au-delà de l'inscription, écrans, traces.

## 5. Ce qui devient irréversible

Le nom et la charge de `production.order_quantities_raised` ; les types
`packing_sheet.revised` au journal.

## 6. Contradiction de `vitruve` sur la première version (2026-10-25)

Retenu : le recompte effaçait les coches (B1) ; un plancher par commande
n'a pas de donnée (B2) — remplacé par « ce qui est demandé au four ne
baisse pas » ; la feuille absente (B3) ; M2 non bâti (B4) — particuliers
hors périmètre ; asymétrie avec A1 (S5) ; fait de la hausse (S6) ; bac de
livraison (S7) ; manque décidé déjà refusé, signalé traité (S8) ; bac
rouvert (S9) ; verrous et idempotence (S11) ; engagement (S12).
Ouvert : les réservations de réassort face à une hausse qui puise dans la
réserve (S10) — une hausse fait **cuire**, elle ne puise pas : à confirmer
par la contradiction.

## 7. Seconde contradiction de `vitruve`, et ce qui est tranché (2026-10-25) — l'emporte sur les §§ 1 à 5

Hugo : « continue un maximum, prends les meilleures décisions ». Chaque
bloquant se règle en **réduisant** le périmètre, pas en ajoutant de la
mécanique.

| Objection                                                                                       | Décision                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1 — une ligne à 0 ne s'écrit pas (`packing_line.quantity > 0`) et revient par `skipDuplicates` | **Quantité ≥ 1.** Tout à 0, c'est A1 ; retirer un article viendra plus tard.                                                                                                                                                                                                                          |
| B2 — la feuille absente ne s'écrit pas sans inventer `drawnAt`, `containerMode`, `productName`  | **Refus temporaire** nommé (« le colisage n'a pas encore reçu la commande, réessayez ») : la fenêtre entre l'arrêt et la livraison du fait dure quelques secondes.                                                                                                                                    |
| B3 — `max` sur `production_order_line` ferait mentir 18 lecteurs                                | **Deux grandeurs.** Les lignes de la commande au fournil disent le **dû**, dans les deux sens (la fiche, le dossier, la supervision disent vrai). Le **compte du jour par article** (`production_count`) ne baisse jamais après l'arrêt : `max(compte précédent, countOf(…))`, après `materialize()`. |
| B4 — `delivery_bin` n'existe pas ; `before_packing` refuse toute livraison                      | Une valeur d'autorisation **propre à la révision** (`staff_quantities`), hors de `cancellationAllowanceOf` (A1 intact). Le bac vivant est vérifié au colisage : un contenant de la feuille porte un bac → refus nommé.                                                                                |
| S1 — l'excédent au bac n'a pas de contenant désigné                                             | **Baisse sous ce qui est au bac : refusée** (« retirez d'abord du bac au poste »). Hausse : la ligne due monte, `packedAt` s'efface si elle n'est plus complète.                                                                                                                                      |
| S2 — la réouverture efface le plancher                                                          | **Voulu** : rouvrir exige que rien n'ait commencé ; le ré-arrêt repart du dû réel.                                                                                                                                                                                                                    |
| S3 — `OrderRevisionDesk.note` ne porte pas de lignes, et plusieurs journées                     | La signature change : `note(days, orderId, revision, lines, allowance)` ; une révision après l'arrêt ne change pas de jour (refus en amont), donc une seule journée touchée.                                                                                                                          |
| S4 — le BL hors de la chaîne de verrous                                                         | `orders` → journée → feuille → BL, comme A1 ; tests de course A2 × A1, A2 × décision de manque, A2 × fermeture du bac.                                                                                                                                                                                |
| S6 — une hausse sans borne                                                                      | Acceptée : le compte monte, la fiche montre ce qui reste à cuire. Le four décide ; aucun puisage dans la réserve.                                                                                                                                                                                     |
| Mineurs                                                                                         | `releaseToStock` existe (rien à extraire) ; E6c n'est pas atteint avant « prête » ; irréversibles : `production.order_quantities_raised`, `packing_sheet.revised`, la valeur `staff_quantities`.                                                                                                      |

**Lots** : A2.1 le fournil (guichet élargi, dû révisé, compte plancher,
fait de hausse) ; A2.2 le colisage (`reviseDue`, refus bac/feuille
absente/baisse sous le bac, fait) ; A2.3 le commerce et l'écran (révision
staff des pros au compte ouverte après l'arrêt, quantités seulement).
