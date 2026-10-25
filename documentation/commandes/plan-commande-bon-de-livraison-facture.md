# Plan — commande, bon de livraison, facture : trois documents

> 🟡 **Partiellement bâti — état au 2026-10-25.** E1, E2, E4a, E5a, E5b, E6
> (E6a, E6b, E6c1, E6c2) et E6d sont bâtis ; E4b n'a pas été bâti, fondu dans
> E6. Ce qui existe est décrit **au présent** dans la doc d'état
> [`bon-de-livraison.md`](bon-de-livraison.md), qui reprend aussi les
> décisions des plans de lot retirés. **Restent ouverts** : E3 + E7 (le
> reliquat, [`plan-e7-le-reliquat.md`](plan-e7-le-reliquat.md)), E8, E9, et les
> chantiers du § 11 (A1, A2, R1, R2, H1, H2).
>
> **Doc-first, 2026-10-24.** Décision de Hugo le même jour : « fais le modèle
> ERP avant le lancement ». Touche **l'argent**, porte des **migrations de
> données** et finira dans un **runbook** : `vitruve` avant Hugo, puis un plan
> détaillé (et un `vitruve`) **par lot**. Ce document fixe le modèle, les
> invariants et l'ordre ; il ne remplace pas les plans de lot. **Rien n'est
> bâti.**
>
> Il remplace la piste « commande de suite liée » de
> [`modification/plan-commandes-incompletes.md`](modification/plan-commandes-incompletes.md)
> (v1 à v3, contredites trois fois le 2026-10-24) : le reliquat redevient ce
> que Hugo avait dit d'abord, **la suite de la même commande**.

## 0. Pourquoi

Aujourd'hui **la commande sert de bon de livraison** : la facture somme ses
lignes, la date de réception est la sienne, le QR, la fiche de colisage et
l'arrêt de tournée sont les siens. Tant que tout part complet, ça ne se voit
pas. Dès que ce qui part diffère de ce qui est commandé, il n'y a nulle part où
l'écrire — et chaque tentative de le loger dans la commande heurte une règle
juste, posée pour le cas complet.

Les systèmes de gestion séparent trois documents, et ce plan fait de même :

| Document                  | Dit                      | Naît                  | Change                                                  |
| ------------------------- | ------------------------ | --------------------- | ------------------------------------------------------- |
| **Commande**              | ce que le client demande | à la passation        | par avenant (révision), jamais par la réalité du départ |
| **Bon de livraison** (BL) | ce qui part, en une fois | à la fermeture du bac | jamais : un BL partiel est suivi d'un autre BL          |
| **Facture**               | ce qu'on fait payer      | à l'émission          | jamais (avoir)                                          |

## 1. Le modèle

```mermaid
flowchart LR
  C["Commande ORD-1042<br/>12 pains · 6 croissants<br/>(intacte)"]
  BL1["BL-1 · 24/10 matin<br/>12 pains · 4 croissants<br/>reçu le 24/10"]
  BL2["BL-2 · 24/10 après-midi<br/>2 croissants<br/>reçu le 24/10"]
  F["Facture d'octobre<br/>Σ des BL reçus"]
  C -->|"reste à livrer : 2 croissants"| BL2
  C --> BL1
  BL1 --> F
  BL2 --> F
```

**Les invariants**

1. Une commande a **zéro, un ou plusieurs** BL ; un BL appartient à **une**
   commande.
2. Pour chaque ligne : **livré = Σ des quantités des BL**, **reste à livrer =
   commandé − livré**, jamais négatif (la base le tient).
3. Une ligne de BL recopie le **prix unitaire et le taux** de la ligne de
   commande : un reliquat garde les conditions de prix, par construction.
4. **La facture somme des BL**, jamais des commandes. Un BL ne se facture
   qu'une fois.
5. **La date de réception est celle du BL** (le jour où il change de mains).
6. Une commande est **soldée** quand plus rien ne reste à livrer, ou quand le
   reste est **abandonné** par décision (Q-E3) — jamais avant.
7. Une commande complète a **exactement un BL**, identique à ses lignes : le
   cas courant ne change pas de forme, il gagne un document.

## 2. Les termes au panier (décision Q-I2 de Hugo, reprise)

