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
  refusée après une passation réussie, la commande reste « passée », sans BL ;
  l'écran le dit. Le seul refus réel est celui d'une commande au lien non
  payée : elle n'entre dans la file du comptoir qu'une fois payée
  (`showsInQueue`, `commande-carte-reglee.md` §4.4), et elle y est alors
  remise par le geste normal (Hugo, 2026-11-02 : « laisse ainsi »).

Lots proposés : **J2a** (la marque, le reste, le verrou), **J2b** (la passation
d'un particulier), **J2c** (la saisie de l'équipe et le raccourci), **J3/J4**
(les écrans de la boutique et du comptoir).

## 6. Questions ouvertes

- ~~**Q3 bis**~~ — tranchée le 2026-11-02 (Hugo, « à définir en admin ») : la
  durée pendant laquelle un paiement en cours tient le stock est **un réglage
  de la page Jour même**. Reste à décider au bâti ce que deviennent les
  commandes que l'expiration ne sait pas annuler (§4.6) : elles tiennent leur
  quantité tant qu'elles ne sont ni payées ni annulées.
  **Complété par Hugo le 2026-11-02** : une commande `shelf` que l'équipe
  envoie **au lien de paiement** expire elle aussi à la même durée
  (`shelf_hold_minutes`) si elle n'est pas réglée, et son stock revient. La
  durée réglée ne vaut que pour les `shelf` ; les commandes boutique
  fabriquées gardent leurs 30 minutes.
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
  remet pas (règlement non clos) : la commande reste « passée » et n'entre
  dans la file qu'une fois payée (Hugo, 2026-11-02).

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

