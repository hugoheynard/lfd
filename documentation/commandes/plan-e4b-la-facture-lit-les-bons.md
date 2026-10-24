# Plan E4b — la facture lit les bons de livraison

> **Doc-first, 2026-10-24.** Second temps du lot E4 de
> [`plan-commande-bon-de-livraison-facture.md`](plan-commande-bon-de-livraison-facture.md),
> après [`plan-e4a-totaux-du-bon.md`](plan-e4a-totaux-du-bon.md) (bâti : le BL
> porte les totaux de sa commande, et un contrôle compte les écarts).
> **Le cœur de l'argent** et un **point de non-retour** (§ 7 du cadre) :
> `vitruve` avant le bâti, `lecteur-de-migrations` au bâti, déployé **seul**,
> sur ordre de Hugo. **Rien n'est bâti.**

## 0. Le recensement — qui lit le montant d'une commande pour facturer ou prélever

Ouvert le 2026-10-24 dans `apps/lfd-api/src/b2b/accounting/infrastructure/`
(recherche des champs de montant, de date de réception et de la couture ;
hors tests). Douze fichiers :

| Fichier                                   | Lit sur la commande                                                                            | Sert à                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `frozen-invoice-order.mapper.ts`          | la couture `FROZEN_INVOICE_ORDER_SELECT` : lignes, remises, port, surtaxe, TVA ventilée, total | la forme `FrozenInvoiceOrder` que lisent les quatre suivants |
| `prisma-monthly-invoicing.reader.ts`      | couture + `receivedOn`                                                                         | la facture du mois                                           |
| `prisma-invoice-dossier.reader.ts`        | couture                                                                                        | le dossier de facturation (simulateur, CSV)                  |
| `prisma-card-invoicing.reader.ts`         | couture + `totalCents`, `handedOverAt`, `receivedOn`                                           | la facture carte                                             |
| `prisma-collection-candidates.reader.ts`  | couture + `totalCents`                                                                         | la constitution d'un lot de prélèvement                      |
| `prisma-cycle-orders.reader.ts`           | sous-total, remises, bon, port, surtaxe, TVA, `vatShares`, total                               | le relevé de cycle                                           |
| `prisma-billable-orders.reader.ts`        | `_sum totalCents`                                                                              | les montants facturables par payeur                          |
| `billable-order-criterion.ts`             | `receivedOn`, `totalCents`                                                                     | l'assiette « livré pendant la période », écrite une fois     |
| `prisma-collection-batch.reader.ts`       | `totalCents`                                                                                   | les lignes d'un lot de prélèvement                           |
| `prisma-order-collection.repository.ts`   | `totalCents`                                                                                   | l'encaissement par commande                                  |
| `prisma-detached-unpaid.reader.ts`        | `totalCents`                                                                                   | les impayés détachés                                         |
| `prisma-procedure-orders.reader.ts`       | `totalCents`, `handedOverAt`, `receivedOn`                                                     | l'onglet Factures de la procédure                            |
| `prisma-unconfirmed-deliveries.reader.ts` | `totalCents`, `receivedOn`                                                                     | les bons à constater                                         |