Remise en pourcentage : appliquée **par BL**, à son sous-total. Montants fixes
(remise fixe, port, surtaxe) : portés **entiers par le premier BL**. Un BL de
reliquat n'a ni port ni surtaxe. La TVA se ventile **par BL**
(`invoice-order-split.ts` travaille aujourd'hui par bon : il passe au BL).

## 3. Ce qui bascule, bloc par bloc

Inventaire ouvert le 2026-10-24 (comptes par `grep -l`, hors tests et client
généré) ; chaque plan de lot le **rouvre** fichier par fichier.

| Où                 | Aujourd'hui (ouvert)                                                                                                                                                                                          | Demain                                                                                                                                                    |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Colisage           | une `packing_order` par `(service_day, order_id)` (`packing.prisma`), lignes `packing_line` à la quantité due figée par `packing_list_drawn` ; `seal` exige tout réparti                                      | une **préparation** par BL à venir : clé élargie d'un rang ; `seal` d'une préparation **crée le BL** avec le contenu réel des contenants                  |
| Fait « bac fermé » | `PackingOrderPackedEvent`, clé `packing.order_packed:<orderId>`, sans quantités ; une refermeture après « Rouvrir » est absorbée, un rescan publie `…:reannounced:<instant>` (`production/channels/packing/`) | clé par préparation, **porte les lignes** du BL                                                                                                           |
| Commerce           | `MarkOrderReady` à la fermeture ; `ready` / `fulfilled` sur la commande                                                                                                                                       | le BL est `prêt` puis `remis` ; la commande passe `ready` dès un BL prêt, `fulfilled` quand **soldée**                                                    |
| Retrait            | `handoverToken` unique sur `orders` (11 fichiers le lisent) ; `order_handover` unique par `order_id` (bloc `handover`)                                                                                        | le QR **reste celui de la commande** (Q-E1) ; il remet **le BL prêt** ; la preuve devient par BL                                                          |
| Livraison          | `DeliveryRoundStop.orderId` (nullable, sans unicité vue)                                                                                                                                                      | un arrêt **par BL**                                                                                                                                       |
| Date de réception  | `orders.received_on` + deux CHECK + déclencheur figé ([`la-commande/date-de-reception.md`](la-commande/date-de-reception.md)), 26 fichiers lisent `receivedOn`                                                | `received_on` **sur le BL**, mêmes règles ; la commande la dérive (Q-E2)                                                                                  |
| Facture            | `invoice_order` (pk `(invoice_id, order_id)`, `invoice_order_invoiced_once`) ; 37 fichiers citent `invoice_order` ; la facture relit lignes et totaux de la commande (`frozen-invoice-order.mapper.ts`)       | `invoice_delivery_note` (pk `(invoice_id, delivery_note_id)`, un BL facturé une fois) ; les lignes et totaux se lisent **sur le BL**, figés à sa création |
| Bon imprimé        | le bon de commande (`order-sheet.ts`)                                                                                                                                                                         | le bon de commande reste ; **le BL a son PDF** (« commandé / livré / reste »)                                                                             |
| Fournil            | compte à produire lu sur les commandes (`plan-filter.ts`, `planWhere`)                                                                                                                                        | inchangé pour la commande ; le **reste à livrer** d'un même jour entre au compte par l'ajout tardif (lot E7)                                              |

## 4. La migration (pré-release)

On est en pré-release (CLAUDE.md § 0, corrigé le 2026-10-04) : un contrat peut
casser dans le même déploiement. Ce qui reste vrai : **aucune donnée détruite**.

- Chaque commande **remise** reçoit **un** BL = ses lignes, sa `received_on`,
  ses totaux ; chaque ligne `invoice_order` reçoit sa ligne
  `invoice_delivery_note` vers ce BL. Une facture émise **recalculée sur ses
  BL rend le même centime** : la migration le **vérifie** et échoue sinon.
- Les colonnes de la commande (`received_on`, `handed_over_at`…) restent en
  base, mortes, jusqu'à un ordre de Hugo (CLAUDE.md § 0 : « une colonne morte
  reste en base »).

## 5. Lots, dans l'ordre

Chaque lot a son plan détaillé et son `vitruve` avant d'être bâti.

