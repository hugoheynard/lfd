# Le circuit du jour J — commander pour aujourd'hui, sur le stock de la vitrine

> **Dossier unique du circuit, rassemblé le 2026-11-02** (Hugo : « j'ai besoin
> qu'on rassemble toutes les informations sur ce circuit »). Il remplace le plan
> du 2026-10-21 (« le jour même des particuliers, version simple ») et le plan
> du retrait immédiat au comptoir écrit le matin même — tous deux dans
> l'historique git, leur contenu repris ici. Les faits du code ont été relus le
> 2026-11-02 ; chaque affirmation sur un autre fichier porte son chemin.
>
> **État** : **J1 est bâti** (le stock du jour, par la réception du réassort —
> §7). **Rien du circuit lui-même** ne l'est. Le dessin a été contredit quatre
> fois par `vitruve` le 2026-11-02 (§9, §12, §13), chaque objection reprise ;
> toutes les questions sont tranchées par Hugo. **Prêt à bâtir, lot par lot
> (§14).** Touche l'**argent** et un **stock**.

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
- **Le nom de la marque** : `supply` (`planned` / `shelf`), d'où vient la
  marchandise — pas « même jour », qu'une saisie hors plan cuite par un
  retirage est aussi. `placed_off_plan` existant n'est qu'un badge et ne la
  remplace pas.
- **« Valider et remettre »** pour le retrait immédiat d'un pro (§5).

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
  (`supply`, colonne additive à deux valeurs : `planned` — fabriquée pour elle — et `shelf` — prise dans la vitrine ; figée à la passation, jamais modifiable), et non un mode d'acheminement : elle
  reste un retrait pour la file, la remise, le BL et la facture.
- **Le reste** = reçus réceptionnés − lignes des commandes sur stock non
  annulées, du jour, au point ; **un seul calcul**, servi par un port que le
  contexte des commandes implémente, lu par la Supervision, la réception et la
  passation.
- **Garde sous verrou** à la passation, et le même verrou pour les corrections
  de réception.
- **Pas d'heure limite générale** pour elle ; ce qui la limite : l'autorisation
  de sa clientèle, les créneaux restants du site, le reste.
- **Le raccourci** du comptoir pose en plus `entry_shortcut = immediate_pickup`
  (le compte que veut Hugo, croisé avec la clientèle déjà figée sur la
  commande) et le règlement au compte, selon l'option admin du pro sans crédit.
- **« Valider et remettre »** (Hugo, 2026-11-02) : pour le retrait immédiat
  d'un pro, le bouton de validation de la saisie devient **« Valider et
  remettre »** — un seul geste du vendeur, qui passe la commande puis la remet.
  La remise reste **celle du bloc du retrait** (`confirm-handover.handler.ts`,
  le fait `OrderHandedOver`, le BL créé à la remise, la clôture du règlement) :
  le commerce n'écrit jamais la remise lui-même (§9.2, 3). Si la remise est
  refusée après une passation réussie, la commande reste dans la file du
  comptoir, où le geste normal la remet ; l'écran le dit.

Lots proposés : **J2a** (la marque, le reste, le verrou), **J2b** (la passation
d'un particulier), **J2c** (la saisie de l'équipe et le raccourci), **J3/J4**
(les écrans de la boutique et du comptoir).

## 6. Questions ouvertes

- ~~**Q3 bis**~~ — tranchée le 2026-11-02 (Hugo, « à définir en admin ») : la
  durée pendant laquelle un paiement en cours tient le stock est **un réglage
  de la page Jour même**. Reste à décider au bâti ce que deviennent les
  commandes que l'expiration ne sait pas annuler (§4.6) : elles tiennent leur
  quantité tant qu'elles ne sont ni payées ni annulées.
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
   - **la Supervision** (`prisma-day-supervision.reader.ts:56-58`). ⚠️ Corrigé au
     bâti de L1 : « attend le four » (`awaitingProduction`) ne s'y calcule pas,
     il vit au colisage (`packing-board.ts`, `BoardOvenWaitingOrdersReader`),
     nourri par les faits de l'arrêt et du retirage — donc déjà fermé par
     `planWhere`.

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
que prennent les six autres adaptateurs de production et de transport.
`settlementWhere` seul ne disparaît pas : la Supervision et le reste le
gardent. Une **e2e unique** sème une commande sur stock au Village et vérifie
qu'elle est **absente** de chaque lecteur du premier tableau, **présente** dans
la file du comptoir, et en **Retrait** à la Supervision.

## 11. Les trois bloquants levés (2026-11-02, avant nouvelle contradiction)

Faits relus pour cette section : `order-drafting.service.ts:124-226`
(`draft`, `ensureDayOpen`, `holdPlan`), `order-plan-gate.service.ts:68-73`
(`hold` → `PlanAdmissionDesk.admit`),
`production/application/services/production-plan-admission.desk.ts:32-38`
(verrou de journée `ProductionDayLock` dans l'unité de travail de l'appelant,
puis lecture de l'arrêt), et les verrous existants du dépôt
(`pg_advisory_xact_lock(hashtextextended(…))` dans
`b2b/accounting/infrastructure/prisma-collection-lock.ts:33` et
`prisma-bank-export-preparation-lock.ts:45`).

### 11.1 La passation d'une commande `shelf`

- **Qui décide `supply`** : le **serveur**, jamais le client.
  - Passation d'un client (particulier, ou pro en ligne si l'option est
    ouverte) : une commande **pour aujourd'hui** est `shelf` — aujourd'hui ne
    se fabrique jamais pour un client, le plan est figé depuis la veille. Une
    commande pour demain ou après est `planned`.
  - Saisie de l'équipe : `planned` par défaut (le comportement d'aujourd'hui,
    hors plan compris) ; `shelf` seulement quand l'écran l'envoie — le
    raccourci « Retrait immédiat ».
