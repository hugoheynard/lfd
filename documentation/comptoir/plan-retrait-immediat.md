# Plan — le retrait immédiat d'un pro, au comptoir

> 📐 **Plan du 2026-11-02**, demande de Hugo : « dans comptoir › nouvelle
> commande pro, à gauche de Retrait, un bouton **Retrait immédiat** : un type
> de commande, ajouté au compte, pris sur le stock disponible en boutique ».
> Touche l'**argent** (une commande facturée au mois) : `vitruve` avant le
> bâti. Rien n'est bâti.

## 1. Ce que c'est

Un pro est au comptoir. Il prend des articles **dans la vitrine, tout de
suite**. Le vendeur les saisit ; la commande est **remise à l'instant**, et
elle part **sur le compte** du client — elle entre dans sa facture du mois
comme n'importe quelle commande remise. Rien n'est fabriqué pour elle : elle
vient du stock du jour du point.

C'est le pendant pro du « jour même sur stock » des particuliers
([`plan-jour-meme-sur-stock.md`](../limites-de-commande/plan-jour-meme-sur-stock.md)),
mais **sans attente** : la marchandise change de mains au moment de la saisie.

## 2. Ce qui existe (ouvert le 2026-11-02)

- **La saisie au comptoir** : `Comptoir › Nouvelle commande pro` choisit le
  compte, puis passe la main à la saisie du Commercial
  (`comptes-clients/:id/nouvelle-commande`, origine « comptoir »,
  `order-entry-origin.ts`). Le choix d'acheminement y est
  `acheminement-commande` (Retrait / Livraison).
- **La commande hors plan** : `Order.receiveOffPlan`, réservée à une saisie de
  l'équipe (`placedByStaffId`), pour une journée dont le plan est arrêté.
- **Le stock du jour d'un point** : la somme des reçus de réassort
  réceptionnés ce jour-là au point (`ResupplyReceipt`, `estimateStock`) — le
  lot J1 du jour même. **Aucune commande ne le décompte encore** (J2 non bâti).
- **Rien ne s'encaisse au comptoir** : un pro règle au compte ou par carte en
  ligne.

## 3. Ce qu'on bâtit

### 3.1 Le bouton et la saisie

- Dans `acheminement-commande`, **seulement quand la saisie vient du
  comptoir** : un choix **« Retrait immédiat »**, à gauche. Les deux choix
  d'aujourd'hui, « Retrait » et « Livraison », sont regroupés à sa droite sous
  **« Commande programmée »** (Hugo, 2026-11-02) : d'abord la nature de la
  commande (tout de suite, ou pour une date), ensuite seulement son
  acheminement. Hors comptoir, rien ne change : la saisie du Commercial garde
  Retrait / Livraison seuls.
- Choisi, il fixe : la journée = **aujourd'hui** (heure de Paris), le point =
  **le point du comptoir** (celui que le vendeur a ouvert), pas de créneau.
- Le catalogue proposé est **le stock du jour du point** : seuls les articles
  reçus aujourd'hui, avec le reste en face (« reste 12 »). Une quantité au-delà
  du reste est refusée à l'écran et au serveur.
