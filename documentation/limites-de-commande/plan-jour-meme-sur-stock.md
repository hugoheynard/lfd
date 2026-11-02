# Plan — le jour même des particuliers, sur le stock déclaré (version simple)

> **Partiel, 2026-10-21.** J1 est bâti par la **réception du réassort** (voir
> §7) ; J2 à J4 ne le sont pas. Demandé par Hugo le 2026-10-21 :
> « comment je règle, moi, le jour même pour le particulier ? » → « prépare le
> plan, version simple ». C'est la ligne « aujourd'hui » du modèle
> ([`schema-des-reglages.md`](schema-des-reglages.md) §0) : **demain se commande
> avant l'heure limite ; aujourd'hui se prend dans le stock.**

## 0. Ce qui existe (ouvert le 2026-10-21)

- **Le réglage « jour même »** (`order_cutoff_settings.same_day_allowed`, page
  Réglages › Commandes › Jour même, droit `lfc_order_settings`) : lu à la
  passation par `SameDayOrderReader` dans `OrderPlanGate`
  (`b2b/orders/application/services/order-plan-gate.service.ts`) et par
  `/fulfillment-days`. **Il ne peut plus rien ouvrir** : la journée d'aujourd'hui
  a fermé hier à l'heure limite générale, et son plan est figé. Il ne connaît ni
  la clientèle ni le stock.
- **La commande « hors plan »** : `Order.receiveOffPlan` — aujourd'hui réservée
  à la saisie de l'équipe, après l'arrêt du plan.
- **La clientèle** est connue à la passation (`CustomerAudiences`, `audience`
  dans `OrderDrafting`) : particulier (`public`) ou pro.
- **Rien ne s'encaisse au comptoir** : un particulier règle en ligne, par carte.
- **Aucun stock** n'existe dans le système : ni par article, ni par jour.

## 1. Ce qu'on bâtit

**Chaque matin, le comptoir déclare ce qu'il y a en vitrine pour la vente en
ligne du jour : des articles et des quantités. Les particuliers peuvent
commander « pour aujourd'hui » sur ces articles, dans ces quantités, jusqu'à une
heure de fin. Chaque commande décompte le stock déclaré.**

- **Le stock du jour** : une liste (article, quantité offerte) pour une journée,
  posée et corrigée par le comptoir ; pas de stock « réel » (les ventes au
  comptoir sans commande ne sont pas suivies).
- **Le reste** (le stock estimé) = reçu − ce que les commandes **« jour même
  sur stock »** (J2) en ont pris, commandes annulées exclues. Calculé, jamais
  écrit à la main. Les commandes déjà passées pour ce jour **ne s'y
  soustraient pas** : passées la veille avant l'heure limite, elles sont dans
  le plan du fournil, fabriquées pour elles, et ne puisent pas dans la vitrine
  (Hugo, 2026-10-21). Tant que J2 n'existe pas, le stock estimé **est** le
  reçu. Depuis le lot R2 du réassort (2026-10-21), « le reçu » est la
  **somme des reçus du jour au point**, tous confondus : chaque réassort
  réceptionné, plus le réassort sans commande (voir §7).
- **L'heure de fin du jour même** : un réglage, « jusqu'à 16 h » par exemple ;
  passé, « aujourd'hui » n'est plus proposé.
- **Qui** : les particuliers seulement (`public`). Un pro commande pour demain.
- **Où ça va** : la commande du jour n'entre pas dans le plan (il est figé) ;
  elle est reçue **hors plan**, servie depuis la vitrine au comptoir (retrait) —
  la livraison du jour même est hors périmètre.
- **Le réglage « jour même » actuel** devient l'interrupteur de ce circuit :
  « commandes du jour sur stock pour les particuliers : oui / non » + l'heure de
  fin, sur sa page.

## 2. Les règles

- **L'heure limite générale ne s'applique pas au jour J** de ce circuit : elle
  protège le plan, et la commande du jour n'y entre pas. Ce qui limite J :
  l'interrupteur, l'heure de fin, le stock restant.
- **Le stock est vérifié à la passation, sous verrou** : deux paniers qui se
  disputent le dernier croissant ne passent pas tous les deux (un verrou sur
  (journée, article), comme le plan l'est par journée).
- **Un article absent de la liste du jour** n'est pas commandable pour
  aujourd'hui, même s'il l'est pour demain.
- **Panier mixte** : un panier « pour aujourd'hui » ne contient que des articles
  du stock du jour ; sinon le jour proposé est demain.
- **Annulation** d'une commande du jour : elle rend la quantité au stock (le reste
  est recalculé).