| Lot                                                                                                                                                                          | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Couches                                        | Les e2e qui le tiennent                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **L1 — la marque, sans effet**                                                                                                                                               | Migration additive : `orders.supply` (`planned` / `shelf`, défaut `planned`) et `orders.entry_shortcut` (nullable). `Order.draft` et `Order.recompose` portent l'invariant (`shelf` ⇒ retrait, aujourd'hui, même point ; « aujourd'hui » reçu en paramètre). `RevisableOrder` et la vue de la Supervision portent `supply`. Le filtre `notFromStock()` versé dans `planWhere`, et `productionWhere()` = `settlementWhere` + `notFromStock` pour les six autres adaptateurs du §9.3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | API, migration                                 | une commande `shelf` semée par le domaine au Village est **absente** de chaque lecteur de production et de transport du §9.3, **présente** dans la file du comptoir, en **Retrait** à la Supervision ; un retirage ne l'absorbe pas ; l'alerte de rattrapage ne sonne pas |
| **L2 — le stock décompté**                                                                                                                                                   | `ShelfStockLock` (port de `b2b/resupply`, verrou consultatif par jour et site) ; `ShelfDrawsReader` (implémenté par `orders` : lignes `shelf` du jour au point, statut ni `draft` ni `cancelled`) ; un service applicatif du stock du jour qui passe les prélèvements à `estimateStock` (pure), lu par la Supervision et la réception ; un seul service par lequel passe **toute baisse** d'une quantité reçue (les trois handlers du §12, 1), sous le verrou, refusant de descendre sous le déjà-pris. Le JSDoc d'`estimateStock` réécrit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | API                                            | le reste baisse d'une commande `shelf` et remonte à son annulation ; corriger ou retirer une ligne sous le vendu est refusé (les trois chemins)                                                                                                                           |
| **L2b — le stock au poids** (Hugo, 2026-11-02 : « un article au poids doit avoir un stock au poids », puis « on le fait au passage » : le réassort au poids de bout en bout) | Quatre sous-lots, dans l'ordre. **L2b-1 · commerce** : l'unité **figée** sur la ligne de demande et sur la ligne de reçu (`sale_unit`, comme `order_lines.sale_unit`, migration additive, défaut `piece`) et dans le brouillon du fournil ; `resuppliable` admet le poids ; `estimateStock`, `ShelfDrawsReader` et `ReceivedStockLowering` comptent par (article, unité), jamais pièces et grammes ensemble ; tant que L2b-2 n'existe pas, une demande au poids ne part pas au fournil (garde à l'envoi). **L2b-2 · fournil** : l'unité dans `ProductionResupplyLine` et le snapshot de la journée, plus de `piece` en dur (`production-range-resupplies.ts:40`, `production-count.ts:73`), le bon de réassort PDF par unité — en réutilisant ce que P6 a bâti pour les commandes. **L2b-3 · colisage et transfert** : manifeste et répartition en bacs d'un réassort au poids. **L2b-4 · écrans** : comptoir, Supervision (Stock), fournil, **et le poste de colisage des réassorts** (ajouté au bâti de L2b-3 : il reçoit l'unité sans l'afficher) — saisie et affichage « 1,25 kg » ; la liste d'articles des écrans de réassort cesse d'écarter le poids (`CatalogResupplyCatalogue.articles()`) ; la vue du fournil `ProductionDayResupplyLine` porte l'unité ; les refus de la réserve disent « grammes » au lieu de « pièces » pour un article au poids. `vente-au-poids.md` §4 se révise. | API (deux blocs), deux migrations, back-office | un reçu de 5 kg − une commande `shelf` de 1,25 kg = 3,75 kg ; baisse sous le vendu refusée ; une demande au poids traverse fournil, colisage et transfert ; un article à la pièce inchangé                                                                                |
| **L3 — les réglages**                                                                                                                                                        | Page Réglages › Commandes › Jour même : autoriser **particuliers** / **pros**, option **pro en ligne**, option **pro sans crédit** (refuser / lien de paiement), **durée** de tenue du stock par un paiement en cours. Migration additive ; l'interrupteur `same_day_allowed` actuel garde son sens jusqu'à L4, puis se lit comme « particuliers ».                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | API, migration, back-office                    | la page lit et écrit ; un réglage absent vaut « fermé »                                                                                                                                                                                                                   |
| **L4 — la passation sur stock**                                                                                                                                              | Toutes les portes se séparent sur `supply` : `place-order.handler.ts`, `place-shop-order.handler.ts` (invité), `place-order-for-customer.handler.ts` (équipe, `supply` envoyé par l'écran), `quote-order.handler.ts`, `order-cutoff-notice.service.ts`, `cart-adjustments.service.ts`. Le serveur décide `shelf` (client + aujourd'hui + plan du jour arrêté). Gardes du circuit (clientèle autorisée, créneau restant : créneaux publics et fermetures pour le particulier, fenêtre pro pour le pro en ligne, aucune pour le comptoir ; reste sous verrou dans `persist`, avant le bon de fidélité ; refus qui annule l'intention Stripe). `/fulfillment-days` propose aujourd'hui par site. L'expiration lit la durée réglée. L'annulation d'une `shelf` ne traverse pas le guichet du fournil.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | API                                            | course au dernier article (deux passations, une refusée) ; panier mixte refusé ; plus de créneau aujourd'hui → refusé ; clientèle non autorisée → refusé ; paiement abandonné → le stock revient ; plan d'aujourd'hui rouvert → la commande est `planned`                 |
| **L5 — modifier une commande sur stock**                                                                                                                                     | `ReviseOrderHandler` sépare `shelf` : ni `workshops.note` ni `deliveryNotes.followRevision` ; verrou du stock à la place ; gardes du circuit dans `revisabilityOf`, `ensureDayOpen`, `ensureBeforeCutoff`, `holdDay` ; le reste revérifié dans `record` sous le verrou ; lignes et quantités seulement (§13).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | API                                            | une `shelf` au compte se modifie dans la limite du reste ; aucune note de révision n'arrive au fournil ; changer le jour, le point ou le mode est refusé ; une `shelf` par carte reste non modifiable (M1)                                                                |
| **L6 — le comptoir**                                                                                                                                                         | « Retrait immédiat » / « Commande programmée » ; le catalogue réduit au stock du point avec le reste ; le règlement pré-rempli par le **payeur** (la vue `CounterCustomerView.settlesOnAccount` alignée sur `order-settlement.ts`) ; **« Valider et remettre »** (la passation, puis la remise par `confirm-handover`) ; **le bon remis au client** (Hugo, 2026-11-02 : « on doit aussi donner un bon avec le contenu de la commande ») — la remise crée le BL (`mark-order-fulfilled.handler.ts:120-122`), et l'écran ouvre aussitôt son **BL client chiffré** (chiffré : décidé par Hugo le 2026-11-02) à imprimer (`GET admin/orders/:orderId/delivery-notes/:number/client.pdf`, le même que celui du client) ; cette route est aujourd'hui sous `b2b_orders` (`admin-order-delivery-notes.controller.ts:33`), que le vendeur du comptoir n'a pas : à ouvrir sous `handover_counter` pour une commande remise au comptoir ; `entry_shortcut = immediate_pickup` ; le badge « sur stock » dans Commandes et la Supervision.                                                                                                                                                                                                                                                                                                                                                                    | back-office, API (vue du comptoir)             | specs `ng test` ; e2e : « Valider et remettre » donne une commande remise, son BL, et la facture du mois ; une remise refusée laisse la commande dans la file                                                                                                             |
| **L7 — la boutique**                                                                                                                                                         | « Aujourd'hui » dans le choix du jour quand le circuit est ouvert pour le client et le point ; le reste sur la vignette (« plus que 3 ») ; les articles hors stock grisés pour aujourd'hui ; un panier mixte proposé pour demain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | boutique                                       | specs `ng test`, et à l'écran                                                                                                                                                                                                                                             |

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

### Le bâti de L3 (2026-11-02)

- Migration additive sur `order_cutoff_settings` : `same_day_public_allowed`,
  `same_day_pro_allowed`, `same_day_pro_online` (faux par défaut),
  `same_day_pro_without_credit` (`refuse` / `payment_link`, défaut `refuse`),
  `shelf_hold_minutes` (défaut 30, CHECK 5–120). `same_day_public_allowed`
  reprend la valeur de `same_day_allowed` à la migration.
- Domaine, vue, PATCH strict, fait du journal `order_cutoff_settings.updated`
  étendus ; une tenue hors bornes est refusée (`order_cutoff_settings.invalid_shelf_hold`).
- Back-office : la carte « Le circuit du jour J » sous la carte actuelle de la
  page Jour même, avec un encadré qui dit que ces réglages ne prennent pas
  encore effet. « Pros : commander pour aujourd'hui » sans l'option en ligne
  veut dire **au comptoir seulement**.
- **Rien ne lit encore ces réglages** : `same_day_allowed` garde son sens et
  ses lecteurs jusqu'à L4.
- **Tranché par Hugo le 2026-11-02** : à L4, **les nouvelles colonnes
  font foi**, et `same_day_allowed` devient une colonne morte (elle reste en
  base, CLAUDE.md §0) — la page ne garde alors qu'un interrupteur par clientèle.
- **Confirmé par Hugo le 2026-11-02** : la tenue par défaut est 30
  minutes (l'expiration boutique d'aujourd'hui ; le 2026-10-21 disait 15), bornée
  de 5 (le pas du balayage d'expiration) à 120.

### Le bâti de L2b-1 (2026-11-02)

- Migration `20261102210000_le_reassort_au_poids` : `sale_unit` (TEXT + CHECK
  `piece` / `weight`, la forme de `order_lines.sale_unit`), défaut `piece`, sur
  les lignes de demande et de reçu. Le brouillon du fournil (jsonb) porte une
  clé `saleUnit` optionnelle, lue `piece` si absente.
- L'unité est **figée à l'ajout** d'une ligne (lue au catalogue) ; un même
  article ne mélange pas deux unités ; le poids se compte en grammes entiers.
  `estimateStock`, le total des réassorts, l'onglet Stock et les prélèvements
  comptent par (article, unité) ; le refus de baisse dit « 1,25 kg ».
- **La garde d'envoi** (la garde `weight-resupply-guard` (retirée au lot L2b-3), dans `SiteResupply.place()`)
  refuse qu'une demande au poids parte au fournil — par le comptoir, le
  fournil ou la sortie de réserve. À retirer au lot L2b-2.
- La liste d'articles proposée aux écrans **écarte encore le poids**
  (`CatalogResupplyCatalogue.articles()`) : tant que les écrans saisissent des
  pièces, « 5 » deviendrait 5 g. À retirer au lot L2b-4.
- Pour L2b-2 : `production-range-resupplies.ts:40` pose toujours `piece` en
  dur. Pour L2b-3 : `PackedResuppliesReader` rend des pièces sans unité.
- E2E `shelf-stock-weight` : 5 kg reçus − 1 250 g sur stock = 3 750 g à la
  réception et à la Supervision ; baisse refusée ; demande au poids refusée à
  l'envoi.

### Le bâti de L2b-2 (2026-11-02)

- Migration `20261102220000_le_reassort_au_poids_au_fournil` : `sale_unit`
  (TEXT + CHECK `piece` / `weight`, défaut `piece`) sur
  `production.production_resupply_line`.
- Le canal `DayResuppliesReader` porte l'unité de chaque ligne
  (`PlacedResupplyLine.saleUnit`) ; le commerce la transmet, à l'arrêt comme au
  prévisionnel (`production-range-resupplies.ts` ne pose plus `piece`). Le fait
  `production.resupply_launched` la porte ; une ligne écrite avant se relit
  `piece`, une valeur inconnue rend le fait illisible.
- `freezeResupply`, `RESUPPLY_COLUMNS` et le prévisionnel figé recopient
  l'unité ; le compte à produire additionne commandes et réassorts en grammes
  pour un article au poids. **Un même article à la pièce d'un côté et au poids
  de l'autre fait refuser l'arrêt** (`MixedSaleUnitCountError`, comme entre deux
  commandes) : le référentiel refuse de changer l'unité d'une référence déjà
  demandée en réassort, ce cas ne naît que d'une course.
- Le bon de réassort PDF dit « 1,25 kg » sur la ligne ; son total
  « N pièces » compte une ligne au poids pour une, comme le bon de commande (P6).
  Le réassort d'exemple de la planche porte une ligne au poids.
- **La garde d'envoi reste** : le fait `production.resupply_list_drawn`, sa
  lecture au colisage et `packing_resupply_line` ne portent pas l'unité — un
  réassort de 2 000 g y deviendrait 2 000 pièces à coliser et au manifeste.
  Elle se retire à **L2b-3**.
- La vue `ProductionDayResupplyLine` (contrat de l'écran du fournil) ne porte
  pas encore l'unité : **L2b-4**.

**Validé par Hugo le 2026-11-02 (L2b-2)** : le total d'un bon de réassort compte
une ligne au poids pour une pièce, ses grammes écrits sur sa ligne (« 1 terrine
de 3,7 kg ») — le précédent P6 ; une commande à la pièce et un réassort au poids
du même article font refuser l'arrêt, comme deux commandes d'unités différentes.

### Le bâti de L2b-3 (2026-11-02)

- Migration `20261102230000_le_reassort_au_poids_au_colisage` : `sale_unit`
  (TEXT + CHECK `piece` / `weight`, défaut `piece`) sur
  `packing.packing_resupply_line`.
- Le fait `production.resupply_list_drawn` porte l'unité de chaque ligne ; la
  lecture des lignes (`resupplyLinesOf`) est partagée avec
  `production.resupply_launched` : absente = `piece`, inconnue = fait
  illisible. La fiche du colisage la recopie, colonne par colonne.
- La fiche de réassort au colisage saisit l'emballé d'une ligne au poids en
  grammes (0 ≤ emballé ≤ demandé), pris à la réserve comme des pièces ; le
  refus dit « 2 kg ». La vue du poste (`PackingResupplyLineView.saleUnit`)
  porte l'unité ; **l'écran du colisage ne l'affiche pas encore** (L2b-4).
- `PackedResuppliesReader` rend la quantité ET l'unité ; la réception
  pré-remplie prend l'emballé en grammes d'une ligne au poids ; un emballé
  d'une autre unité que la ligne ne la remplace pas.
- `FrozenResupplyLine` porte l'unité ; le manifeste du transfert ne pose plus
  `piece` en dur, et le papier de la tournée dit « 1,94 kg ».
- **La répartition en bacs n'a rien à faire** : une fiche de réassort n'a pas
  de contenant au colisage (`colisage/colisage.md` §2.2, tranché en R3c), et
  ni « Proposer » du colisage ni celui de la livraison ne voient un réassort.
  `weight_lot_over_bin` ne s'applique donc qu'aux commandes.
- **La garde d'envoi de L2b-1 est retirée** (la garde `weight-resupply-guard` (retirée au lot L2b-3), son
  erreur `resupply.sale_unit.weight_not_sendable`, ses tests). L'e2e
  `resupply-village-flow` porte le parcours entier : 2 kg envoyés au
  comptoir, comptés et imprimés en grammes, 1,94 kg emballés, partis en
  kilos, reçus 1 940 g au Village, à côté des croissants inchangés.

### Le bâti de L2b-4 (2026-11-02)

- **API** : `CatalogResupplyCatalogue.articles()` n'écarte plus le poids ;
  chaque article porte son unité. La vue du fournil
  `ProductionDayResupplyLine` porte `saleUnit` (`get-day-resupplies.handler.ts`).
  À la réserve du colisage, la réservation d'un réassort, la prise et la
  reprise d'une fiche connaissent l'unité : leurs refus disent « grammes »
  au poids, et le manque d'un réassort au poids se dit « 1,25 kg ».
- **Écrans** : la saisie se fait en GRAMMES (la case de la vente au poids,
  comme le panier du back-office et le dialogue du colisage), relue
  « 1,25 kg » à côté ; les pas rapides de pièces (±1, 10, 50, 100) ne
  s'affichent pas sur une ligne au poids. Comptoir › Réassort boutique (table,
  dialogue mobile, reçu sans commande, réception), Supervision › Stock
  (« 12 pièces · 1,25 kg » par réassort, stock et attendu en kilos), fournil
  (onglet Réassorts : cases en kilos, « Total au poids » à part du total des
  pièces ; cartes « Au plus tôt » et « À monter » ; table d'envoi par
  famille), poste de colisage des réassorts (demandé, attendu du four et
  emballé en kilos ; le refus « entre 0 et 2 kg » du serveur s'affiche tel
  quel). Le bon de réassort à l'écran dit « 1,25 kg » et compte la ligne
  pour une pièce, comme le PDF.
- **Reste** : le dossier du jour additionne encore les grammes d'un réassort
  au poids dans « dont N de réassort » de son rayon — au serveur
  (`day-dossier.ts`) comme à l'écran, qui le recopie.

### Le bâti de L4 (2026-11-02)

- **La marque se décide au serveur** (`ShelfCircuit.decide`,
  `b2b/orders/application/services/shelf-circuit.service.ts`) : un client
  (particulier, invité, pro en ligne) pour **aujourd'hui** sur un plan
  **arrêté** → `shelf` ; plan ouvert ou rouvert → `planned`. L'équipe : ce que
  l'écran envoie (`supply`, champ facultatif de `adminPlaceOrderPayloadSchema`
  et de `orderQuotePayloadSchema`, absent = `planned`). `entry_shortcut` reste
  vide : le « Retrait immédiat » qui le pose est L6.
- **Les gardes se séparent sur `supply`** dans `OrderDrafting.draft` :
  `shelf` ne passe ni par `ensureDayOpen`, ni par l'heure limite (aucune
  dérogation dépensée, aucune surtaxe), ni par le verrou de journée ; il passe
  par la **clientèle** (`sameDayOpenTo`, `order-cutoffs/domain/same-day-doors.ts`)
  et les **créneaux restants** du point (`pickupLeftToday`,
  `orders/domain/services/shelf-circuit.ts`) : créneaux publics et fermetures
  pour le particulier (un créneau dont le début est après maintenant, la
  règle de `publicPickupSlotsFor`), fenêtre pro non finie pour le pro en
  ligne, aucune pour le comptoir. Refus : `orders.same_day_closed`,
  `orders.shelf.no_pickup_left` (409).