| Lot | Contenu                                                                                                                                                                                                                                                                                                                | Pourquoi à ce rang                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| E1  | ✅ bâti le 2026-10-24 (`5b49793db`) — **né à l'arrêt du plan, pas à la fermeture du bac** (idée de Hugo, 2026-10-24). Le BL : tables, agrégat, invariants 1–3 et 7 ; **créé à la fermeture du bac** pour toute commande, en ombre (personne ne le lit)                                                                 | le document existe avant qu'on s'y appuie |
| E2  | ✅ bâti le 2026-10-24 (`f17c4d7c5`) — devenu « le BL suit la commande » + un réconciliateur. Rattrapage : un BL par commande déjà remise                                                                                                                                                                               | E3 doit trouver un BL partout             |
| E3  | 🟧 prévu, repris dans E7.3 ([`plan-e7-le-reliquat.md`](plan-e7-le-reliquat.md)) ; la date de réception est recopiée sur le BL depuis E2. La date de réception sur le BL ; le retrait et la livraison remettent le BL                                                                                                   | la facture date des BL                    |
| E4  | 🟡 E4a bâti le 2026-10-24 (`111537375`) ; E4b non bâti — la facture lit les montants facturables de la commande (E6c2). **La facture lit les BL** ; `invoice_delivery_note` ; migration des factures émises avec contrôle au centime                                                                                   | le cœur de l'argent, seul dans son lot    |
| E5  | 🟡 E5a (`219eac683`) et E5b (`473093bdf`) bâtis le 2026-10-24 ; « commandé / livré / reste » reste à faire. Le PDF du BL ; « commandé / livré / reste » sur les écrans                                                                                                                                                 | le client voit ce qui part                |
| E6  | ✅ bâti le 2026-10-25 : E6a `f934db449`, E6b + E6c1 `05b74b7f6`, E6c2 `58fb48d9e`, E6d `c95188d91` — reste « abandonné » seulement. Le manque : signaler au colisage, décider (permission), BL partiel, reste à livrer — décisions de [`modification/commandes-incompletes.md`](modification/commandes-incompletes.md) | le premier BL partiel                     |
| E7  | 🟧 prévu. Le reliquat : seconde préparation (même jour : ajout tardif au fournil et au colisage), BL-2                                                                                                                                                                                                                 | le second BL                              |
| E8  | 🟧 prévu. Solder : abandonner un reste par décision ; commande `fulfilled` quand soldée                                                                                                                                                                                                                                | ferme le cycle                            |
| E9  | 🟧 prévu. Particulier payé par carte : rembourser un reste abandonné (attend M2)                                                                                                                                                                                                                                       | l'argent rendu                            |

## 6. Questions pour Hugo

- **Q-E1.** Le QR reste **celui de la commande** (le client garde un seul QR ;
  le comptoir remet le BL prêt) — proposé — ou un QR par BL ?
- **Q-E2.** « Reçue le » d'une commande en plusieurs BL : la date du
  **dernier** BL (proposé : la commande est reçue quand elle est soldée) ?
- **Q-E3.** Abandonner un reste à livrer : même permission que la décision de
  départ incomplet (proposé) ?
- **Q-E4.** Le numéro du BL : `BL-1042-1`, `BL-1042-2` (proposé : lisible avec
  la commande) ?

## 7. Contradiction de `vitruve` (2026-10-24) — l'emporte sur les § 1 à § 5

Le modèle tient ; il manquait des règles. Corrigées ici, chacune devient une
règle du modèle et non un détail de lot.

**BLOQUANT 1 — une commande remise sans être passée au colisage.**
`handoverBlocker` (`handover/domain/services/handover.ts`) ne refuse que
`cancelled`, `draft`, déjà retirée, non réglée, retenue qualité : une commande
`placed` jamais mise au bac se remet aujourd'hui. **Règle** : si on remet une
commande qui n'a **aucun BL préparé**, le retrait **crée un BL plein** (toutes
les lignes restant à livrer) dans la même unité de travail. Le colisage n'est
pas la seule naissance d'un BL ; il est la seule naissance d'un BL **partiel**.
Q-E5 : ce cas doit-il rester permis ?