- **L'agrégat porte l'invariant** : `Order.draft` reçoit `supply` et refuse
  une commande `shelf` qui n'est pas un retrait pour une journée donnée
  (`DomainError`). La marque n'a **aucun setter** : la révision
  (`order-revising`) refuse de changer la journée d'une commande `shelf`.
- **Les gardes de `OrderDrafting.draft`** se séparent sur `supply` :

  | Garde                                                  | `planned` (inchangé) | `shelf`                                                                                                                         |
  | ------------------------------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
  | `ensureDayOpen` (plan arrêté, réglage jour même)       | oui                  | **non** — remplacée par la garde du circuit : la clientèle est autorisée (réglage particuliers / pros, option « pro en ligne ») |
  | `ensureNotTooLate` (heure limite générale, dérogation) | oui                  | **non** — remplacée par : le site a encore un créneau de retrait aujourd'hui, après maintenant                                  |
  | `holdPlan` (verrou de journée, `receiveOffPlan`)       | oui                  | **non** — une commande `shelf` n'entre jamais au plan, elle n'a pas à attendre son arrêt                                        |
  | garde du **reste** sous verrou du stock (§11.2)        | —                    | **oui**                                                                                                                         |

  `receiveOffPlan` ne change pas : il reste la réception hors plan des
  saisies `planned` de l'équipe.

### 11.2 Le verrou du stock et son ordre

- **Le verrou** : `pg_advisory_xact_lock(hashtextextended('shelf:' || jour ||
':' || site, 0))`, relâché au `COMMIT` — la forme déjà en usage dans
  `b2b/accounting`. Son **propriétaire** est le contexte qui possède le stock,
  `b2b/resupply` : un port `ShelfStockLock` (domaine) et son adaptateur Prisma.
  La passation (`b2b/orders`) l'appelle dans sa transaction ; c'est le même
  bloc `b2b`, aucune frontière franchie.
- **Le reste** est lu **sous** ce verrou : reçus réceptionnés du jour au point
  (`resupply`) − lignes des commandes `shelf` du jour au point dont le statut
  n'est pas `cancelled` (port `ShelfDrawsReader`, implémenté par `orders`). Une
  commande au paiement refusé ou en cours **compte** jusqu'à son annulation
  par l'expiration (durée réglée en admin) ; celles que l'expiration ne sait
  pas annuler (§4.6) comptent tant qu'elles vivent. Un seul calcul, servi aussi
  à la Supervision et à la réception par un service applicatif qui passe les
  prélèvements à `estimateStock`, laquelle reste pure.