- **Le reste sous le verrou** : `OrderDrafting.holdSupply` (ex-`holdPlan`)
  prend `ShelfStockLock` OU le verrou de journée, jamais les deux, en premier
  dans `persist` (avant le bon de fidélité). Le reste est relu par
  `DayShelfStock` et jugé par `ensureShelfStockCovers` (par article et unité,
  grammes au poids ; un article absent = 0, d'où le refus du panier mixte) :
  `orders.shelf.stock_short` (409). Un refus annule l'intention Stripe sur les
  trois portes — la boutique et la saisie de l'équipe ne l'annulaient pas
  avant ce lot.
- **Le pro sans crédit, au comptoir** (Q7) : une `shelf` au lien de paiement
  d'un payeur sans crédit accordé est refusée si le réglage dit « refuser »
  (`orders.shelf.without_credit`) ; « lien de paiement » la laisse passer, en
  attente de règlement. Au compte, la règle d'avant s'applique
  (`AccountSettlementNotGrantedError`).
- **Le réglage** : `same_day_allowed` n'est plus lu par aucune décision
  (colonne morte, [`reglages-generaux.md`](reglages-generaux.md) §1, §4) ; la
  porte « jour même » du plan ouvert (`OrderPlanGate.ensureNotTooSoon`) et la
  révision lisent aussi le réglage de la clientèle.
- **`/fulfillment-days`** propose aujourd'hui par point quand le plan
  d'aujourd'hui est arrêté et que la clientèle y a droit, sans heure limite
  (`orderUntil: null`), par le port `ShelfTodaySites` (déclaré par les heures
  limites, implémenté par les commandes) : créneau restant **et** reste positif
  pour tout le panier.
- **Le devis** (`QuoteOrderHandler` → `OrderCutoffNotice.forDay(…, supply)`)
  dit « ouvert, sans heure » pour une `shelf`.
- **La tenue du stock** : l'expiration annule, au-delà de `shelf_hold_minutes`,
  une `shelf` non réglée **passée par le client** avec une intention —
  particulier ou pro (`unsettledShelfOrderWhere`) ; les commandes boutique
  fabriquées gardent leurs 30 minutes. ~~Celle que l'équipe a envoyée au lien
  n'y entre pas~~ — **complément du 2026-11-02 (Hugo, §6 Q3 bis)** : elle y
  entre aussi, à la même durée ; `unsettledShelfOrderWhere` ne filtre plus
  `placedByStaffId` (une commande au compte n'a pas d'intention, elle n'y
  entre jamais). E2E : une `shelf` au lien non réglée est annulée après la
  durée réglée et rend sa part.
- **L'annulation** d'une `shelf` ne traverse pas le guichet du fournil
  (`OrderWorkshopWithdrawal`, `CancellationSubject.supply`) : elle rend sa part
  en retombant hors des prélèvements.
- E2E `shelf-order-placement` : la marque (arrêté → `shelf`, rouvert →
  `planned`), `/fulfillment-days`, la course au dernier article (deux
  transactions, une refusée), le panier mixte, plus de créneau, la clientèle
  fermée, le paiement abandonné qui rend sa part après la durée réglée,
  l'annulation par l'équipe, et une passation sur stock pendant qu'une autre
  transaction tient le verrou de la journée.
- **Pour L6** : l'encadré de la page Jour même (« ces réglages ne prennent pas
  encore effet ») est désormais faux, et l'interrupteur `same_day_allowed`
  qu'elle montre ne fait plus rien — à retirer de l'écran.