- Le prix est celui du client, par la porte du prix habituelle (mercuriale,
  promotions qu'elle admet) : rien de neuf côté tarif.

### 3.2 La commande

- Un **mode d'acheminement neuf**, `immediate_pickup`, et non un drapeau sur le
  retrait : tous les lecteurs du retrait (file du comptoir, colisage,
  supervision, QR, rappels) l'ignorent ainsi **par construction** au lieu de
  devoir chacun l'exclure.
- **Hors plan et jamais au plan** : elle n'entre ni dans le compte à produire,
  ni dans un retirage, ni au colisage (rien à fabriquer, rien à mettre en bac).
- **Remise à la passation**, dans la même transaction : statut remis, remise au
  comptoir par le vendeur (`handedOverVia: "counter"`, auteur = le vendeur),
  son BL émis et marqué remis — c'est le BL qui la fait entrer dans la facture
  du mois (ZL : un bon est facturé au mois de sa remise).
- **Au compte seulement** : le client doit être réglé au compte. Un client qui
  règle par carte ne voit pas le choix (le comptoir n'encaisse rien).
- **Décompte du stock** : le reste du jour au point = reçus − quantités des
  commandes `immediate_pickup` non annulées de ce jour à ce point. Vérifié à
  la passation **sous verrou** (journée, point) : deux vendeurs ne vendent pas
  le dernier croissant deux fois.

### 3.3 Après

- **Annuler** une commande immédiate : réservé au staff, le jour même ; elle
  rend sa quantité au stock et sort de la facture (elle n'a jamais été
  produite, rien à « envoyer en boutique »).
- Elle apparaît dans « Commandes » avec le badge **« Retrait immédiat »**, et
  dans la Supervision du jour en **Remise** directement.

## 4. Les lots

| Lot     | Contenu                                                                                                                                                                                                                                                                                              |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RI1** | Serveur : le mode `immediate_pickup` (enum, migration additive), la passation (journée = aujourd'hui, point du comptoir, au compte exigé), la garde de stock sous verrou, la remise et le BL dans la transaction ; e2e (course au dernier article, client carte refusé, plan exclu, facture du mois) |
| **RI2** | Serveur : le stock du jour décompté (lecture du reste par le comptoir), l'annulation qui rend                                                                                                                                                                                                        |
| **RI3** | Back-office : le choix « Retrait immédiat » au comptoir, le catalogue réduit au stock avec son reste, le badge dans Commandes et Supervision                                                                                                                                                         |

## 5. Questions pour Hugo

- **Q1** — Sans stock déclaré aujourd'hui au point (aucun réassort
  réceptionné) : le bouton est **grisé** (« aucun stock reçu aujourd'hui »), ou
  la saisie est libre, sans contrôle ? Proposé : grisé — jamais un stock
  inventé.
- **Q2** — Un client qui règle **par carte** : le choix est masqué (proposé),
  ou on crée la commande et le lien de paiement part comme pour une commande
  normale ?
- **Q3** — Le **frais de port / la remise de retrait** : la remise de retrait
  du point s'applique-t-elle au retrait immédiat ? Proposé : oui, c'est un
  retrait au point.
- **Q4** — Le stock offert au retrait immédiat est-il **tout** le reçu du jour,
  ou seulement ce que la vitrine n'a pas déjà vendu en caisse ? La caisse n'est
  pas suivie : proposé, tout le reçu, corrigeable à la main par le comptoir.

## 6. La contradiction de `vitruve` (2026-11-02) — à reprendre avant tout bâti

Cinq **bloquants**. Le plan tel qu'écrit ne tient pas ; la direction reste bonne.

1. **Un mode `immediate_pickup` ne s'exclut de rien « par construction ».** Les
   adaptateurs ramènent tout ce qui n'est pas `delivery` à `pickup`
   (`prisma-day-orders.source.ts`, `prisma-deadline-orders.reader.ts`,
   `order-workshop-withdrawal.ts`…), et les filtres partagés (`expectedOnWhere`
   de `handover-order.query.ts`, `settlementWhere` de `plan-filter.ts`) ne
   regardent pas le mode : la commande apparaîtrait dans la file du comptoir et
   le dossier du jour. Le mode neuf casse en plus chaque `z.enum` du contrat
   (`packages/contracts/src/order.ts:85`, journal compris) — environ 190 fichiers
   le citent. Enum ou drapeau : à trancher l'inventaire en main, et c'est
   irréversible dès qu'une ligne est écrite.
2. **« Hors plan » n'exclut rien** : `placedOffPlan` n'est qu'un badge ; c'est
   le statut (`STATUS_IN_PLAN`) qui sort une commande du compte à produire.
3. **La remise n'est pas au commerce.** Elle est gravée par le bloc `handover/`
   (`confirm-handover.handler.ts`) et publie `OrderHandedOver`, que suivent la
   fidélité, la croissance et les BL ; le canal n'expose aucun port d'écriture.
   Et le **BL-1 naît à l'arrêt du plan** (`delivery-note-planner.ts`) : une
   commande qui n'y passe pas n'en a pas.
4. **La facture du mois** sélectionne par `billableOrderWhere`
   (`billable-order-criterion.ts`) sur `settledOn` et les montants facturables,
   écrits par `OrderBillingCloser` à la remise : sans ce passage, la commande
   bloque l'émission comme anomalie.
5. **Une commande remise ne s'annule pas** (`order-cancellation.ts:234`) :
   « rendre au stock et sortir de la facture » demande un avoir, un état neuf,
   ou pas d'annulation du tout.

**Sérieux** : un second décompte du stock au lieu du port prévu par
`estimated-stock.ts` (J2) ; le verrou ne couvre pas les corrections de
réception ; « au compte seulement » doit imposer `settlement: "account"` au
serveur (`order-settlement.ts`), pas seulement masquer un bouton.

**Piste à vérifier** : ne rien court-circuiter — passer une vraie commande au
compte pour aujourd'hui au point, puis la **remettre par le geste réel du
comptoir** (le même `confirm-handover`), pour que BL, facture, fidélité et
journal suivent leur chemin. Reste à savoir comment une commande hors plan
obtient son BL.