Ce tableau est le périmètre d'E4b. Le bâtisseur le **recompte** avant de
commencer (un fichier oublié ici factura d'après la commande pendant que les
autres facturent d'après le BL) et lit aussi les services du domaine qui
reçoivent ces formes (`invoice-order-consistency.ts`, `invoice-lines.ts`,
`invoice-order-split.ts`, Factur-X).

## 1. Le principe : une commande se facture par ses BL reçus

- **L'unité facturée devient le BL**, et la date qui range un BL dans une
  facture est **sa** `received_on` (posée par E2, égale à celle de la
  commande tant qu'il n'y a qu'un BL).
- **Un BL ne se facture qu'une fois** : table `invoice_delivery_note`
  (`invoice_id`, `delivery_note_id`), unique par BL pour une 380 — le pendant
  de `invoice_order_invoiced_once`.
- **Les totaux se lisent sur le BL** (colonnes d'E4a), par **une** couture
  neuve qui rend la même forme `FrozenInvoiceOrder` : le calcul de la facture
  (lignes, ventilation, Factur-X) ne change pas.
- **La référence** imprimée reste le numéro de commande, et le numéro de BL
  s'y ajoute sur la ligne du bon (proposition du plan d'E4a, § 4, retenue
  par l'assistant le 2026-10-24) : rien ne disparaît de ce qu'un client lit.

## 2. Le passage, sans état intermédiaire

1. **Pré-condition, vérifiée et non supposée** : le contrôle d'E4a rend
   **zéro écart** en production, et tout BL vivant d'une commande facturable
   a son en-tête. Sinon E4b ne part pas.
2. **Une migration** crée `invoice_delivery_note` et y écrit, pour chaque
   ligne `invoice_order`, la ligne vers le BL-1 de la commande ; elle échoue
   si une commande facturée n'a pas exactement un BL vivant remis.
3. **Tous les lecteurs du § 0 basculent dans le même déploiement**, vers le
   BL. `invoice_order` reste en base, alimentée en parallèle pour une
   version (lecture d'un retour arrière éventuel), puis morte.
4. **Le contrôle au centime** : la migration recalcule chaque facture émise
   sur ses BL et la compare à ce qui a été émis (total, TVA par taux). Un
   seul écart et elle échoue.

## 3. Points ouverts, à trancher dans ce plan avant `vitruve`

- **Q-E4b-1 — la facture carte.** Le cadre (§ 7) dit « émise quand la commande
  est soldée ». Tant qu'il n'y a qu'un BL, soldée = remise : rien ne change.
  Proposé : la règle « soldée » n'est écrite qu'en E8 ; E4b garde « remise ».
- **Q-E4b-2 — `discountAdjustment`, `deliveryFeeAdjustment`** : non recopiés
  par E4a. Le bâtisseur cherche s'ils sont lus pour facturer ; s'ils le sont,
  E4b les ajoute au BL avant de basculer.
- **Q-E4b-3 — l'encaissement par commande** (`prisma-order-collection.repository.ts`,
  impayés détachés) : la dette d'un client se suit-elle par commande ou par
  BL ? Proposé : **par commande** dans E4b (le montant d'une commande à un
  BL = celui du BL), par BL en E6 quand un BL partiel existe.

## 4. Tests

Contrat : pour chaque lecteur du § 0, un test qui prouve qu'il lit le BL (un
BL dont un total diffère volontairement de la commande en base de test —
écrit par SQL, puisque le domaine l'interdit — et le lecteur rend celui du
BL). E2E : facture du mois, facture carte, relevé, lot de prélèvement, dossier
sur le scénario de démonstration, identiques au centime avant et après.

## 5. Contradiction de `vitruve` (2026-10-24) et changement de stratégie — l'emporte sur les § 1 à § 4

**Ce que `vitruve` a montré.** Faire du BL l'unité de facturation touche bien
plus que le § 0 : neuf lecteurs de `invoice_order` oubliés
(`prisma-invoice.repository.ts`, `prisma-order-invoices.reader.ts`,
`prisma-company-invoices.reader.ts`, `prisma-order-engagement.reader.ts`,
`prisma-invoice-settlement-facts.reader.ts`, `prisma-monthly-invoices.reader.ts`,
`prisma-closure-batches.reader.ts`, `cycle-order-membership.ts`, le port
`order-invoicing-lock.ts`) ; un contrôle « au centime » sans mécanisme (une
facture émise est **figée** — `invoice.lines`, `vat_breakdown`, totaux,
déclencheur `invoice_immutable`, Factur-X archivé par `document_sha256` — et
une migration SQL ne sait pas rejouer le calcul TypeScript) ; les avoirs
(381) qui partagent `invoice_order` ; les relevés et lots déjà émis clés par
commande (`billing_statement_order`, `order_collection`,
`collection_batch_line*`) ; une fenêtre où l'ancien code émettrait sans la
table neuve.

**Décidé par l'assistant (2026-10-24, « tu décides seul »), en suivant la
règle Q-E2 de Hugo (« Reçue le » = le dernier BL) : la commande reste
l'unité de facturation.**

- **Une commande se facture une seule fois, comme aujourd'hui** :
  `invoice_order`, ses avoirs, les relevés, les lots, l'encaissement par
  commande et le verrou de facturation **ne changent pas**. Aucune pièce émise
  n'est relue ni réécrite ; aucune table neuve.
- **Ce qui change, c'est la source de ses montants** : une commande se
  facture sur la **somme de ses BL remis**, et non plus sur ses lignes
  commandées. Concrètement, la couture `FROZEN_INVOICE_ORDER_SELECT` et les
  lecteurs qui somment `totalCents` lisent les totaux et les lignes **des BL
  remis de la commande** (E4a les porte).
- **Elle devient facturable quand elle est soldée** : son dernier BL est
  remis, ou son reste est abandonné (E8). Sa date de facturation est la
  réception du **dernier** BL. Tant qu'une commande n'a qu'un BL, c'est
  exactement aujourd'hui.
- **Le prix assumé** : un reliquat livré le mois suivant reporte toute la
  commande à la facture du mois suivant. Le cas courant (reliquat le jour
  même) ne change rien.

### 5.1 Pourquoi c'est sûr maintenant

Tant qu'aucun BL partiel n'existe (E6), chaque commande facturable a **un**
BL remis dont les totaux et les lignes **sont** ceux de la commande (recopie
d'E4a ; contrôle d'écarts à zéro). Lire le BL ou la commande rend la même
valeur, au centime, pour chaque lecteur. Il n'y a donc **ni migration de
données, ni point de non-retour** : un retour arrière du code est gratuit.

### 5.2 Le nouveau périmètre

- **Une seule fonction de lecture** côté infrastructure, « les montants
  facturables d'une commande » = fusion de ses BL remis (lignes concaténées,
  totaux sommés, TVA ventilée sommée par taux), rendant la forme
  `FrozenInvoiceOrder` existante. Un BL ⇒ recopie exacte.
- **Les lecteurs qui somment `totalCents`** (billable, collection-batch,
  order-collection, detached-unpaid, procedure-orders, unconfirmed-deliveries,
  cycle-orders) lisent la même fonction. Le bâtisseur **recompte** la liste
  (`grep` des champs de montant dans tout `b2b/accounting`, domaine compris)
  avant de bâtir, et dit pour chacun : bascule, ou lit déjà la couture.
- **Garde-fou** : une commande facturable **sans** BL remis aux totaux posés
  n'est pas facturée sur sa commande en silence — elle est **écartée et
  nommée** (bloqueur d'émission, comme `invoice-issuance-blockers.ts`), et le
  réconciliateur la rattrape.
- **Pré-condition de déploiement** : le contrôle d'E4a rend zéro écart en
  production (comptages du runbook), et le réconciliateur a complété tous les
  BL remis.

### 5.3 Ce qui reste pour plus tard (et pourquoi c'est juste)

- **E6** (BL partiel) : la fusion sommera des BL qui ne sont plus des
  recopies ; la répartition des termes du panier (`allocateOrderTerms`) y
  naîtra. La facture n'aura rien à changer : elle lit déjà la fusion.
- **E8** : « soldée » avec reste abandonné.
- **La facture carte** (Q-E4b-1) : inchangée, émise à la remise du dernier
  BL — identique tant qu'il n'y en a qu'un.
- Q-E4b-2 (`discountAdjustment`, `deliveryFeeAdjustment`) : `vitruve` ne les a
  trouvés lus nulle part dans `b2b/accounting` ; non recopiés, et la fusion ne
  les lit pas. Q-E4b-3 : par commande, comme aujourd'hui.

## 6. Seconde contradiction (2026-10-24) — E4b est reporté et fusionné avec E6

`vitruve` (seconde lecture) : la fusion des BL n'est pas « au centime » tant
que `delivery_note_line.pickup_discount_eligible` peut être `NULL` (le
domaine lit `?? true` : `invoice-lines.ts:61`, `invoice-order-split.ts:73`) ;
« facturable quand soldée » n'a aucun mécanisme dans `billableOrderWhere`
(`orders.received_on` posée à la première remise et figée ; un `max` des BL
n'est pas exprimable dans un `where` Prisma) ; huit lecteurs somment
`totalCents` en base (`groupBy … _sum`, `totalCents > 0`) et seraient à
réécrire en profondeur ; la fusion resterait hybride (`lateFeeAdjustment`,
`createdAt`, `requestedDeliveryDate` sur la commande ; `vatShares` `null` d'un
BL).

**Décidé par l'assistant (2026-10-24) : E4b n'est pas bâti maintenant.**
Tant qu'aucun BL partiel n'existe, chaque BL est la recopie de sa commande :
basculer la facture n'apporte rien et ajoute ces risques. E4b est **fusionné
avec E6** (le premier BL partiel), seul moment où la facture doit lire autre
chose que la commande, et se concevra sur ce cas réel. Deux pistes, à
trancher alors : une **colonne de montant livré tenue sur la commande** (les
treize lecteurs gardent leur forme SQL) ou des **sommes sur les BL**. E4a
reste : les BL portent leurs totaux et le contrôle d'écarts tourne.