- **Non couvert** : le Commercial (hors comptoir) qui saisit `planned` pour
  aujourd'hui sur un plan ouvert suit maintenant « pros » — au lieu de l'ancien
  interrupteur unique ; les abonnements ne passent pas par `OrderDrafting` et
  n'ont pas été ouverts.

### Le bâti de L5 (2026-11-02)

- **La révision se sépare sur `supply`** : `OrderRevising.quote` remplace,
  pour une `shelf`, `ensureDayOpen`, le premier jour commandable et
  `ensureBeforeCutoff` par les gardes du circuit (`ShelfRevising.ensureOpen`,
  `b2b/orders/application/services/shelf-revising.service.ts`) : la porte de
  **qui modifie** (`sameDayDoorOf`, comme la révision d'une `planned`) — le
  réglage de sa clientèle, puis le créneau restant au point (aucun au
  comptoir) — et **la journée, qui doit être aujourd'hui** : une `shelf` d'un
  jour passé ne se modifie plus (`orders.shelf.not_today`).
- **Les verrous** : `ReviseOrderHandler` ne passe ni par `workshops.note` ni
  par `deliveryNotes.followRevision` pour une `shelf` ; `holdDay` devient
  `OrderRevising.holdSupply`, qui prend le verrou du stock OU la journée. Ordre
  réel : la ligne `orders`, puis `ShelfStockLock`.
- **Le reste rejugé sous le verrou** (`ensureShelfRevisionCovered`,
  `orders/domain/services/shelf-circuit.ts`) : le reste lu compte déjà la
  commande ; seules les **hausses** (par article et unité, grammes au poids)
  s'y jugent — une baisse ou un article retiré ne se refuse jamais. Le refus
  (`orders.shelf.stock_short`) nomme la quantité ajoutée.
- **Lignes et quantités seulement** : le mode, la journée et le point restent
  refusés par l'agrégat (`ensureShelfKeepsRoute`, L1,
  `orders.revise.shelf_route`).