**BLOQUANT 2 — rouvrir un bac.** **Règle** : un BL a deux états, **préparé**
puis **remis**. Préparé, il appartient à sa préparation : « Rouvrir » l'**annule**
(il reste en base, annulé, jamais supprimé) et la refermeture en crée un neuf,
au contenu du moment. Remis, il ne change plus jamais. Le BL est clé par
**préparation** : un rescan ou une réannonce de la même préparation ne crée
rien (idempotent), et le fait « bac fermé » porte l'identifiant de la
préparation et ses lignes.

**BLOQUANT 3 — la facture carte et l'ordre des bascules.** Une commande carte
est encaissée en entier à la passation. **Règle** : la facture carte (380)
s'émet quand la commande est **soldée**, et somme ses BL ; un reste abandonné
se rembourse (E9). L'invariant « un BL ne se facture qu'une fois » se tient
par la même table pour la carte et le mensuel. **Ordre** : E3 pose la date et
le retrait sur le BL **et continue d'écrire** `orders.handed_over_at` /
`received_on` (au **premier** BL remis, que le déclencheur figé tient déjà) ;
E4 bascule **ensemble** tous les lecteurs de la facture, du relevé, du
prélèvement, du dossier et de la procédure (`monthly-invoicing.ts`,
`card-invoicing.ts`, `collection-procedure-invoices.ts`,
`invoice-dossier-history*.ts`, `prisma-procedure-orders.reader.ts`, et ce que
le plan d'E4 recomptera). Aucun état intermédiaire ne laisse une commande
reçue invisible.

**SÉRIEUX, corrigés :**

- **« Reçue le » de la commande** : en base, la colonne de la commande garde
  le **premier** BL remis (compatibilité, figée) jusqu'à sa mort après E4 ;
  à l'écran, une commande soldée affiche la date de son **dernier** BL,
  dérivée. Q-E2 tranche l'affichage, pas la colonne.
- **Le retrait par BL** est le cœur d'E3 : `order_handover` (unique par
  commande), le refus « déjà retirée » et les preuves à la porte
  (`handover-attestation.service.ts`, `handover-proof-exhibit.ts`,
  `prisma-handover-proof.reader.ts`) passent au BL.
- **L'argent sur plusieurs BL — règle d'allocation, pas de recalcul.** Les
  termes du panier (remises, port, surtaxe) restent **calculés une fois sur la
  commande**, comme aujourd'hui, puis **alloués** aux BL : les montants fixes
  au premier BL ; une remise en pourcentage au prorata du sous-total livré,
  par la méthode du plus fort reste. Conséquence vérifiable : **pour une
  commande entièrement livrée, Σ des BL = la commande, au centime**, quel que
  soit le nombre de BL. Pour un reste abandonné, la remise en pourcentage
  suit le livré. La TVA se ventile par BL à partir de ces montants alloués.
  Le contrôle « même centime » de la migration vaut alors pour toute commande,
  pas seulement les commandes à un BL.
- **Livraison** : passer à un arrêt par BL migre les tournées existantes —
  ajouté à E3.
- **Point de non-retour** : après E4, des factures sont émises sur des BL ;
  revenir à `invoice_order` demanderait de réécrire des pièces émises. E4 se
  déploie seul, après une relecture `lecteur-de-migrations`, et Hugo le sait.

**Non vérifié par `vitruve`, à rouvrir au plan de lot** : les comptes du § 3
(son grep a échoué sous zsh), `invoice-order-split.ts`,
`frozen-invoice-order.mapper.ts`, Factur-X, `order-sheet.ts`, la création des
commandes du comptoir et à 0 €, l'unicité SQL des arrêts.

## 8. Questions pour Hugo (s'ajoutent au § 6)