- **La correction d'un reçu** (`correct-received-resupply-line.handler.ts`)
  prend le même verrou et **refuse** de descendre sous ce qui a déjà été pris
  (« 12 déjà vendus sur stock »). L'annulation d'un réassort réceptionné est
  déjà refusée : rien à verrouiller.
- **L'ordre, et pourquoi il ne peut pas interbloquer** : le verrou du stock et
  le verrou de journée **ne sont jamais tenus ensemble**. La passation `shelf`
  ne prend pas le verrou de journée (§11.1) ; la passation `planned`, l'arrêt
  du plan, le retirage et le lancement d'un réassort ne prennent pas le verrou
  du stock. La règle s'écrit dans le JSDoc des deux ports, et une e2e passe une
  commande `shelf` pendant qu'un arrêt du plan tient la journée.

### 11.3 Le règlement d'une saisie de l'équipe

- **Aucun défaut serveur** : le contrat de soumission (`admin-order.ts:115-117`)
  garde son exigence d'un `settlement` explicite — la décision écrite tient.
- **Un choix pré-rempli à l'écran**, par client : « au compte » si le client a
  un crédit au compte accordé, sinon « lien de paiement ». L'écran envoie la
  valeur, explicitement, comme aujourd'hui.
- **Les brouillons enregistrés** gardent la valeur qu'ils portent ; le
  `.default("link")` du brouillon (l. 236) ne sert qu'à ceux qui n'en portent
  pas et ne change pas — rien ne bascule en silence.
- **Le raccourci « Retrait immédiat »** envoie `settlement: "account"` ; un pro
  sans crédit suit l'option admin : refusé (le bouton le dit avant la saisie),
  ou envoyé en « lien de paiement » — auquel cas « Valider et remettre » ne
  remet pas (règlement non clos) et la commande attend dans la file.

## 12. Troisième contradiction de `vitruve` (2026-11-02), et ce qu'elle change

Trois **bloquants** sur le §11, chacun avec sa réponse proposée.

1. **Trois gestes font baisser un reçu, pas un.** Outre
   `correct-received-resupply-line.handler.ts`, le réassort sans commande baisse
   le stock par `CorrectResupplyLineHandler` (`correct-resupply-line.handler.ts:27-31`)
   et `WithdrawResupplyLineHandler` (`withdraw-resupply-line.handler.ts:24-33`) ;
   il est « reçu » dès sa première ligne (`resupply-receipt.ts:175`).
   → **Proposé** : un seul service applicatif du réassort, par lequel passe
   **toute** baisse d'une quantité reçue — il prend le verrou du stock et
   refuse de descendre sous le déjà-pris ; les trois handlers l'appellent. À
   ouvrir au bâti : `send-reserve-to-shop.handler.ts` et
   `mark-arrived-on-transfer-received.handler.ts`, qui pourraient écrire un reçu.
2. **La révision d'une commande `shelf`** (`order-revising.service.ts:182-246`)
   recompose ses lignes : une hausse vendrait au-delà du reste, et la garder
   obligerait à tenir le verrou du stock **avec** celui de journée (`holdDay`).
   → ~~une commande `shelf` ne se modifie pas~~ — **refusé par Hugo le
   2026-11-02 : « je voudrais pouvoir modifier les commandes prises sur la
   vitrine »**. Décidé à la place :
   - la révision d'une commande `shelf` prend **le verrou du stock à la place**
     du verrou de journée (`holdDay` se sépare sur `supply` comme `holdPlan`) :
     les deux verrous ne sont toujours jamais tenus ensemble ;
   - elle applique les gardes du circuit (clientèle autorisée, créneau restant,
     **reste** recalculé en rendant d'abord les quantités de la commande
     elle-même), et non `ensureDayOpen` / `ensureBeforeCutoff` ;
   - **les lignes et les quantités** se modifient ; **la journée** ne change pas
     (une commande `shelf` reste d'aujourd'hui) ; **le point** non plus — le
     stock d'un autre point est un autre stock : changer de point, c'est annuler
     et refaire ;
   - une commande `shelf` **déjà remise** ne se modifie plus, comme toute
     commande remise (le « Retrait immédiat » d'un pro l'est dès sa
     validation).