- **La carte** : refusée par la règle M1 existante
  (`orders.revise.card_settled`) — la limite acceptée.
- **Le verdict des écrans** (`revisabilityOf`) : pour une `shelf`, les gardes
  du circuit au lieu de l'arrêt et de l'heure limite, pour l'équipe aussi. Un
  bloc neuf `shelf_closed` porte la phrase du refus ; le client lit le code
  `too_late` (aucune valeur ajoutée au contrat). La demande de modification
  (M4) l'admet comme un « trop tard » : l'équipe l'applique sous ses gardes.
- E2E (`shelf-order-placement`) : une `shelf` au compte passe de 3 à 9 (reste
  10 → 1), est refusée à 11, redescend à 4 (le stock revient), sans aucune
  ligne `production.order_revision_notice` ; changer la journée est refusé ;
  une `shelf` par carte reste non modifiable.
- **Non couvert à l'e2e** : changer le point ou le mode (couvert par les
  tests unitaires du handler pour le mode, par ceux de L1 pour le point).

### Le bâti de L6 (API) (2026-11-02)

L'écran du comptoir est un lot à part (back-office) ; voici ce que l'API lui
sert.

- **Le raccourci** : `entryShortcut: "immediate_pickup"`, champ facultatif de
  `adminPlaceOrderPayloadSchema` (`staffEntryShortcutSchema`). Accepté
  seulement avec `supply: "shelf"` (`staffSupplyOf`,
  `orders/domain/services/order-supply-rules.ts`) ; sinon
  `orders.shelf.shortcut_off_shelf` (400). Le retrait, la journée
  d'aujourd'hui et le point sont jugés par l'agrégat (L1). Ignoré pour un
  client. Écrit dans `orders.entry_shortcut`.