- **Q-E5.** Remettre une commande jamais passée au colisage (le retrait crée
  alors un BL plein) : à garder (proposé, c'est le comportement d'aujourd'hui)
  ou à interdire ?

## 9. Décisions de Hugo (2026-10-24)

- **Q-E1 — oui** : le QR reste celui de la commande ; le comptoir remet le BL
  prêt.
- **Q-E2 — oui** : une commande soldée affiche « Reçue le » à la date de son
  dernier BL (dérivée ; la colonne de la commande garde le premier, § 7).
- **Q-E3 — oui** : abandonner un reste à livrer demande la même permission que
  décider d'un départ incomplet.
- **Q-E4 — oui** : les BL se numérotent `BL-1042-1`, `BL-1042-2`.
- **Q-E5 — oui** : une commande remise sans être passée au colisage reçoit un BL plein au retrait.
- Les lots E1, E2, E4a, E4b, E5a, E6 et E6d ont eu leur plan, retiré le
  2026-10-25 : leurs décisions (Q-E1-1, Q-E6-1 à Q-E6-3, les choix de
  l'assistant) sont au tableau « Les décisions » de
  [`bon-de-livraison.md`](bon-de-livraison.md).
- Programme E7 : [`plan-e7-le-reliquat.md`](plan-e7-le-reliquat.md) — le reliquat, un cycle de vie par BL (choix A de Hugo, 2026-10-25).
- Lot T : [`plan-t-commandes-de-test-par-le-vrai-chemin.md`](plan-t-commandes-de-test-par-le-vrai-chemin.md) — les commandes de test passent par le vrai chemin.
- E5b bâti le 2026-10-24 : « confirmation de commande » dans les libellés (`473093bdf`).

## 10. BL chiffré ou non chiffré (Hugo, 2026-10-24)

« On doit avoir la logique chiffré / non chiffré selon le BL. » Puis : « on ne
le règle pas : c'est colisage / livraison non chiffré, client service
facturation chiffré. »

**Ce n'est pas un réglage : c'est le lecteur qui décide.**

| Qui lit le BL                                                                                   | Rendu                                   |
| ----------------------------------------------------------------------------------------------- | --------------------------------------- |
| le colisage, le livreur, la personne qui réceptionne (le papier qui voyage avec la marchandise) | **non chiffré** : articles et quantités |
| le client dans son espace, son service facturation, la comptabilité                             | **chiffré** : prix, totaux              |

- **Un choix de rendu, jamais de données** : le BL porte toujours ses prix en
  base (E1 les recopie), parce que la facture se calcule sur eux (E4). Les deux
  rendus sont **le même BL**.
- **Où il s'applique** : lot E5 (le PDF du BL et ses écrans) ; la facture
  reste toujours chiffrée.
- **Au 2026-10-24, rien n'existait** — bâti depuis par E5a, cf. [`bon-de-livraison.md`](bon-de-livraison.md) (recherché le 2026-10-24 : aucune notion de
  ce genre dans `apps/lfd-api/src`, `packages/`, `documentation/`).

**La forme : celle du bon de commande, sans en inventer une** (Hugo,
2026-10-24 : « on a déjà cette logique sur le bon de commande, dont tu dois
t'inspirer »). [`bon-et-pieces/architecture-bon-de-commande.md`](bon-et-pieces/architecture-bon-de-commande.md)
§ 1 sépare deux axes, **l'audience** (qui lit : décide ce qu'il y a dedans) et
**le format** (texte, PDF, courriel : décide comment c'est rendu), et garantit
qu'aucun prix ne descend au fournil par le **type** : `AtelierSheet` n'a aucun
champ monétaire (union discriminée, pas un `money?`), et il n'y a pas
d'aiguilleur `orderSheetOf(order, audience)`. Le BL suit la même règle, en E5 :

- trois projections serveur nommées sur le modèle de `clientSheetOf` /
  `staffSheetOf` / `atelierSheetOf` : un BL **client** (chiffré, variantes pro
  et public comme le bon), un BL **équipe**, et un BL **de transport** pour le
  colisage, le livreur et la personne qui réceptionne — **sans aucun champ
  monétaire dans son type** ;
- jamais d'option `withPrices` : ce serait une règle d'audience déguisée en
  option de rendu, ce que le bon de commande a déjà écarté.

⚠️ `architecture-bon-de-commande.md` affirme qu'« il n'existe pas de bon de
livraison » : vrai aujourd'hui, faux après E5. Le lot E5 corrige la phrase.

## 11. Après le BL : ce qui manque pour un parcours « au niveau » (Hugo, 2026-10-24)

Évaluation faite le 2026-10-24 sur [`parcours-complet.md`](parcours-complet.md)
(relu contre le code le même jour). Le chemin heureux est tenu ; les chemins
d'écart sont pauvres. Hugo : « ajoute-les au plan-cadre dans cet ordre, note
tout ». Chacun aura son plan ; ceux qui touchent l'argent passent par
`vitruve`.

### 11.1 Terminer le BL — lots E1 à E9 (ce document)

La racine du manque, du reliquat et du litige. En cours : E1 en construction
le 2026-10-24.

### 11.2 Les gestes après l'arrêt du plan — lots A1, A2 (argent : `vitruve`)

**Le constat.** Une commande `confirmed` ne s'annule ni ne se modifie plus,
pour personne : `cancellationOf` refuse « inscribed » dès que `status !==
"placed"` (`b2b/orders/domain/services/order-cancellation.ts`), et la révision
M1 refuse une commande inscrite au fournil (`standingBlockOf`,
`order-revisability.ts` ; `noteAtBakery`, `revise-order.handler.ts`). La seule
issue est de rouvrir toute la journée. Un client qui appelle à 7 h pour annuler
n'a pas de réponse. Le plan C7
([`annulation/plan-annulation-apres-production.md`](annulation/plan-annulation-apres-production.md))
ne vise que les particuliers, et n'est pas bâti.

**Ce qu'il faut.**

- **A1 — annuler après l'arrêt, par décision** : un geste de l'équipe, sous
  une permission (même forme que la décision de départ incomplet), tracé
  avec auteur et motif. Conséquences à écrire au plan : le fournil (la
  production déjà faite ne disparaît pas), le colisage (bac à vider), la
  tournée (arrêt retiré), le BL prévu (annulé), l'argent (remboursement carte,
  ligne au compte).
- **A2 — modifier après l'arrêt, par décision** : une révision de l'équipe
  qui contourne la frontière de l'annulation et le guichet `inscribed`, avec
  les mêmes conséquences, et une règle d'argent nommée (les montants fixes du
  panier ne bougent pas, cf. Q-I2).