- **Paiement** : carte en ligne, comme toute commande de particulier ; un
  paiement abandonné ne garde pas le stock au-delà de la durée de vie du panier
  payé (à trancher : Q3).

## 3. Les lots

| Lot    | Contenu                                                                                                                                                                                                                                                                          | Agent     |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **J1** | Serveur : la table du stock du jour (journée, article, quantité offerte), sa saisie par le comptoir (droit à trancher, Q1), le reste calculé, le réglage « jour même » réécrit (oui/non + heure de fin) ; migration additive                                                     | batisseur |
| **J2** | Serveur : la passation « pour aujourd'hui » d'un particulier — garde de stock sous verrou, réception hors plan, `/fulfillment-days` propose aujourd'hui au public quand le circuit est ouvert ; e2e (course au dernier article, panier mixte, heure de fin, annulation qui rend) | batisseur |
| **J3** | Back-office : l'écran du comptoir « Stock du jour » (poser, corriger, voir ce qui est commandé et ce qui reste) ; la page Jour même                                                                                                                                              | pablo     |
| **J4** | Boutique : « Aujourd'hui » dans le choix du jour pour un particulier, le reste affiché sur la vignette (« plus que 3 »), les articles hors stock grisés pour aujourd'hui                                                                                                         | pablo     |

## 4. Hors périmètre

- Le stock en temps réel (ventes au comptoir sans commande).
- La livraison le jour même.
- Le jour même pour les pros.

## 5. Questions

- **Q1** — Qui déclare le stock du jour : le comptoir (droit du comptoir), ou
  aussi le fournil ?
- **Q2** — Le stock offert en ligne est-il TOUT ce qui est en vitrine, ou une
  part réservée à la vente en ligne (le reste pour le comptoir) ?
- **Q3** — Un paiement par carte en cours garde-t-il la quantité (combien de
  temps), ou le stock est-il décompté seulement au paiement réussi ?
- **Q4** — Le stock non déclaré à 9 h : « aujourd'hui » n'est pas proposé du
  tout, ou on reprend la liste de la veille ?
- **Q5** — Une seule heure de fin pour tous les points de retrait ?

## 6. Décisions (Hugo, 2026-10-21)

- **Q1** — Le **comptoir** déclare le stock du jour.
- **Q2** — Part réservée au web ou toute la vitrine : **le choix est donné en
  admin** pour le moment (un réglage du circuit : « le stock déclaré est une
  part réservée à la vente en ligne » / « c'est toute la vitrine »).
- **Q3** — Un paiement par carte en cours **tient la quantité 15 minutes** ; un
  paiement abandonné la rend.
- **Q4** — Le stock du jour **s'aligne sur le réassort reçu** : ce que le
  réapprovisionnement du site a apporté ce jour-là est le stock offert, que le
  comptoir corrige. ⚠️ Le réapprovisionnement **n'est pas bâti** (plan
  doc-first [`../reassort-boutiques/plan-reapprovisionnement.md`](../reassort-boutiques/plan-reapprovisionnement.md),
  2026-10-14 ; la page « Réassort boutique » du comptoir est vide, vérifié le
  2026-10-21). Conséquence pour l'ordre des lots : tant qu'il n'existe pas, le
  comptoir déclare à la main (J1) ; le jour où le réassort est reçu en base, la
  déclaration du jour est **pré-remplie** par lui. Sans réassort reçu ni
  déclaration, « aujourd'hui » n'est pas proposé — jamais un stock inventé.
- **Q5** — ouverte.

## 7. Ce qui est bâti (2026-10-21)

**J1, sous la forme de la réception du réassort** (demande de Hugo du
2026-10-21 : « commençons par faire la page [Réassort boutique] ; des lignes
produit et des quantités, et éventuellement un stock »).

- **L'agrégat `ResupplyReceipt`** (`apps/lfd-api/src/b2b/resupply/`) : ce que
  la vitrine d'un point de retrait a reçu pour une journée — une par (site,
  journée), des lignes (SKU produit, libellé figé lu au catalogue publié de la
  boutique, quantité reçue entière ≥ 0). C'est la partie **reçue** du futur
  `SiteResupply` (modèle B, [`plan-reapprovisionnement.md`](../reassort-boutiques/plan-reapprovisionnement.md)
  §9) : deux agrégats, parce que demander et recevoir ont deux auteurs et deux
  moments. Aucun prix, aucune dépendance au modèle `Order`.