- **Le règlement pré-rempli** : `CounterCustomerView.settlesOnAccount` lit le
  **payeur** — le principal suivi en `billing` à l'instant, actif et au
  crédit non bloqué ; sinon la société elle-même
  (`get-counter-customer.handler.ts`), comme `accountStanding`.
- **Le catalogue réduit** : aucune route neuve.
  `GET /admin/resupply-receipts/:siteId/:day` (sous `handover_counter:read`)
  rend déjà `stock[]` = `DayShelfStock` (par article et unité, grammes au
  poids, `estimatedStock` = reçu − pris).
- **« Valider et remettre »** : deux appels existants, enchaînés par l'écran —
  `POST /admin/orders`, puis `POST /admin/handover/manual/:orderNumber` (corps
  `{}`). La remise saisie grave `manual` : aucun QR n'a été scanné. Le BL naît
  à la remise et le règlement au compte s'y clôt (après la livraison durable
  du fait de remise : l'écran relit, il ne suppose pas).
- **Le bon remis au client** : route neuve, sans numéro (le vendeur n'a pas
  le droit de lister les BL) —
  `GET /admin/counter/orders/:orderId/delivery-note/client.pdf`, sous
  `handover_counter:read`, PDF `inline`, impression tracée. Elle sert le BL
  **remis** d'un **retrait**, le plus récent s'il y en a plusieurs
  (`counterNoteReach`). Remise attestée au retrait mais BL pas encore écrit
  (fait de remise pas livré) → 404 `delivery_notes.counter.not_yet`, l'écran
  réessaie ; tout autre cas → 404 `delivery_notes.counter.out_of_reach`. La
  route de l'équipe Commandes reste sous `b2b_orders`.