### 11.3 La réception avec réserve et l'avoir — lots R1, R2 (argent : `vitruve`)

**Le constat.** Le retrait (`handover/`) et la livraison (`delivery/`) n'ont
ni manquant ni réserve à la remise ; il n'existe ni avoir partiel ni litige
(inventaire du 2026-10-24, `commandes-incompletes.md` § 2, G4 reporté par
Hugo le même jour).

**Ce qu'il faut.**

- **R1 — réception avec réserve** : à la remise (comptoir ou porte), déclarer
  par ligne un manquant, un produit abîmé, un refus ; la réserve se porte sur
  le **BL** remis (il ne change pas : la réserve s'y ajoute).
- **R2 — l'avoir** : une réserve acceptée produit un **avoir** (381) sur la
  facture qui porte le BL, ou une déduction avant émission si la facture n'est
  pas encore partie ; Factur-X et le prélèvement suivent.

### 11.4 Nommer la vente hors plan, nettoyer les statuts morts — lots H1, H2

**Le constat.**

- `markReady` admet une commande `placed`, et le retrait la remet sans
  qu'elle soit passée par l'arrêt du plan
  (`b2b/orders/infrastructure/prisma-order.repository.ts`, `markReady` :
  `status notIn [cancelled, draft, fulfilled]` ; `handover/domain/services/handover.ts`,
  `handoverBlocker`). C'est voulu pour le comptoir, mais ce n'est ni nommé
  ni tracé comme une exception.
- `OrderStatus.draft` et `OrderStatus.in_production` existent dans l'énuméré
  (`prisma/schema/public/orders.prisma`) et ne sont écrits par aucun chemin
  (les brouillons vivent dans `order_drafts`).
- Un pro dont le paiement par carte échoue garde une commande `placed` jusqu'au
  balayage à l'arrêt du plan ; un particulier est annulé tout de suite
  (`prisma-order.repository.ts`, abandon). Défendable, jamais écrit comme une
  décision.

**Ce qu'il faut.**

- **H1 — la vente hors plan, nommée** : un chemin explicite (« remise sans
  plan »), tracé au journal, que la Supervision et la facture distinguent ;
  il rejoint la règle Q-E5 (BL plein au retrait).
- **H2 — le nettoyage** : retirer `draft` et `in_production` de l'énuméré
  (migration de valeur d'énuméré : `lecteur-de-migrations`) ; écrire en doc
  d'état la décision sur l'abandon de carte pro, ou l'aligner sur le
  particulier si Hugo le décide.

### 11.5 L'ordre

| Rang | Chantier             | Lots   | Pourquoi à ce rang                                                                                            |
| ---- | -------------------- | ------ | ------------------------------------------------------------------------------------------------------------- |
| 1    | Le BL                | E1–E9  | tous les suivants s'y appuient (une réserve porte sur un BL, une annulation après l'arrêt annule un BL prévu) |
| 2    | Gestes après l'arrêt | A1, A2 | le cas le plus fréquent en vrai : le client qui appelle trop tard                                             |
| 3    | Réserve et avoir     | R1, R2 | indispensable dès les premiers clients pros                                                                   |
| 4    | Hors plan, nettoyage | H1, H2 | petits, mais rendent les états lisibles                                                                       |

### 11.6 Les questions qui viendront (pour mémoire, pas encore posées)

- A1 : qui peut annuler après l'arrêt, et jusqu'à quand (avant le départ ?
  avant la remise ?) ; la production faite est-elle facturée au client ?
- R1 : qui déclare une réserve à la porte (le livreur, le client sur le
  téléphone du livreur ?) ; une réserve sans photo est-elle recevable ?
- R2 : avoir automatique sur réserve acceptée, ou décision de l'équipe ?
- H2 : la carte pro s'aligne-t-elle sur le particulier ?

## 12. Le « bon de commande » devient la « confirmation de commande » (Hugo, 2026-10-24) — lot E5

Dans le commerce entre professionnels, le « bon de commande » est souvent le
document que le **client** envoie à son fournisseur ; le nôtre dit ce que nous
avons **reçu et accepté**. Hugo : « on appellera ça confirmation de
commande ». Les quatre documents, une fois E5 bâti :

| Document                                                | Dit                                             | Naît                               | Lu par                                               |
| ------------------------------------------------------- | ----------------------------------------------- | ---------------------------------- | ---------------------------------------------------- |
| **Confirmation de commande** (l'actuel bon de commande) | ce que le client a demandé ; porte le QR (Q-E1) | à la passation, jointe au courriel | client, équipe                                       |
| **Fiche d'atelier**                                     | ce qu'il faut produire, sans prix               | à l'arrêt du plan                  | fournil                                              |
| **Bon de livraison**                                    | ce qui part, en une fois                        | à la fermeture du bac              | transport (non chiffré) ; client et compta (chiffré) |
| **Facture**                                             | ce qu'on fait payer, Σ des BL reçus             | à l'émission                       | client, comptabilité                                 |

**À faire en E5** : renommer partout les **libellés** (titre du PDF, courriels,
écrans, fichiers téléchargés, textes du recueil de la boutique et du manifeste
des e-mails — `pnpm copy:digest`, `pnpm mail-copy:digest`), et la doc
[`bon-et-pieces/architecture-bon-de-commande.md`](bon-et-pieces/architecture-bon-de-commande.md).
Les **identifiants** du code (`OrderSheet`, `clientSheetOf`…) ne changent pas :
une valeur ou un nom technique n'est pas un libellé (CLAUDE.md § 8). La
confirmation ne sert plus de justificatif de livraison : c'est le BL qu'on
coche à la réception.

## 13. L'ordre révisé par l'assistant (2026-10-24, « tu décides seul »)

E2 pose déjà la date de réception sur le BL : la facture peut lire les BL
**sans** que le retrait se fasse BL par BL. E3 (retrait et livraison par BL)
n'est nécessaire qu'avec un **second** BL, c'est-à-dire le reliquat. Ordre
retenu : E1 ✅ → E2 ✅ → **E4a** (totaux du BL) → **E4b** (la facture lit les
BL) → E5 (PDF du BL, confirmation de commande) → E6 (le manque) → **E3 + E7**
ensemble (retrait par BL et reliquat) → E8 → E9.

**Ordre révisé une seconde fois (2026-10-24)** : E1 ✅ → E2 ✅ → E4a ✅ → **E5**
(PDF du BL, confirmation de commande) → **lot T** (commandes de test par le
vrai chemin) → **E6 + E4b** (le premier BL partiel et la facture qui le lit)
→ E3 + E7 → E8 → E9.