3. **Aucun créneau pro n'existe** : les seuls créneaux sont publics
   (`public_pickup_slot_rules`, `settings.prisma:502-537`).
   → **Proposé** — la source selon la porte :
   - particulier en ligne : les **créneaux publics** du site, fermetures
     (`public-pickup-closure.ts`) comprises ;
   - pro en ligne : la **fenêtre de retrait pro** du site (`opening.proPickup`,
     déjà servie avec les points de retrait) ;
   - pro au comptoir (« Retrait immédiat ») : **aucune garde de créneau** — la
     remise est immédiate, le client est devant le vendeur.
   - Un site sans créneau ni fenêtre pour cette clientèle ne propose pas
     aujourd'hui — jamais un horaire inventé.

**Sérieux**, repris :

- **L'agrégat reçoit « aujourd'hui »** (en paramètre, comme `activate`) et
  refuse une commande `shelf` d'un autre jour — une commande `shelf` datée de
  demain ne serait jamais cuite.
- **« Client + aujourd'hui = `shelf` » seulement si le plan d'aujourd'hui est
  arrêté.** Plan ouvert (rouvert, ou pas encore arrêté faute d'heure limite) :
  la commande est `planned`, le fournil la prend. **Confirmé par Hugo le
  2026-11-02.**
- **Le pré-remplissage du règlement lit le payeur**, comme le serveur
  (`order-settlement.ts:114-126` : `payerId ?? companyId`, société active) : la
  vue du comptoir (`CounterCustomerView.settlesOnAccount`, calculée sur la
  société seule, `get-counter-customer.handler.ts:58`) est à aligner, sans quoi
  un site rattaché à un principal verrait « au compte » proposé puis refusé.
- **L'annulation d'une commande `shelf`** ne traverse pas le guichet du fournil
  (`order-workshop-withdrawal.ts:42-70`, qui prend `ProductionDayLock` et
  interroge le colisage) : elle ne fut jamais inscrite. Un chemin propre, qui
  rend la quantité en retombant hors des prélèvements.
- **Toutes les portes se séparent sur `supply`**, pas seulement `draft` :
  `place-shop-order.handler.ts` (invité), `quote-order.handler.ts` (devis),
  `order-cutoff-notice.service.ts` (avis d'heure limite),
  `cart-adjustments.service.ts` — sans quoi l'écran annoncerait un refus que la
  passation ne fait plus.
- **L'ordre des verrous dans `persist`** pour `shelf` : verrou du stock, puis
  bon de fidélité (`vouchers.reserve`), puis la commande — et le refus du reste
  annule l'intention Stripe créée avant la persistance par le mécanisme déjà en
  place (`place-order.handler.ts:265`).

**Mineurs** : les prélèvements excluent aussi `draft` (pas seulement
`cancelled`) ; le JSDoc d'`estimateStock` (« aucun port posé d'avance ») est à
réécrire au bâti.

**Non vérifié par `vitruve`** : les abonnements (qui ne passent pas par
`OrderDrafting`) peuvent-ils viser aujourd'hui ; `Order.revise` peut-il changer
l'acheminement ou le point (sans objet si la révision d'une `shelf` est
refusée) ; le `persist` de la passation invité.

## 13. Quatrième contradiction (2026-11-02) — la révision d'une commande `shelf`

1. **Bloquant, corrigé ici.** Le verrou de journée de la révision n'est pas
   `holdDay` : c'est `workshops.note(...)` (`revise-order.handler.ts:93`), qui
   passe par le guichet du fournil (`OrderWorkshopRevision.note`,
   `ProductionOrderRevisionDesk.note` : `ProductionDayLock` par journée touchée,
   puis une note de révision au fournil). **Décidé** : la révision d'une
   commande `shelf` **ne passe ni par le guichet du fournil
   (`workshops.note`) ni par le suivi des BL (`deliveryNotes.followRevision`)**
   — elle n'a jamais été inscrite au fournil, et son BL naît à la remise. La
   séparation se fait dans `ReviseOrderHandler` sur la marque relue, et une
   e2e vérifie qu'aucune note de révision n'est écrite pour une `shelf`. Les
   deux verrous restent ainsi jamais tenus ensemble ; l'ordre réel de la
   révision `shelf` est : la ligne `orders`, puis le verrou du stock.