- **Un article en double est refusé** (409, « corrigez sa quantité ») plutôt
  qu'additionné : une seconde saisie est plus souvent un doublon qu'un second
  arrivage.
- **Le stock estimé** est calculé à la lecture (`estimateStock`) et vaut le
  reçu ; aucun port de décompte n'est posé d'avance — J2 l'ajoutera.

⚠️ **Refait au lot R2 du réassort, le 2026-10-21**
([`../reassort-boutiques/README.md`](../reassort-boutiques/README.md)) : la
réception n'est plus une liste par (site, journée) mais **un reçu par
réassort envoyé**, réceptionné d'un geste (« Réceptionner »), plus au plus un
**réassort sans commande** par (site, journée) — la saisie ligne par ligne
décrite ci-dessus, où le refus du doublon reste vrai. Le **stock estimé du
jour est la somme des reçus réceptionnés** du jour au point, tous reçus
confondus ; un réassort envoyé mais pas encore réceptionné n'y compte pas.
Migration `20261021230000_un_recu_par_reassort`.

- **Routes** `/admin/resupply-receipts` sous `handover_counter` (Q1 : le
  comptoir), table `resupply_receipt` + `resupply_receipt_line` (migration
  additive `20261021150000`), verrou optimiste par version.
- **L'écran** : Comptoir › Réassort boutique — point de retrait, journée
  (aujourd'hui par défaut), lignes reçues et stock estimé ; ajouter, corriger,
  retirer.
- **La limite du réassort** (Hugo : « la limite ou absence de limite [du
  réassort] devrait être définie dans les réglages limites ») : Réglages ›
  Commandes › Heure limite, carte « Réassort boutique : soumis à l'heure
  limite / sans limite » (`order_cutoff_settings.resupply_subject_to_cutoff`,
  oui par défaut). Sans effet à son ajout ; opposée depuis le lot R1
  (2026-10-21) au réassort commandé « Pour demain »
  ([`../reassort-boutiques/README.md`](../reassort-boutiques/README.md)).

Reste de J1 : le réglage « jour même » réécrit (oui/non + heure de fin) et le
choix Q2 (part réservée / toute la vitrine) — non bâtis.

## 8. J2 refait sur le code du 2026-11-02 — une seule passation « sur stock », deux clientèles

> 📐 **Plan du 2026-11-02**, Hugo : « est-ce qu'on essaye de voir le b2c jour J
> déjà, ça va peut-être débloquer quelque chose » — le retrait immédiat d'un
> pro au comptoir ([`../comptoir/plan-retrait-immediat.md`](../comptoir/plan-retrait-immediat.md))
> est le même circuit. Touche l'**argent** et un **stock** : `vitruve` avant le
> bâti. Rien n'est bâti.

### 8.1 Ce que le code fait aujourd'hui (ouvert le 2026-11-02)

- **Une saisie de l'équipe pour aujourd'hui, plan arrêté, au compte, suit
  déjà tout le chemin** : `receiveOffPlan` la reçoit, elle entre dans la file
  du comptoir (`expectedOnWhere` ne lit que le jour), le comptoir la remet sans
  colisage (rang 1, `handover.ts:43`), son BL naît **à la remise**
  (`mark-order-fulfilled.handler.ts:120-122`, « créé plein s'il manquait »), le
  solde se clôt et elle entre dans la facture du mois.
- **Ce qui la bloque** : l'heure limite générale s'applique aussi à l'équipe
  (`order-cutoff-gate.service.ts`, aucune branche staff, une dérogation seule
  la lève) ; aucun décompte du stock ; le règlement par défaut de la saisie est
  le **lien** (`draft.store.ts:78`), et une commande au lien non payée n'entre
  ni dans la file ni dans un retirage.
- **Le réglage « jour même »** (`sameDayAllowed`) ouvre aujourd'hui dans
  `/fulfillment-days` et dans `ensureNotTooSoon` tant que le plan n'est pas
  arrêté — c'est-à-dire presque jamais pour aujourd'hui.
- **Le stock estimé** (`estimateStock`, `b2b/resupply/domain/estimated-stock.ts`)
  promet déjà « moins ce que les commandes jour même en ont pris » et renvoie
  le port à J2. Il est lu par la Supervision (onglet Stock) et la réception.
- **Une commande boutique non réglée** expire à 30 minutes
  (`UNSETTLED_SHOP_ORDER_TTL_MINUTES`).

### 8.2 La règle

**Une commande « sur stock »** est une commande pour **aujourd'hui**, au
**point** choisi, dont chaque ligne est prise dans le **stock du jour** de ce
point. Elle ne passe jamais par le plan :

- elle est **marquée à la passation** (`drawnFromStock`, colonne additive) —
  c'est la marque, pas le mode d'acheminement : elle reste un **retrait** pour
  tous les lecteurs (file du comptoir, remise, BL, facture), qui n'ont rien à
  changer ;
- elle est **exclue du plan pour de bon** : `planWhere` (et donc tout
  retirage) l'écarte par sa marque — sans quoi un retirage relancé ferait
  cuire ce qui est déjà en vitrine ;
- **l'heure limite générale ne s'applique pas** à elle (§2) ; ce qui la limite :
  l'interrupteur du circuit, l'**heure de fin** du jour même, le **reste** ;
- le **reste** = reçus réceptionnés du jour au point − lignes des commandes
  sur stock non annulées de ce jour à ce point. Il est servi par **un port**
  que le contexte des commandes implémente (`StockDrawsReader`), lu par
  `estimateStock` : Supervision, réception et passation lisent **le même**
  reste ;
- **sous verrou** (journée, point) à la passation, et le même verrou pris par
  la correction et l'annulation d'un reçu de réassort, qui peuvent faire
  baisser le reçu : un reçu ne descend pas sous ce qui en a été pris (refus
  « déjà vendu : N »).

### 8.3 Les deux clientèles

|           | Particulier (J2)                                               | Pro au comptoir (retrait immédiat)                                                                             |
| --------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Qui passe | le client, en ligne                                            | l'équipe, au comptoir, par le raccourci « Retrait immédiat »                                                   |
| Point     | celui qu'il choisit                                            | celui du comptoir                                                                                              |
| Règlement | carte en ligne ; non réglée, elle expire et **rend son stock** | **au compte**, imposé par le serveur (`settlement: "account"`)                                                 |
| Remise    | au comptoir, geste normal                                      | au comptoir, geste normal, aussitôt                                                                            |
| Marque    | `drawnFromStock`                                               | `drawnFromStock` + `entryShortcut: "immediate_pickup"` (le compte de Hugo : combien de fois, quelle clientèle) |

Le règlement par défaut d'une saisie de l'équipe devient **au compte** pour
toutes les saisies (Hugo, 2026-11-02), le lien restant un choix.

### 8.4 Les lots

| Lot       | Contenu                                                                                                                                                                                                                                                                                                          |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **J2a**   | Serveur, sans écran : la marque `drawnFromStock` (migration additive), le port `StockDrawsReader` et le reste dans `estimateStock`, l'exclusion de `planWhere`, le verrou partagé avec les corrections de réception ; e2e (le reste baisse, un retirage n'absorbe pas, la correction sous le vendu est refusée)  |
| **J2b**   | Serveur : la passation sur stock d'un particulier — heure de fin (réglage), interrupteur, pas d'heure limite, garde du reste, l'expiration qui rend ; `/fulfillment-days` propose aujourd'hui quand le point a du stock ; e2e (course au dernier article, panier mixte refusé, heure de fin, paiement abandonné) |
| **J2c**   | Serveur : la saisie sur stock de l'équipe et son raccourci (`entryShortcut`, au compte imposé), le défaut « au compte » des saisies ; e2e (remise au comptoir, BL créé, facture du mois)                                                                                                                         |
| **J3/J4** | Écrans : le choix « aujourd'hui » de la boutique avec le reste ; au comptoir, « Retrait immédiat » / « Commande programmée »                                                                                                                                                                                     |

### 8.5 Questions pour Hugo

- **Q3 bis** — Le stock tenu par un paiement en cours : la décision du
  2026-10-21 dit **15 minutes**, une commande boutique non réglée expire
  aujourd'hui à **30**. Une seule durée (30, déjà en place) ou 15 pour le jour
  même seulement ?
- **Q5** (ouverte) — Une seule heure de fin pour tous les points ?
- **Q6** — Un pro **en ligne** (pas au comptoir) peut-il commander pour
  aujourd'hui sur stock, ou seulement par le comptoir ?