- **La marque** : `supply` (`planned` / `shelf`, `orderSupplySchema`) sur
  `AdminOrderRow` (liste des Commandes) et sur `LateOrder` /
  `ShortfallAwaitingDecision` (Supervision, défaut `planned` à la lecture).
- E2E `counter-immediate-pickup` : la marque et le raccourci posés, la remise,
  le BL « pas encore » avant la livraison du fait de remise, puis imprimé par
  un vendeur qui ne tient que le comptoir, la commande dans
  la facture du mois ; une remise refusée (lien non payé) laisse la commande
  passée, sans BL ; le raccourci sur une programmée refusé ; le BL prévu d'une
  commande fabriquée refusé au vendeur (404), la route Commandes aussi (403).
- **Faux dans le §11.3** : une commande au lien non payé « attend dans la
  file » — non : la file ne montre une commande non réglée à personne
  (`showsInQueue`, [`commande-carte-reglee.md`](../commandes/reglement/commande-carte-reglee.md) §4.4) ; elle y entre à son
  paiement. Au compte, la remise d'une `shelf` n'a pas de refus de règlement.
- **Non fait** : la vue détail `AdminOrderView` ne porte pas `supply` ; le
  point « du comptoir » n'est pas vérifiable au serveur (aucun staff n'a de
  point), le serveur garde « un point, aujourd'hui, en retrait ».

### Le bâti de L6 (écran) (2026-11-02)