2. **Bloquant, à trancher par Hugo.** La règle M1 refuse de modifier une
   commande dont le règlement par **carte** est attendu ou encaissé
   (`order-revisability.ts:65-76`, rejugée dans `Order`,
   `ensureRevisableSettlement`) — le lot M2 (complément ou remboursement partiel
   par Stripe) n'est pas bâti. Et un « Retrait immédiat » est remis dès sa
   validation. **Concrètement, la décision « pouvoir modifier une commande
   prise sur la vitrine » ne vaut aujourd'hui que pour une commande `shelf`
   réglée au compte et pas encore remise** : un pro en ligne, ou un « Valider
   et remettre » dont la remise a échoué. Une commande `shelf` d'un
   particulier (toujours par carte) ne se modifie pas tant que M2 n'existe pas
   — elle s'annule et se refait. À Hugo : accepter cette limite pour le premier
   bâti, ou ouvrir M2 d'abord (chantier d'argent, contredit en octobre :
   « plus tard »).

**Sérieux**, repris dans le dessin :

- **« Lignes et quantités » a une garde à elle** : `Order.recompose` rejuge
  l'invariant `shelf` ⇒ retrait, même jour, même point — `Order.revise` accepte
  sinon `method`, adresse, créneau (`order-revision.ts:272-284`), et une
  `shelf` passée en livraison entrerait dans les tournées. Ce n'est **pas**
  `isQuantitiesOnly` (`revision-after-arrest.ts:49-63`), qui refuse un article
  nouveau.
- **Toutes les gardes de révision se séparent sur `supply`** : `ensureDayOpen`,
  `ensureBeforeCutoff`, le refus client sur journée arrêtée dans `holdDay`
  (`order-revising.service.ts:262-264`), et le verdict des écrans
  `revisabilityOf` (l. 117-138). Préalable : la ligne relue `RevisableOrder`
  (`revisable-order.row.ts`) porte `supply`.
- **Le reste est revérifié dans `record`**, sous le verrou du stock, après le
  verrou de la ligne `orders` — la recomposition hors transaction ne fait foi
  de rien.

**Mineurs** : §9.3 compte six adaptateurs hors `planWhere`, pas quatre ; une
commande `shelf` au lien non payé ne se modifie pas (M1) — son seul geste est
l'annulation, qui rend son stock.

## 14. Les lots (Hugo, 2026-11-02 : « on accepte la limite, découpe les lots »)

**La limite acceptée** : une commande `shelf` payée par carte ne se modifie pas
tant que M2 (modifier une commande payée par carte) n'existe pas ; elle
s'annule et se refait (§13, 2).

Chaque lot se livre seul, dans l'ordre : aucun ne change ce que voit un client
avant L4, et aucun n'écrit de commande `shelf` avant L4. Les lots qui touchent
une migration passent par `lecteur-de-migrations` avant `main`.

