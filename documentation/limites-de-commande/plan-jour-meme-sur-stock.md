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
  reçu.
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
  oui par défaut). **Sans effet** tant que le réassort n'est pas commandé au
  fournil ; l'écran le dit.

Reste de J1 : le réglage « jour même » réécrit (oui/non + heure de fin) et le
choix Q2 (part réservée / toute la vitrine) — non bâtis.