- **Le choix du mode, au comptoir** (`acheminement-commande`) : « Retrait
  immédiat » à gauche, puis le groupe « Commande programmée » (Retrait,
  Coursier). Proposé seulement sous `/comptoir`, avec `handover_counter:write`
  et un point ouvert dans la bande (`HandoverQueueStore.activePlace`). Le
  raccourci pose retrait, aujourd'hui, le point de la bande et le créneau en
  cours (`currentSlotOf` : celui qui contient l'heure, sinon le prochain, sinon
  le dernier — le serveur n'en juge aucun au comptoir) ; quitter le raccourci
  rend une programmée pour demain, créneau à rechoisir. Le raccourci n'entre
  pas dans le brouillon conservé.
- **Le catalogue réduit** au reste du point (`GET /admin/resupply-receipts/:siteId/:day`,
  `stock[]`, rapporté à l'unité de vente de l'article — `shelfStockBySku`),
  le reste dit sur chaque rangée ; le panier refuse ce que la vitrine ne
  couvre pas (`shelfShortageOf`), le serveur rejuge sous verrou. Les onglets
  « Ses commandes » et « Ses habitudes » ne sont pas réduits.
- **Le règlement pré-rempli** à l'ouverture, pour toute saisie : au compte si
  `settlesOnAccount`, le lien sinon ; un brouillon repris garde le sien.
- **« Valider et remettre »** : `POST /admin/orders` (`supply: "shelf"`,
  `entryShortcut: "immediate_pickup"`), puis `POST /admin/handover/manual/:orderNumber`,
  puis le bon chiffré (`CounterDeliveryNoteService`, réessai sur
  `delivery_notes.counter.not_yet`, six fois à une seconde). Un refus de
  remise revient au sélecteur du comptoir en « Commande passée, mais pas
  remise » avec la raison du serveur ; une remise réussie y propose
  « Réimprimer le bon ».
- **Le badge « Sur stock »** : liste des Commandes (à côté du numéro),
  Supervision (carte de retrait en retard, lu dans `LateOrder.supply` ;
  carte de manque au colisage).
- **Réglages › Commandes › Jour même** : l'encadré « ne prennent pas encore
  effet » et l'interrupteur `same_day_allowed` sont retirés ; la page ne porte
  plus que la carte du circuit.
- **Non vérifié à l'écran** : l'ouverture du PDF après deux appels attendus
  (un bloqueur de fenêtres peut la retenir — « Réimprimer le bon » la
  rattrape).

### Le bâti de L7 (boutique) (2026-11-02) — partiel

- **« Aujourd'hui » dans le choix du jour** : aucun changement d'écran — le
  sélecteur (`day-picker-dialog`) le montrait déjà dès que `/fulfillment-days`
  sert aujourd'hui, sans heure quand `orderUntil` est `null` ; le choix de la
  maison (`public-house-picker-dialog`) ne garde que les points qui servent le
  jour choisi.
- **La clientèle part toujours** (`ServicePoints.scopeDaysTo`) : elle ne partait
  qu'avec un article d'opération, et le serveur répondait sinon pour le
  **public** — un pro se voyait proposer ou refuser aujourd'hui selon le
  réglage d'une autre clientèle.
- **Le panier mixte** : `CartFulfillmentDays` envoie **tous** les SKU du panier
  (triés, relus quand l'ensemble change, jamais sur une quantité) ; le serveur
  ne propose aujourd'hui qu'aux points dont la vitrine a un reste pour tout le
  panier, et demain sinon. `daysScopedToCart` ne dit toujours que l'opération.
- **Les refus** `orders.shelf.*` et `orders.same_day_closed` : leur message
  serveur se montre tel quel au panier (déjà le cas), et ils relisent les jours
  (`ClientOrders.refuse` → `ServicePoints.refreshDaysNow`).
- **Non bâti, faute de lecteur** : le reste sur la vignette (« plus que 3 »,
  « plus que 1,2 kg ») et l'article grisé pour aujourd'hui. Aucune route
  ouverte au client ne rend le reste par article : `DayShelfStock` n'est servi
  que par `GET /admin/resupply-receipts/:siteId/:day` (staff,
  `handover_counter:read`), et `ShelfTodaySites` ne rend qu'un ensemble de
  points. Il manque un lecteur public du reste d'aujourd'hui **par point et par
  article** (SKU, unité, reste), tenu par la clientèle de l'appelant (réglage
  `sameDayOpenTo`, créneau restant `pickupLeftToday`, articles de son
  catalogue) et vide quand le plan d'aujourd'hui n'est pas arrêté.

### Le bâti de L7b (API) (2026-11-02)

Le lecteur qui manquait à L7 (boutique) : le reste d'aujourd'hui **par point
et par article**, tenu par la clientèle de l'appelant.

- **Deux routes, une query** (`GetShelfStockTodayQuery`,
  `b2b/orders/application/queries/get-shelf-stock-today.*`) :
  - `GET /shelf-stock/today?pickupAddressId=…&audience=pro|public` —
    `@Public()`, throttle 60/min/IP, comme `/fulfillment-days` dont elle
    reprend l'audience annoncée (`public` par défaut). Un anonyme ne
    s'élargit qu'au rayon pro **public** (`pro_anonymous` : ni réservé, ni
    sur mesure) ;
  - `GET /shelf-stock/today/mine?pickupAddressId=…` — murée, la société vient
    de `@ActingCompany()` : porte du circuit par `sameDayDoorOf` (comme la
    passation), catalogue par `CatalogViewers.forCompany`. Aucun paramètre
    d'audience.
- **Contrat** (`packages/contracts/src/shelf-stock-today.ts`) :
  `ShelfStockTodayView = readonly { sku, saleUnit, left }[]` — `left` positif,
  en pièces ou en **grammes** au poids ; `shelfStockTodayPickupSchema` pour le
  paramètre. Ni label de reçu, ni identifiant de reçu, ni commande.
- **Les gardes, dans l'ordre de la passation** (vide à chaque refus, jamais
  une erreur) : plan d'aujourd'hui arrêté (`OrderPlanGate.isClosed`) ; porte
  ouverte et créneau restant au point (`ShelfCircuit.refusalFor`) ; puis le
  reste (`DayShelfStock`) réduit par `shelfLeftFor`
  (`apps/lfd-api/src/b2b/orders/domain/services/shelf-left-today.ts`, pure) aux articles que
  `resolveMany` sert à ce lecteur (`servedToViewer` : sur mesure non
  attribué absent, réservé à d'autres absent), dans **leur unité de vente**,
  reste > 0.
- **Cache** : aucun `Cache-Control` écrit — la réponse dépend de l'appelant,
  le middleware pose `private`.
- **Tests** : unitaires du domaine et du handler (`__tests__/` voisins),
  e2e `apps/lfd-api/test/shelf-stock-today.e2e-spec.ts` (plan non arrêté → vide ; particulier quand seuls
  les pros sont ouverts → vide ; pro anonyme et reconnu voient le reste ;
  sur mesure non attribué absent ; grammes au poids ; plus de créneau public).
- **Reste à L7 (boutique)** : brancher la vignette (« plus que 3 », « plus
  que 1,2 kg ») et l'article grisé sur ces deux routes.