| Lot                                      | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Couches                            | Les e2e qui le tiennent                                                                                                                                                                                                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1 — la marque, sans effet**           | Migration additive : `orders.supply` (`planned` / `shelf`, défaut `planned`) et `orders.entry_shortcut` (nullable). `Order.draft` et `Order.recompose` portent l'invariant (`shelf` ⇒ retrait, aujourd'hui, même point ; « aujourd'hui » reçu en paramètre). `RevisableOrder` et la vue de la Supervision portent `supply`. Le filtre `notFromStock()` versé dans `planWhere`, et `productionWhere()` = `settlementWhere` + `notFromStock` pour les six autres adaptateurs du §9.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | API, migration                     | une commande `shelf` semée par le domaine au Village est **absente** de chaque lecteur de production et de transport du §9.3, **présente** dans la file du comptoir, en **Retrait** à la Supervision ; un retirage ne l'absorbe pas ; l'alerte de rattrapage ne sonne pas |
| **L2 — le stock décompté**               | `ShelfStockLock` (port de `b2b/resupply`, verrou consultatif par jour et site) ; `ShelfDrawsReader` (implémenté par `orders` : lignes `shelf` du jour au point, statut ni `draft` ni `cancelled`) ; un service applicatif du stock du jour qui passe les prélèvements à `estimateStock` (pure), lu par la Supervision et la réception ; un seul service par lequel passe **toute baisse** d'une quantité reçue (les trois handlers du §12, 1), sous le verrou, refusant de descendre sous le déjà-pris. Le JSDoc d'`estimateStock` réécrit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | API                                | le reste baisse d'une commande `shelf` et remonte à son annulation ; corriger ou retirer une ligne sous le vendu est refusé (les trois chemins)                                                                                                                           |
| **L3 — les réglages**                    | Page Réglages › Commandes › Jour même : autoriser **particuliers** / **pros**, option **pro en ligne**, option **pro sans crédit** (refuser / lien de paiement), **durée** de tenue du stock par un paiement en cours. Migration additive ; l'interrupteur `same_day_allowed` actuel garde son sens jusqu'à L4, puis se lit comme « particuliers ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | API, migration, back-office        | la page lit et écrit ; un réglage absent vaut « fermé »                                                                                                                                                                                                                   |
| **L4 — la passation sur stock**          | Toutes les portes se séparent sur `supply` : `place-order.handler.ts`, `place-shop-order.handler.ts` (invité), `place-order-for-customer.handler.ts` (équipe, `supply` envoyé par l'écran), `quote-order.handler.ts`, `order-cutoff-notice.service.ts`, `cart-adjustments.service.ts`. Le serveur décide `shelf` (client + aujourd'hui + plan du jour arrêté). Gardes du circuit (clientèle autorisée, créneau restant : créneaux publics et fermetures pour le particulier, fenêtre pro pour le pro en ligne, aucune pour le comptoir ; reste sous verrou dans `persist`, avant le bon de fidélité ; refus qui annule l'intention Stripe). `/fulfillment-days` propose aujourd'hui par site. L'expiration lit la durée réglée. L'annulation d'une `shelf` ne traverse pas le guichet du fournil.                                                                                                                                                                                                                              | API                                | course au dernier article (deux passations, une refusée) ; panier mixte refusé ; plus de créneau aujourd'hui → refusé ; clientèle non autorisée → refusé ; paiement abandonné → le stock revient ; plan d'aujourd'hui rouvert → la commande est `planned`                 |
| **L5 — modifier une commande sur stock** | `ReviseOrderHandler` sépare `shelf` : ni `workshops.note` ni `deliveryNotes.followRevision` ; verrou du stock à la place ; gardes du circuit dans `revisabilityOf`, `ensureDayOpen`, `ensureBeforeCutoff`, `holdDay` ; le reste revérifié dans `record` sous le verrou ; lignes et quantités seulement (§13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | API                                | une `shelf` au compte se modifie dans la limite du reste ; aucune note de révision n'arrive au fournil ; changer le jour, le point ou le mode est refusé ; une `shelf` par carte reste non modifiable (M1)                                                                |
| **L6 — le comptoir**                     | « Retrait immédiat » / « Commande programmée » ; le catalogue réduit au stock du point avec le reste ; le règlement pré-rempli par le **payeur** (la vue `CounterCustomerView.settlesOnAccount` alignée sur `order-settlement.ts`) ; **« Valider et remettre »** (la passation, puis la remise par `confirm-handover`) ; **le bon remis au client** (Hugo, 2026-11-02 : « on doit aussi donner un bon avec le contenu de la commande ») — la remise crée le BL (`mark-order-fulfilled.handler.ts:120-122`), et l'écran ouvre aussitôt son **BL client chiffré** (chiffré : décidé par Hugo le 2026-11-02) à imprimer (`GET admin/orders/:orderId/delivery-notes/:number/client.pdf`, le même que celui du client) ; cette route est aujourd'hui sous `b2b_orders` (`admin-order-delivery-notes.controller.ts:33`), que le vendeur du comptoir n'a pas : à ouvrir sous `handover_counter` pour une commande remise au comptoir ; `entry_shortcut = immediate_pickup` ; le badge « sur stock » dans Commandes et la Supervision. | back-office, API (vue du comptoir) | specs `ng test` ; e2e : « Valider et remettre » donne une commande remise, son BL, et la facture du mois ; une remise refusée laisse la commande dans la file                                                                                                             |
| **L7 — la boutique**                     | « Aujourd'hui » dans le choix du jour quand le circuit est ouvert pour le client et le point ; le reste sur la vignette (« plus que 3 ») ; les articles hors stock grisés pour aujourd'hui ; un panier mixte proposé pour demain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | boutique                           | specs `ng test`, et à l'écran                                                                                                                                                                                                                                             |

**À ouvrir au bâti**, que l'inventaire n'a pas couvert :
`prisma-unconfirmed-deliveries.reader.ts` ; `send-reserve-to-shop.handler.ts`
et `mark-arrived-on-transfer-received.handler.ts` (écrivent-ils un reçu ?) ;
les abonnements (visent-ils aujourd'hui ?) ; `CancellationRule.stateOf` pour une
`shelf` ; le `persist` de la passation invité.

### Le bâti de L1 (2026-11-02)

- `domain/value-objects/order-supply.ts`, `domain/services/order-supply-rules.ts`
  (`ensureSupplyFits` à la passation, `ensureShelfKeepsRoute` à la révision),
  trois `DomainError` (`shelf-order-errors.ts`). `Order.draft(input, supply)`
  garde un défaut `planned` ; les trois appelants de production passent la
  marque explicitement. Le raccourci n'existe que sur une `shelf` (type et
  CHECK `orders_entry_shortcut_on_shelf`).
- `notFromStock()` dans `planWhere()` ; `productionWhere()` pour le dossier,
  les échéances et l'arrivée des transferts ; `notFromStock()` dans les deux
  lecteurs du transfert et le balayage des règlements.
- La Supervision montre une `shelf` à l'étape **prête** (`supervisedStageOf`),
  jamais en attente ni « pas prête avant le créneau ».
- **Pour L4** : une `shelf` payée par carte et encore en attente à la clôture
  n'est plus annulée par le balayage des règlements (`notFromStock` y est
  posé, sans e2e) ; seule l'expiration boutique (§4.6) la tient — à couvrir
  par L4.
- **Pour Hugo** : `prisma migrate dev` a voulu remettre à blanc la base de dev
  (dérive connue : `StaffResource` `storefront` / `b2b_storefront`, migration
  `20261013300000` appliquée mais absente du dépôt). La migration a été
  appliquée par `migrate deploy`, qui n'efface rien. La dérive reste à
  réaligner (carte des chantiers, §0).

### Le bâti de L2 (2026-11-02)

- `ShelfStockLock` (`b2b/resupply/domain/shelf-stock-lock.ts`) et son adaptateur
  `pg_advisory_xact_lock` ; la règle « jamais tenu avec le verrou de journée »
  est écrite dans les deux ports.
- `ShelfDrawsReader` (déclaré par `resupply`, implémenté par `orders`,
  `prisma-shelf-draws.reader.ts`) : lignes **à la pièce** des commandes `shelf`
  du jour au point, statut ni `draft` ni `cancelled`.
- `estimateStock(receipts, draws)` reste pure ; `DayShelfStock` est le seul
  endroit qui lui passe les prélèvements, lu par la réception et l'onglet Stock
  de la Supervision. Le contrat servi garde sa forme : `estimatedStock` vaut
  désormais « reçu − pris ».
- `ReceivedStockLowering` : toute baisse d'une quantité reçue (les trois
  chemins) prend le verrou et refuse de passer sous le déjà-pris
  (`resupply.receipt.below_shelf_draws`, 409). `send-reserve-to-shop` et
  `mark-arrived-on-transfer-received` n'écrivent que la demande de réassort,
  jamais un reçu (vérifié au bâti).
- ~~Pour L4 : refuser un article au poids~~ — **Hugo, 2026-11-02 : « un article
  au poids doit avoir un stock au poids »**. Lot ajouté, **L2b** (§14).
- **Pour L6** : un article pris sans avoir été reçu apparaîtrait avec un reste
  négatif ; aucun chemin ne le produit tant que la passation garde le reste.
