# Le circuit du jour J — commander pour aujourd'hui, sur le stock de la vitrine

> **Dossier unique du circuit, rassemblé le 2026-11-02** (Hugo : « j'ai besoin
> qu'on rassemble toutes les informations sur ce circuit »). Il remplace le plan
> du 2026-10-21 (« le jour même des particuliers, version simple ») et le plan
> du retrait immédiat au comptoir écrit le matin même — tous deux dans
> l'historique git, leur contenu repris ici. Les faits du code ont été relus le
> 2026-11-02 ; chaque affirmation sur un autre fichier porte son chemin.
>
> **État** : **J1 est bâti** (le stock du jour, par la réception du réassort —
> §7). **Rien du circuit lui-même** (J2 à J4, le retrait immédiat) ne l'est. Le
> dessin de J2 a été contredit deux fois par `vitruve` le 2026-11-02 (§9) : il
> est **à reprendre** avant tout bâti, en commençant par l'inventaire des
> lecteurs (§9.1). Touche l'**argent** et un **stock** : `vitruve` à chaque
> version.

## 1. Le modèle — une phrase

**Demain se commande avant l'heure limite ; aujourd'hui se prend dans le
stock** ([`schema-des-reglages.md`](schema-des-reglages.md) §0, Hugo,
2026-10-21). L'heure limite protège le plan du fournil ; une commande du jour
n'entre pas dans un plan déjà figé : elle puise dans ce qui est déjà en vitrine.

Deux portes sur le même circuit :

|              | Particulier (J2–J4)                                                        | Pro au comptoir — « Retrait immédiat »                                                                                                    |
| ------------ | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Demandé      | 2026-10-21 (« comment je règle, moi, le jour même pour le particulier ? ») | 2026-11-02 (« dans Comptoir › Nouvelle commande pro, un bouton Retrait immédiat : ajout au compte, pris sur le stock dispo en boutique ») |
| Qui passe    | le client, en ligne                                                        | l'équipe, au comptoir                                                                                                                     |
| Point        | celui qu'il choisit                                                        | celui du comptoir                                                                                                                         |
| Règlement    | carte en ligne                                                             | **au compte**, à facturer au mois                                                                                                         |
| Remise       | au comptoir, geste normal                                                  | au comptoir, geste normal, aussitôt                                                                                                       |
| Acheminement | retrait seulement (la livraison du jour est hors périmètre)                | retrait                                                                                                                                   |

Le retrait immédiat **n'est pas un type de commande** (Hugo, 2026-11-02) :
c'est un **raccourci** qui pré-règle une commande du circuit — retrait,
aujourd'hui, au point du comptoir, créneau en cours, au compte — puis laisse
la commande suivre les gestes normaux. Hugo veut en garder la **trace** :
combien de fois le raccourci a servi, et pour quelle clientèle.

## 2. L'écran du comptoir (décidé le 2026-11-02)

Dans la saisie ouverte depuis le comptoir (`comptes-clients/:id/nouvelle-commande`,
origine `counter`, `apps/lfd-backoffice-frontend/src/app/commandes/nouvelle-commande/order-entry-origin.ts`),
le choix d'acheminement devient deux temps :

- **« Retrait immédiat »**, à gauche ;
- **« Commande programmée »**, à droite, qui regroupe les « Retrait » et
  « Livraison » d'aujourd'hui.

D'abord la nature de la commande (tout de suite, ou pour une date), ensuite
son acheminement. Hors comptoir, la saisie du Commercial ne change pas.

## 3. Les règles décidées

Du 2026-10-21, toujours valables :

- **Q1** — le **comptoir** déclare le stock du jour.
- **Q2** — le stock offert : part réservée au web ou toute la vitrine — **un
  réglage en admin** pour le moment.
- **Q3** — un paiement par carte en cours **tient la quantité 15 minutes** ; un
  paiement abandonné la rend. ⚠️ À rapprocher de l'existant (§4.6) : une
  commande boutique non réglée expire aujourd'hui à **30** minutes.
- **Q4** — le stock du jour **est le réassort reçu** au point ce jour-là, que le
  comptoir corrige. Sans réassort reçu ni déclaration, « aujourd'hui » n'est
  pas proposé — **jamais un stock inventé**.
- **Panier mixte** : un panier « pour aujourd'hui » ne contient que des
  articles du stock du jour ; sinon le jour proposé est demain.
- **Un article absent du stock du jour** n'est pas commandable pour aujourd'hui.
- ~~**L'heure de fin** du jour même est un réglage (« jusqu'à 16 h »)~~ —
  remplacé le 2026-11-02 : aujourd'hui suit les créneaux restants du site
  (ci-dessous).
- **Les commandes déjà passées pour ce jour ne se soustraient pas du stock** :
  passées la veille avant l'heure limite, elles sont au plan, fabriquées pour
  elles, et ne puisent pas dans la vitrine.
- **Annuler** une commande du jour rend sa quantité au stock.

Du 2026-11-02 :

- Le retrait immédiat est un **raccourci** sur ce circuit, pas un mode
  d'acheminement neuf ; il passe par les **gestes normaux** (passation, remise
  au comptoir, BL, facture).
- **Le règlement par défaut d'une saisie de l'équipe devrait toujours être
  « au compte, à facturer »** — à concilier avec l'objection 4 du §9.1.
- **Garder la donnée** du raccourci : combien de fois, quelle clientèle.

Du 2026-11-02, après le schéma (Hugo) :

- **« Autoriser le jour même » se sépare par clientèle** : deux réglages,
  **particuliers** et **pros**, sur la page Réglages › Commandes › Jour même
  (l'interrupteur unique `same_day_allowed` d'aujourd'hui ne suffit plus).
- **Un pro en ligne** (hors comptoir) : une **option** de cette même page —
  tranche Q6.
- **Un pro sans crédit au compte**, au comptoir : une **option admin** (refuser,
  ou passer par le lien de paiement) — tranche Q7.
- **Pas d'heure de fin à régler** : le jour même suit les **créneaux de retrait
  encore disponibles aujourd'hui, site par site**. Un point dont le dernier
  créneau du jour est passé ne propose plus aujourd'hui — tranche Q5.

## 4. Ce que fait le code aujourd'hui (relu le 2026-11-02)

### 4.1 Le réglage « jour même »

- `order_cutoff_settings.same_day_allowed` (défaut `false`, ligne absente =
  non autorisé), page **Réglages › Commandes › Jour même**
  (`reglages/commandes/same-day-page/`), droit `lfc_order_settings`
  ([`reglages-generaux.md`](reglages-generaux.md) §4).
- Non autorisé : aujourd'hui n'est pas proposé par la boutique, et toute
  passation qui vise une journée non postérieure à aujourd'hui est refusée
  (`orders.same_day_closed`, `ensureNotTooSoon`,
  `order-plan-gate.service.ts:46-53`) — client, invité et équipe.
- Autorisé : il n'ouvre aujourd'hui **que tant que le plan n'est pas arrêté** —
  presque jamais, puisque l'arrêt d'aujourd'hui tombe la veille au soir. Il ne
  connaît ni la clientèle ni le stock.
- `/fulfillment-days` (`list-fulfillment-days.handler.ts:70-79`) retire
  aujourd'hui des jours proposés sauf si le réglage l'ouvre.

### 4.2 La passation pour aujourd'hui, plan arrêté

- **Un client** est refusé deux fois : `ensureDayOpen`
  (`order-drafting.service.ts:201-208`) lève `ProductionPlanClosedError`, puis
  `holdPlan` (l. 220-226) appelle `Order.receiveOffPlan`
  (`domain/entities/order.ts:290-295`), qui la lève aussi pour un client.
- **L'équipe** est reçue « hors plan » : `receiveOffPlan` pose `placedOffPlan`,
  qui n'est **qu'un badge** (`prisma-admin-order-list.reader.ts:170`). Ce qui
  sort vraiment une commande du compte à produire est son **statut** :
  `planWhere` = `status: "placed"` et règlement ni refusé ni en vol
  (`plan-filter.ts:47-48`, `production-plan.ts:135`).
- **L'heure limite générale s'applique aussi à l'équipe**
  (`order-cutoff-gate.service.ts:46-69`, aucune branche staff) ; seule une
  **dérogation** la lève. Après la limite, une saisie pour aujourd'hui est
  refusée.
- Aucun contrôle de **créneau passé** dans la passation (seul le jour l'est).

### 4.3 Après la passation — ce qui marche déjà

Pour une **saisie de l'équipe au compte**, pour aujourd'hui, plan arrêté :

- **Le fournil ne la produit pas** : elle n'est pas dans l'instantané de la
  clôture ; un **retirage** l'absorberait, mais il n'est jamais automatique
  (seul appelant : `production-worksheet.controller.ts:218`).
- **Elle entre dans la file du comptoir** : `expectedOnWhere`
  (`handover-order.query.ts:120-125`) ne lit que le jour et `status ≠ draft`.
- **Le comptoir la remet par son geste normal**, sans colisage : au rang 1,
  « préparée » est toujours vrai (`handover/domain/services/handover.ts:28-45`) ;
  le seul refus est un règlement non clos (`isSettled` = `paid` ou
  `not_required`).
- **Son BL naît à la remise** : `mark-order-fulfilled.handler.ts:120-122`
  (« créé plein s'il manquait (remise hors plan) ») — le BL-1 ordinaire, lui,
  naît à l'arrêt du plan (`delivery-note-planner.ts`).
- **Son règlement se clôt à la remise** : `OrderBillingCloser`
  (`order-billing-closer.ts`, `order-billing.ts:92-102`) pose `settledOn` et
  les montants facturables ; elle entre alors dans la facture du mois
  (`billableOrderWhere`, `billable-order-criterion.ts:84-90`).
- La remise publie `OrderHandedOver` : fidélité, croissance et BL suivent.

Pour une **saisie au lien de paiement** non payée : ni file, ni retirage, ni
remise (règlement non clos), ni facture.

### 4.4 Le règlement d'une saisie de l'équipe

- À l'écran : `draft.store.ts:78` part sur **`'link'`** ; choix radio dans le
  panier (`panier-commande.ts:136`).
- Au contrat : la soumission (`packages/contracts/src/admin-order.ts:115-123`)
  exige `settlement`, **sans défaut, délibérément** (« un défaut silencieux la
  prendrait à la place du commercial ») ; le brouillon a `.default("link")`
  (l. 236).
- Au serveur : « au compte » exige un crédit accordé
  (`place-order-for-customer.handler.ts:137-138`, `AccountSettlementNotGrantedError`).
- ⚠️ Le commentaire de `order-settlement.ts:88-90` (« le chemin du
  back-office » pour `settlement` absent) est **périmé** : le back-office passe
  par `place-order-for-customer.handler.ts`, qui exige le choix.

### 4.5 Le stock du jour (J1, §7)

- La somme des **reçus de réassort réceptionnés** du jour au point
  (`estimateStock`, `b2b/resupply/domain/estimated-stock.ts:30`), fonction pure
  qui prend les reçus en paramètre. Son JSDoc promet déjà « moins ce que les
  commandes jour même en ont pris » et renvoie le port à J2 : **aucune commande
  ne le décompte** aujourd'hui.
- Lu par l'onglet **Stock** de la Supervision (`day-stock.ts:60,133`) et par la
  **réception** (`get-resupply-receipt.handler.ts:59`).
- **Aucun verrou** côté réassort : `correct-received-resupply-line.handler.ts`
  fait `load` / `save` ; le seul verrou est `ResupplyPlanGate.hold`, sur la
  journée de production. Un réassort déjà réceptionné ne s'annule plus
  (`cancel-site-resupply.handler.ts`) ; seule la correction de ligne fait
  baisser un reçu.

### 4.6 L'expiration d'une commande boutique non réglée

- 30 minutes (`UNSETTLED_SHOP_ORDER_TTL_MINUTES`), **au plus 35** en pratique
  (`unsettled-shop-order-expiry.ts:9-10`).
- Pas d'annulation quand le paiement est `in_progress` / `already_paid`, ni
  quand Stripe est `unavailable` (`unsettled-shop-order-expiry.service.ts:36-42`) :
  la commande reste alors sans limite de durée.

### 4.7 L'origine et la clientèle d'une commande

- Pas de colonne d'origine : elle est **dérivée** (`order-origin.ts:25-33` :
  `placedByStaffId` → `back_office`, abonnement → `recurring`, sinon
  `self_service`). Le comptoir et le Commercial ne se distinguent pas au
  serveur (l'origine `counter` n'existe qu'à l'écran).
- La commande porte `clientele` (pro / public, figée), `companyId`,
  `buyerKind` (`guest` / `registered`), `placedByStaffId`.
- Le fait `order.placed` (`journal-facts/orders-production.ts:330-341`) ne
  porte ni l'origine, ni le staff, ni la clientèle.

## 5. Ce qu'il faut bâtir — le dessin

> Dessin du 2026-11-02, **contredit** (§9) : la direction, pas encore un plan
> qui tient.

- **Une commande « sur stock »** : pour aujourd'hui, au point, chaque ligne
  prise dans le stock du jour de ce point. **Une marque à la passation**
  (`drawnFromStock`, colonne additive), et non un mode d'acheminement : elle
  reste un retrait pour la file, la remise, le BL et la facture.
- **Le reste** = reçus réceptionnés − lignes des commandes sur stock non
  annulées, du jour, au point ; **un seul calcul**, servi par un port que le
  contexte des commandes implémente, lu par la Supervision, la réception et la
  passation.
- **Garde sous verrou** à la passation, et le même verrou pour les corrections
  de réception.
- **Pas d'heure limite générale** pour elle ; ce qui la limite : l'autorisation
  de sa clientèle, les créneaux restants du site, le reste.
- **Le raccourci** du comptoir pose en plus `entryShortcut: "immediate_pickup"`
  (le compte que veut Hugo) et impose `settlement: "account"` au serveur.

Lots proposés : **J2a** (la marque, le reste, le verrou), **J2b** (la passation
d'un particulier), **J2c** (la saisie de l'équipe et le raccourci), **J3/J4**
(les écrans de la boutique et du comptoir).

## 6. Questions ouvertes

- **Q3 bis** — Le stock tenu par un paiement en cours : 15 minutes (décision du
  21 octobre) ou les 30 déjà en place ? Et que faire des commandes que
  l'expiration ne sait pas annuler (§4.6) ?
- ~~**Q5**~~ — tranchée le 2026-11-02 : pas d'heure de fin, les créneaux
  restants de chaque site (§3).
- ~~**Q6**~~ — tranchée le 2026-11-02 : une option de la page Jour même, avec
  « autoriser » séparé particuliers / pros (§3).
- ~~**Q7**~~ — tranchée le 2026-11-02 : une option admin, refuser ou lien de
  paiement (§3).
- **Q8** — Sans stock reçu au point aujourd'hui : « Retrait immédiat » est
  grisé (proposé), ou la saisie est libre ?
- **Q9** — La **remise de retrait** du point s'applique-t-elle au retrait
  immédiat ? Proposé : oui, c'est un retrait au point.
- **Q10** — Le stock offert au retrait immédiat : tout le reçu du jour (la
  caisse n'est pas suivie), corrigeable à la main ? Proposé : oui.
- **Q11** — Annuler une commande du jour **déjà remise** : avoir, état neuf, ou
  pas d'annulation ? Le domaine refuse aujourd'hui (`order-cancellation.ts:234`).

## 7. Ce qui est bâti — J1, le stock du jour (2026-10-21)

**J1, sous la forme de la réception du réassort** (Hugo, 2026-10-21 :
« commençons par faire la page [Réassort boutique] ; des lignes produit et des
quantités, et éventuellement un stock »).

- **L'agrégat `ResupplyReceipt`** (`apps/lfd-api/src/b2b/resupply/`) : ce que
  la vitrine d'un point a reçu — des lignes (SKU, libellé figé lu au catalogue
  publié, quantité reçue entière ≥ 0). Aucun prix, aucune dépendance au modèle
  `Order`.
- **Refait au lot R2 du réassort** ([`../reassort-boutiques/README.md`](../reassort-boutiques/README.md)) :
  un reçu **par réassort envoyé**, réceptionné d'un geste, plus au plus un
  **réassort sans commande** par (site, journée), saisi ligne par ligne (un
  article en double est refusé, 409). Migration `20261021230000_un_recu_par_reassort`.
- **Le stock estimé du jour est la somme des reçus réceptionnés** au point ; un
  réassort envoyé mais pas encore réceptionné n'y compte pas.
- **Routes** `/admin/resupply-receipts` sous `handover_counter` (Q1 : le
  comptoir), tables `resupply_receipt` + `resupply_receipt_line` (migration
  additive `20261021150000`), verrou optimiste par version.
- **L'écran** : Comptoir › Réassort boutique — point, journée (aujourd'hui par
  défaut), lignes reçues et stock estimé.
- **La limite du réassort** : Réglages › Commandes › Heure limite, carte
  « Réassort boutique : soumis à l'heure limite / sans limite »
  (`order_cutoff_settings.resupply_subject_to_cutoff`, oui par défaut).

## 8. Hors périmètre

- Le stock en temps réel (ventes en caisse sans commande).
- La livraison le jour même.

## 9. Les contradictions de `vitruve` (2026-11-02) — ce qui ne tient pas encore

### 9.1 Sur le dessin du §5

**Bloquants** :

1. **Sortir la commande du plan ne suffit pas.** `planWhere` ne sert qu'à
   `prisma-expected-production.reader.ts:68`, `prisma-pending-orders.reader.ts:45`,
   `prisma-day-orders.source.ts:57` et `prisma-order.repository.ts:341`.
   D'autres lecteurs verraient la commande sur stock comme une commande à
   produire :
   - **le dossier du jour** et ses fiches (`prisma-order.reader.ts:316-325`, « la
     CINQUIÈME surface de production ») — un bon imprimé pour ce qui est déjà
     en vitrine ;
   - **les échéances du fournil** (`prisma-deadline-orders.reader.ts:30-34`, lu par
     `due-thresholds.service.ts`) ;
   - **l'heure d'arrivée des transferts** (`prisma-site-arrival-orders.reader.ts:27-31`,
     lu par `commerce-transfer-sites.service.ts`) ;
   - **la Supervision** (`prisma-day-supervision.reader.ts:56-58`), dont
     `awaitingProduction` nourrit `OvenWaitingOrdersReader` — « attend le
     four » sur la fiche.

   → **Inventaire fait le 2026-11-02 : §9.3.**

2. **La passation d'un particulier n'a pas de chemin** : `ensureDayOpen` et
   `receiveOffPlan` la refusent sur un plan arrêté, `OrderCutoffGate.ensure`
   aussi après la limite ; le dessin ne dit pas où (l'agrégat devrait décider),
   ni si elle prend encore le verrou de journée (`PlanAdmissionDesk.admit`), ni
   ce que devient une commande sur stock passée **avant** l'arrêt.
3. **Le verrou (journée, point) n'existe pas** (§4.5) : à créer, avec son
   mécanisme, son propriétaire et **son ordre d'acquisition** face au verrou de
   journée que la passation prend déjà en premier — sinon interblocage possible.
4. **Le défaut « au compte »** renverse une décision écrite au contrat
   (`admin-order.ts:115-117`), **change silencieusement les brouillons stockés**
   (`default("link")`, l. 236), et refusera tout pro sans crédit (Q7).

**Sérieux** : le reste tenu sans borne par les commandes que l'expiration ne
sait pas annuler (§4.6) ; le reste ne dit pas s'il compte une commande au
paiement refusé (par statut ou par règlement — deux restes divergents) ;
`estimateStock` est pure, il faut dire quel service lit le port et lui passe
les prélèvements ; la marque est **irréversible** une fois écrite, et une
révision de jour ne doit pas pouvoir déplacer une commande sur stock vers
demain ; Q6 bloque J2b.

### 9.2 Sur la première version du retrait immédiat (un mode `immediate_pickup`)

Abandonnée pour la raison même du §1 (un raccourci, pas un type) ; ses leçons
restent :

1. Un **mode d'acheminement neuf** ne s'exclut de rien « par construction » :
   les adaptateurs ramènent tout ce qui n'est pas `delivery` à `pickup`, et il
   casserait chaque `z.enum` du contrat (`packages/contracts/src/order.ts:85`,
   journal compris) — environ 190 fichiers citent le mode, et c'est
   irréversible dès qu'une ligne est écrite.
2. **« Hors plan » n'exclut rien** (§4.2).
3. **La remise n'appartient pas au commerce** : elle est gravée par le bloc
   `handover/` (`confirm-handover.handler.ts`) et publie `OrderHandedOver` ;
   le canal n'expose aucun port d'écriture → passer par le **geste réel**.
4. **La facture** sélectionne par `billableOrderWhere`, sur `settledOn` et les
   montants posés à la remise (§4.3).
5. **Une commande remise ne s'annule pas** (Q11).

## 10. Les documents voisins

- [`schema-des-reglages.md`](schema-des-reglages.md) — le modèle de tous les
  réglages de commande ; d'où vient « aujourd'hui se prend dans le stock ».
- [`reglages-generaux.md`](reglages-generaux.md) §4 — le réglage « jour même »,
  à l'état réel.
- [`plan-une-seule-heure.md`](plan-une-seule-heure.md) §6 — le jour même sur sa
  propre page.
- [`../fournil/arret-du-plan.md`](../fournil/arret-du-plan.md) — ce que l'arrêt
  fait aux commandes du jour ; l'arrêt d'aujourd'hui qui tombe le jour même.
- [`../commandes/passation/plan-premier-jour-commandable.md`](../commandes/passation/plan-premier-jour-commandable.md)
  — `/fulfillment-days`, le premier jour proposé.
- [`../commandes/passation/plan-reglages-commandes.md`](../commandes/passation/plan-reglages-commandes.md)
  — la décision d'origine (« le jour même est un réglage ») et la réception
  hors plan de l'équipe (lot O3).
- [`../reassort-boutiques/plan-reapprovisionnement.md`](../reassort-boutiques/plan-reapprovisionnement.md)
  — le réassort, d'où vient le stock du jour.
- [`../comptoir/architecture-commande-au-comptoir.md`](../comptoir/architecture-commande-au-comptoir.md)
  — la saisie au comptoir.

### 9.3 L'inventaire des lecteurs d'une journée (2026-11-02)

Fait en ouvrant chaque adaptateur qui lit `orders` par
`requestedDeliveryDate` (`grep` sur `b2b/**/infrastructure` et
`handover/channels`), puis le port qu'il implémente et ses consommateurs. Une
commande sur stock est un **retrait** de **statut `placed`** jusqu'à sa remise,
au règlement clos (au compte) ou en cours (carte) — c'est sous cette forme
qu'elle traverse chaque filtre.

**Doivent l'ignorer — production et transport :**

| Lecteur                                                                                                                                                                                                                     | Filtre aujourd'hui                                                                          | Ce qu'il nourrit                                                                                                                                                                                         | Sans geste, la commande sur stock…                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `planWhere` (`plan-filter.ts:47`) — utilisé par `prisma-day-orders.source.ts` (`producibleFor`), `prisma-expected-production.reader.ts`, `prisma-pending-orders.reader.ts`, `prisma-order.repository.ts` (`absorbIntoPlan`) | `status: placed` + règlement ni refusé ni en vol                                            | fiche d'atelier, compte à produire, **retirage**, réassort lancé (`launch-resupply`), **alerte de rattrapage** (`run-auto-close-round.handler.ts:150`), prévisionnel, état de la journée                 | serait absorbée par un retirage et **cuite** ; ferait sonner « le plan d'aujourd'hui n'est pas arrêté » ; gonflerait le prévisionnel |
| `PrismaOrderReader.listForProduction` (`prisma-order.reader.ts:308`, « la CINQUIÈME surface »)                                                                                                                              | `status ∉ {cancelled, draft}` + `settlementWhere`                                           | **le dossier du jour** : ses bons et leur numérotation                                                                                                                                                   | aurait un **bon imprimé**, et la pile « 3/14 » changerait en cours de journée                                                        |
| `PrismaDeadlineOrdersReader` (`prisma-deadline-orders.reader.ts:30`)                                                                                                                                                        | statuts en attente de retrait + `settlementWhere`                                           | les **échéances du four** (`due-thresholds.service.ts`) → tranches, paliers de la fiche, calendrier du dossier                                                                                           | tirerait une échéance de four                                                                                                        |
| `PrismaSiteArrivalOrdersReader` (`prisma-site-arrival-orders.reader.ts:27`)                                                                                                                                                 | retraits en attente + `settlementWhere`                                                     | l'**heure d'arrivée d'un transfert** au site (`commerce-transfer-sites.service.ts`)                                                                                                                      | avancerait la fenêtre du transfert, ou en ferait poser un                                                                            |
| `PrismaTransferOrdersReader` et `PrismaTransferOrderContentsReader` (`prisma-transfer-orders.reader.ts:28,71`)                                                                                                              | retraits datés aux sites servis par transfert, statut actif — **aucun filtre de règlement** | le **rattachement au transfert**, son **manifeste**, les papiers et le départ de la tournée (`transfer-attachment.ts`, `get-internal-transfer-manifest.handler.ts`, `depart-delivery-round.handler.ts`…) | au Village, serait **ajoutée au transfert** et à son manifeste — alors que la marchandise est déjà dans la vitrine du Village        |
| `PrismaUnsettledSettlementReader` (`prisma-unsettled-settlement.reader.ts:18`)                                                                                                                                              | `status: placed`, jour de service                                                           | le **balayage des règlements en attente** à la clôture (`pending-settlement-sweep.service.ts`)                                                                                                           | serait traitée comme une commande du plan au règlement pendant ; son expiration est celle de la boutique (§4.6)                      |

**Doit la voir, autrement — la Supervision :**

| Lecteur                                                              | Ce qu'il fait                                                                                                                                     | Le geste                                                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `PrismaDaySupervisionReader` (`prisma-day-supervision.reader.ts:46`) | toutes les commandes du jour (`status ≠ draft` + `settlementWhere`) ; `awaitingProduction` nourrit « attend le four » (`OvenWaitingOrdersReader`) | la montrer en **Retrait** (prête, en vitrine) et **jamais** en Préparation ni « attend le four » : la vue doit porter la marque |

**Doivent la voir telle quelle — le retrait et l'argent :**

- la **file du comptoir** (`prisma-handover-queue.reader.ts`, `expectedOnWhere`) et la **remise** (`handover-order.query.ts`, `handover-subject.reader.ts`) — c'est par là qu'elle est remise ;
- les **rappels au client** (`prisma-customer-nudge-trace.reader.ts`, `prisma-order-customer-nudges.repository.ts`) ;
- la **facture** et le **prélèvement** (`billableOrderWhere`, `prisma-procedure-orders.reader.ts`) ;
- les **listes** du staff et du client (`prisma-admin-order-list.reader.ts`, `prisma-company-order-list.reader.ts`, `prisma-order.reader.ts` côté client) — avec un badge « sur stock ».

**Sans objet :**

- `PrismaDeliveryOrdersReader`, `PrismaDeliveryRunSheetReader` : livraisons seulement (`fulfillmentMethod: "delivery"`) — la commande sur stock est un retrait ;
- `PrismaOrderPlanRelease` (`prisma-order-plan-release.ts`, réouverture du plan) : ne touche que les `confirmed` ; une commande sur stock reste `placed` jusqu'à sa remise ;
- le colisage (`packing/`) : il lit les faits publiés à l'arrêt et au retirage, donc ce que `planWhere` laisse passer — couvert par la première ligne.

**À vérifier au bâti** (non ouvert ici) : `prisma-unconfirmed-deliveries.reader.ts` (comptabilité) ; la révision d'une commande (`prisma-order-revision.repository.ts`, `revisable-order.row.ts`) — elle ne doit pas pouvoir **déplacer** une commande sur stock vers un autre jour.

**Ce que l'inventaire propose** — interdire plutôt que vérifier : **un seul
filtre** `notFromStock()` dans `plan-filter.ts`, versé **dans** `planWhere` (ce
qui couvre d'un coup fiche, retirage, rattrapage, prévisionnel, état du jour,
absorption) et dans une `productionWhere()` = `settlementWhere` + `notFromStock`
que prennent les quatre autres lecteurs de production et de transport.
`settlementWhere` seul ne disparaît pas : la Supervision et le reste le
gardent. Une **e2e unique** sème une commande sur stock au Village et vérifie
qu'elle est **absente** de chaque lecteur du premier tableau, **présente** dans
la file du comptoir, et en **Retrait** à la Supervision.
