# La date de réception d'une commande — plan (doc-first, 2026-10-24)

> **État (2026-10-24, soir) : premier temps (B1 + B2) bâti, non commité** —
> voir §6 et §7. Deuxième temps (reprise, §8) écrit, ni bâti ni lancé.
> Troisième temps (B4) : rien.
>
> Décision de Hugo du 2026-10-24 : la « date
> de réception » — le jour de Paris où la marchandise change de mains, livrée
> à la porte OU retirée au comptoir — est un modèle sans bricolage. Ce plan
> prolonge le lot ZL de
> [`../comptabilite/facturation/plan-zero-faille.md`](../comptabilite/facturation/plan-zero-faille.md)
> (§11–§12), qui a introduit `orders.delivered_on`.
>
> Toute affirmation sur l'existant porte son fichier et a été **ouverte le
> 2026-10-24**. Chemins relatifs à `apps/lfd-api/` sauf mention.

**Le constat qui l'ouvre** : en dev, 21 commandes remises n'avaient pas
`delivered_on` (remises avant ZL, jamais reprises). Elles ne sont dans aucune
assiette de facture — en silence — et l'onglet Factures les affichait « à
confirmer ». La cause n'est pas un oubli de reprise : c'est que le modèle
**permet** une remise sans date. Ce plan rend cet état inexprimable.

---

## 0. Ce qui existe

### 0.1 Où vit la remise

Il y a **deux** attestations, dans deux blocs :

| Où                                              | Bloc       | Écrite par                                                                                                                                    |
| ----------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `production.order_handover` (`orderId @unique`) | `handover` | l'attestation au comptoir / à la porte (`src/handover/infrastructure/prisma-order-handover.repository.ts`) — **la vérité**                    |
| `orders.handed_over_at` / `_by` / `_via`        | `b2b`      | `PrismaOrderRepository.markFulfilled` (`src/b2b/orders/infrastructure/prisma-order.repository.ts:336-356`) — **une copie**, posée sur le fait |

Modèle : `prisma/schema/production.prisma:201-216` (`orderId @unique` l. 206 —
**une seule remise par commande**, la « première remise » est donc LA
remise) ; `prisma/schema/public/orders.prisma:335` (`handedOverAt DateTime?`).

La copie côté commerce est posée par l'abonné durable `OnOrderHandedOver`
(`src/b2b/orders/application/handlers/on-order-handed-over.handler.ts:41`,
abonné `b2b.orders.mark-fulfilled`) → `MarkOrderFulfilledHandler`
(`src/b2b/orders/application/commands/mark-order-fulfilled.handler.ts:65-75`),
qui fait `markFulfilled` **et** publie `order.fulfilled` dans une seule unité
de travail. L'écriture est conditionnée : `where handedOverAt: null, status
<> cancelled` (`prisma-order.repository.ts:346`).

### 0.2 Une remise peut-elle être défaite ?

**Non, dans le code de production** (cherché le 2026-10-24) :

- aucune écriture ne remet `orders.handed_over_at` à `NULL` : le seul
  `handedOverAt: null` hors test est la condition du `where` ci-dessus, et une
  lecture du semis (`src/dev/seeding/invoice-handovers.seed.ts:71`) ;
- `order_handover` n'est supprimé que par les outils de dev
  (`src/dev/scenario/purge/production.purge.ts:49`,
  `src/dev/seeding/production.seed.ts:149`) ;
- le **bac ramené** (`src/delivery/application/commands/bring-stop-back.handler.ts`)
  survient AVANT toute remise : un bon ramené n'a pas été remis. La règle du
  jour l'écarte d'ailleurs explicitement (`broughtBackAt === null`,
  `src/b2b/accounting/domain/services/invoice-dossier-history.ts:145`) ;
- l'**annulation** ne défait pas une remise : `markFulfilled` refuse une
  annulée (`prisma-order.repository.ts:346`), et l'annulation d'une commande
  déjà retirée n'est pas couverte par ce plan (voir Q4).

Conséquence : « la date n'est jamais remise à NULL » ne protège aujourd'hui
contre aucun geste existant ; elle protège contre celui qu'on écrirait demain.

### 0.3 Où `delivered_on` est posé

- **Colonne** : `prisma/schema/public/orders.prisma:172` (`deliveredOn DateTime?
@db.Date`), index l. 398. Migration
  `prisma/migrations/20261022180000_la_date_de_livraison_du_bon/migration.sql` :
  colonne nullable, index, déclencheur `orders_delivered_on_frozen` (refuse tout
  changement d'une valeur posée, y compris vers `NULL`, l. 26-42). **Déjà en
  production** : commit `b102bc9dc` sur `origin/main`.
- **Abonné** : `RecordDeliveryDayOnHandover`
  (l'abonné `RecordDeliveryDayOnHandover`, retiré en B4,
  abonné `accounting.record-delivery-day.on-handover`) — un **second** abonné
  durable du même fait `handover.handed_over`, indépendant du premier.
- **Commande** : `RecordOrderDeliveryDayHandler`
  (`src/b2b/accounting/application/commands/record-order-delivery-day.handler.ts:35-48`)
  relit `OrderHandoverHistoryReader` (canal `handover/channels/commerce/`) et
  `OrderDeliveryHistoryReader` (canal `delivery/channels/commerce/`), applique
  `deliveredOnOf`, écrit par `recordFirst`.
- **Écriture** : `PrismaOrderDeliveryDays.recordFirst`
  (`src/b2b/accounting/infrastructure/prisma-order-delivery-days.ts:13-20`),
  `where deliveredOn: null`.

**La règle exacte** — `deliveredOnOf`
(`src/b2b/accounting/domain/services/monthly-invoicing.ts:200-212`) :

1. pas de remise → `null` ;
2. remise **à la porte** (une `order_handover_proof` existe) → le `serviceDay`
   du dernier arrêt parti, clos et non ramené (`deliveringDay`,
   `invoice-dossier-history.ts:142-149`, appelé l. 85) ;
3. sinon, ou si aucun arrêt ne qualifie → **le jour Europe/Paris de
   `handed_over_at`** (`instantToLocal(...).day`).

Ce n'est donc PAS seulement « le jour de Paris de `handed_over_at` » : pour une
remise à la porte, c'est le jour de la tournée. Les deux ne diffèrent que si
la remise est attestée après minuit, ou si l'arrêt est rattaché à un autre jour
(bac relivré). Le pas 3 garantit qu'**une remise donne toujours un jour non
nul** — c'est ce qui rend l'invariant du §1 tenable.

### 0.4 Le point dur, et sa réponse

La consigne pose la question « comment poser la date dans la même transaction
que la remise, si la remise est dans un autre bloc ? ». **En l'ouvrant, la
question se déplace** : l'invariant ne porte pas sur `order_handover`
(bloc `handover`) mais sur la ligne `orders` (bloc `b2b`), et **les deux
colonnes de cette ligne sont déjà dans `b2b`**. Le bricolage n'est pas une
traversée de frontière : c'est que **deux abonnés du même fait** écrivent deux
colonnes de la même ligne, chacun dans sa propre transaction, sans ordre entre
eux (`on-order-handed-over.handler.ts:41`, l'abonné ZL, retiré en B4).
Entre les deux, et pour toujours si le second a échoué ou n'existait pas, la
ligne dit « remise » sans date.

Trois réponses examinées :

| Option                                                                                                 | Verdict                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Un seul écrivain** : `markFulfilled` pose `handed_over_at` ET `received_on` dans le même `UPDATE` | **Retenue.** Aucune frontière nouvelle : `b2b → handover` et `b2b → delivery` sont « port uniquement », et les deux lecteurs de canal existent déjà. Le CHECK du §1 tient en immédiat, sur une seule instruction.                                                    |
| B. Le fait `handover.handed_over` porte le jour (calculé par le bloc `handover`)                       | Plus juste en principe (le jour est décidé là où la remise a lieu), mais déplace la règle dans `handover`, qui devrait lire la livraison (`handover → delivery` permis, port) et change un contrat de fait durable — les faits déjà émis n'ont pas le champ. **Q1.** |
| C. Garder l'abonné séparé + contrainte différée                                                        | Rejetée : une contrainte `DEFERRABLE` porte sur la fin de **transaction**, or les deux abonnés ont chacun la leur. Elle ne tiendrait que par un déclencheur de contrainte qui refuserait… la première des deux écritures. Ce serait refuser la remise elle-même.     |

**Option A en détail.** `MarkOrderFulfilledHandler` (bloc `b2b/orders`) :

1. lit `OrderHandoverHistoryReader.ofOrders([orderId])` et
   `OrderDeliveryHistoryReader.ofOrders([orderId])` — lectures synchrones par
   les canaux déjà déclarés (`src/handover/channels/commerce/order-handover-history.reader.ts:31`) ;
2. applique la règle (déplacée de `accounting` vers `b2b/orders/domain/` sous le
   nom `receivedOnOf` — elle décrit la commande, pas la facture ;
   `accounting` l'importe, même bloc) ;
3. `markFulfilled(reference, at, by, via, receivedOn)` écrit les quatre
   colonnes **et** `received_on` dans le même `updateMany`.

L'abonné `RecordDeliveryDayOnHandover`, sa commande, son port
`OrderDeliveryDays` et son adaptateur disparaissent. ⚠️ Avant le retrait,
vérifier que la boîte d'envoi ne porte plus de livraison en attente pour
l'abonné `accounting.record-delivery-day.on-handover` (§3, B3).

Ce que l'option A ne règle pas : la lecture des arrêts se fait **hors** de la
transaction du retrait (elle l'est déjà aujourd'hui). Si l'abonné passe avant
que l'arrêt soit clos, `deliveringDay` rend `null` et le jour retombe sur le
pas 3 (jour de Paris de la remise). Comportement **identique à l'existant** ;
il n'est pas vérifié ici que l'arrêt est clos avant que le fait parte (Q2).

### 0.5 Les lecteurs de `delivered_on` (grep exhaustif du 2026-10-24)

`git grep -i -E "delivered_on|deliveredOn"` hors migrations : **70 fichiers suivis** (+ 3 non suivis du chantier `procedure-orders`, compte de `vitruve`).

**`orders.delivered_on` (la colonne de la commande)**

| Lecteur                                                                                               | Usage                                                               |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `src/b2b/accounting/infrastructure/billable-order-criterion.ts:70,79`                                 | l'assiette facture / relevé / lot : `deliveredOn` dans `[from, to[` |
| `src/b2b/accounting/infrastructure/cycle-order-membership.ts:159-170`                                 | appartenance d'un bon au cycle                                      |
| `src/b2b/accounting/infrastructure/prisma-monthly-invoicing.reader.ts:45,66`                          | le jour copié sur la ligne de facture                               |
| `src/b2b/accounting/infrastructure/prisma-unconfirmed-deliveries.reader.ts:33`                        | « Bons à constater » : `deliveredOn: null`, jour demandé passé      |
| le lecteur des commandes de procédure (`PrismaProcedureOrdersReader`, non commité, chantier en cours) | statut de l'onglet Factures                                         |
| `src/b2b/accounting/domain/services/collection-procedure-invoices.ts:30,47,57`                        | `procedureOrderStatus`, `deliveryDayMissing`                        |
| `src/b2b/accounting/application/services/procedure-invoices-step.ts:121,133,139`                      | l'étape facture de la procédure                                     |
| `datePastDeliveries` (retiré en B4)                                                                   | reprise de dev par le bus (`datePastDeliveries`)                    |
| `test/factories.ts:249-285` (`markDelivered`, `deliveredOnColumn`) et 13 suites e2e                   | fixtures                                                            |

**`invoice_order.delivered_on` (la copie figée sur la facture)** — colonne
créée par `prisma/migrations/20261008190000_la_facture_emise/migration.sql:92`,
modèle `prisma/schema/public/invoice.prisma:121` :

| Lecteur                                                                                                                                                                                                             | Usage                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/b2b/accounting/infrastructure/invoice.mapper.ts:82,126`                                                                                                                                                        | ligne ↔ entité                                                                                 |
| `src/b2b/accounting/domain/entities/invoice.types.ts:65`, `invoice-shape.ts:58-59`                                                                                                                                  | l'entité `Invoice` et sa validation de date                                                    |
| `src/b2b/accounting/domain/services/facturx-xml.ts:165-171`                                                                                                                                                         | `ActualDeliverySupplyChainEvent` (BT-72) du Factur-X                                           |
| `src/b2b/accounting/domain/services/facturx-mentions.ts:89-91`                                                                                                                                                      | « livré le … » dans les mentions                                                               |
| `src/b2b/accounting/domain/services/invoice-issuance-blockers.ts:166,180`                                                                                                                                           | refus d'émettre un bon sans jour                                                               |
| `src/b2b/accounting/domain/services/invoice-from-dossier.ts`, `monthly-invoice-support.ts:28-61`, `monthly-invoice-issuance.ts:76`, `issued-invoice-view-support.ts:144`, `document-specimens/specimen-data.ts:126` | construction et vue                                                                            |
| `src/b2b/accounting/application/card-invoice-support.ts:138-139`                                                                                                                                                    | ⚠️ facture carte : **recalcule** le jour de Paris de `handedOverAt`, sans la règle de la porte |
| `packages/contracts/src/issued-invoices.ts:100`                                                                                                                                                                     | contrat servi (`deliveredOn`)                                                                  |
| `apps/lfd-backoffice-frontend/src/app/comptabilite/facture-emise/facture-emise-page.html:197-199` (+ spec)                                                                                                          | « livré le … »                                                                                 |
| `apps/lfc-ecommerce-frontend/src/app/client/mes-factures/invoice-dialog/invoice-dialog.html:123` (+ fixture)                                                                                                        | côté client                                                                                    |

**Docs** : `documentation/b2b/architecture-facturation.md`,
`documentation/comptabilite/facturation/facture-emise.md` (11 occurrences),
`plan-zero-faille.md` (9), `documentation/comptabilite/prelevement/plan-page-procedure-de-prelevement.md`.

Constat en passant : la facture **carte** (`card-invoice-support.ts:138`) ne lit
pas `orders.delivered_on` et applique une règle différente (pas de jour de
tournée). Avec une colonne non nulle dès la remise, elle peut lire la même
valeur (§2).

---

## 1. Décisions proposées

### D1. Renommer : `delivered_on` → `received_on`, partout

« Livré » ment pour un retrait au comptoir. Pré-release (CLAUDE.md §0,
correction du 2026-10-04) : on casse le contrat dans le même déploiement.

- `orders.delivered_on` → `orders.received_on` ; index et déclencheur renommés
  (`orders_received_on_frozen`).
- `invoice_order.delivered_on` → `invoice_order.received_on`, **sans
  recalcul** : `ALTER TABLE … RENAME COLUMN`, la valeur figée reste celle qui a
  été écrite (une facture émise ne change pas).
- Code : `deliveredOn` → `receivedOn`, `deliveredOnOf` → `receivedOnOf`,
  `deliveryDayMissing` disparaît (§2). Contrat `issued-invoices.ts:100` et les
  deux fronts suivent.
- Les **libellés** ne sont pas tous changés : sur une facture, « livré le »
  reste juste pour une livraison ; pour un retrait, « retiré le » (Q3).
- BT-72 Factur-X garde sa sémantique (« date de livraison effective ») : c'est
  la même valeur, seul le nom interne change.

### D2. L'invariant « remise ⇒ date » refusé en base

```sql
ALTER TABLE "orders" ADD CONSTRAINT "orders_handover_has_received_on"
  CHECK ("handed_over_at" IS NULL OR "received_on" IS NOT NULL);
```

Tenable **parce que** l'option A (§0.4) écrit les deux dans le même `UPDATE`.
Le CHECK est immédiat — inutile de le différer.

Le déclencheur figé est gardé (renommé). Il refuse déjà le retour à `NULL`
(`OLD … IS NOT NULL AND NEW IS DISTINCT FROM OLD`, migration du 2026-10-22,
l. 29-30). Si une remise est un jour défaite (`handed_over_at` remis à `NULL`),
le CHECK l'accepte et la date reste : la marchandise a changé de mains ce
jour-là, et une facture peut déjà la citer.

Le sens inverse (`received_on` sans `handed_over_at`) **reste permis** : les
suites e2e de l'assiette sèment un jour sans remise (`test/factories.ts:268-276`),
et `procedureOrderStatus` en tient compte. Le resserrer est Q5.

### D3. Reprendre l'existant par migration, valeur avant contrainte

Pour toute commande `handed_over_at IS NOT NULL AND received_on IS NULL`, la
migration pose **la règle du §0.3** — pas seulement le jour de Paris :

```sql
UPDATE "orders" o
SET "received_on" = COALESCE(
  -- remise à la porte : le jour de la tournée (dernier arrêt parti, clos, non ramené)
  (SELECT s.service_day FROM <arrêts du bloc delivery> s
    WHERE s.order_id = o.id AND s.departed_at IS NOT NULL
      AND s.closed_at IS NOT NULL AND s.brought_back_at IS NULL
      AND EXISTS (SELECT 1 FROM production.order_handover_proof p WHERE p.order_id = o.id)
    ORDER BY s.placed_at DESC LIMIT 1),
  -- sinon : le jour de Paris de la remise
  (o."handed_over_at" AT TIME ZONE 'Europe/Paris')::date)
WHERE o."handed_over_at" IS NOT NULL AND o."received_on" IS NULL;
```

⚠️ **Non bâti tel quel** : le nom de la table des arrêts et de ses colonnes
n'est pas ouvert ici (`<arrêts du bloc delivery>`) — à lire dans
`prisma/schema/delivery*` au moment de B1. Et cette requête traverse
`public × delivery × production` : `lint:cross-schema-join` lit-il les
`migration.sql` ? Non vérifié (Q6). L'alternative honnête est la **reprise
par le bus** qui existe déjà en dev (`datePastDeliveries`,
`invoice-handovers.seed.ts:104-113`), lancée en production par un script
d'exploitation AVANT la migration de contrainte — la règle n'est alors écrite
qu'une fois, en TypeScript.

**Ce que la migration fait aux lignes existantes** : n'écrit QUE des lignes où
`received_on` est `NULL` — le déclencheur figé ne mord donc jamais ; aucune
facture, aucun lot touché. En production : les commandes remises entre
l'ouverture et le déploiement de ZL (`b102bc9dc`), plus toute remise dont
l'abonné a échoué depuis.

**Requêtes de contrôle (pour le runbook)**

Avant :

```sql
-- 1. combien, et lesquelles
SELECT count(*) FROM orders WHERE handed_over_at IS NOT NULL AND received_on IS NULL;
SELECT order_number, handed_over_at, (handed_over_at AT TIME ZONE 'Europe/Paris')::date AS jour_paris
  FROM orders WHERE handed_over_at IS NOT NULL AND received_on IS NULL ORDER BY handed_over_at;
-- 2. parmi elles, celles déjà sur une facture (date figée sur la ligne de facture, à NULL)
SELECT o.order_number FROM orders o JOIN invoice_order io ON io.order_id = o.id
  WHERE o.handed_over_at IS NOT NULL AND o.received_on IS NULL;
-- 3. instantané de comparaison
CREATE TEMP TABLE avant AS SELECT id, received_on FROM orders;
```

Après :

```sql
-- 1. doit rendre 0
SELECT count(*) FROM orders WHERE handed_over_at IS NOT NULL AND received_on IS NULL;
-- 2. aucune date déjà posée n'a bougé — doit rendre 0
SELECT count(*) FROM orders o JOIN avant a USING (id)
  WHERE a.received_on IS NOT NULL AND o.received_on IS DISTINCT FROM a.received_on;
-- 3. écart à la règle simple (attendu : seulement des remises à la porte)
SELECT order_number FROM orders
  WHERE handed_over_at IS NOT NULL AND received_on <> (handed_over_at AT TIME ZONE 'Europe/Paris')::date;
```

⚠️ Une commande reprise peut tomber dans une **période déjà close** : son jour
est en septembre, la facture de septembre est émise. L'assiette la prendra à
la facture suivante (Q-L2 de ZL, `billable-order-criterion.ts:40-46`). C'est
voulu, mais une phrase du runbook doit le dire avant que la comptabilité le
découvre.

---

## 2. Ce qui change pour la facture, le lot, l'onglet Factures

- **Assiette** (`billable-order-criterion.ts`) : renommage seul. Elle ne perd
  plus de bon en silence : une remise a toujours son jour.
- **« Bons à constater »** (`prisma-unconfirmed-deliveries.reader.ts:33`) :
  inchangé en sens — `received_on IS NULL` équivaut désormais à « pas remis ».
- **Onglet Factures** (`collection-procedure-invoices.ts`) : `procedureOrderStatus`
  garde ses trois statuts ; « Réception confirmée » devient exactement
  `received_on IS NOT NULL`. `deliveryDayMissing` (l. 53-58) **disparaît** :
  l'état qu'elle nomme est refusé par le CHECK. Le champ `handedOver` des faits
  peut tomber (Q5).
- **Facture carte** (`card-invoice-support.ts:138-139`) : lit `received_on` au
  lieu de recalculer — une remise à la porte y prend enfin le jour de la tournée.
- **Factures déjà émises** : `invoice_order.received_on` renommé, jamais
  recalculé. Une ligne émise avant ZL garde `NULL` et ses mentions sans date
  (`facturx-mentions.ts:89`) ; la facture l'emporte toujours dans l'onglet
  (`collection-procedure-invoices.ts:44-46`).

## 3. Lots, ordre des migrations, retour arrière

| Lot | Contenu                                                                                                                                                                                                                            | Migration                                                                                              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| B1  | Renommage `delivered_on` → `received_on` (deux tables, index, déclencheur, fonction), code, contrat, fronts, docs.                                                                                                                 | `…_la_date_de_reception` : `RENAME COLUMN` ×2, `ALTER INDEX … RENAME`, déclencheur recréé sous son nom |
| B2  | Un seul écrivain : `markFulfilled` pose `received_on` ; règle déplacée dans `b2b/orders/domain/` ; facture carte lit la colonne. L'abonné ZL reste branché mais n'écrit plus rien (le `where received_on IS NULL` le rend inerte). | aucune                                                                                                 |
| B3  | Reprise de l'existant (§1 D3, migration ou script — Q6), PUIS contrôles « après ».                                                                                                                                                 | `…_reprise_de_la_date_de_reception` (si migration)                                                     |
| B4  | CHECK `orders_handover_has_received_on`. Retrait de l'abonné, de sa commande, du port `OrderDeliveryDays`, de `deliveryDayMissing`, de `datePastDeliveries`, après contrôle de la boîte d'envoi.                                   | `…_la_reception_suit_la_remise`                                                                        |

**Valeur avant contrainte** : B2 avant B3 (plus aucune remise neuve sans date),
B3 avant B4 (plus aucune ligne existante qui violerait le CHECK). B2→B4 peut
partir dans un seul déploiement si les migrations sont dans cet ordre, mais
B2 doit être **déployé** avant que la reprise de B3 ne coure, sinon une remise
qui tombe entre les deux échappe à la reprise et fait échouer B4 — ce qui est
le comportement voulu (la migration échoue bruyamment, rien n'est perdu).

**Fixtures à adapter en B4** : `test/delivery-en-route.e2e-spec.ts:144` pose
`handedOverAt` seul — violerait le CHECK. `test/factories.ts:handOver` (l. 245-260)
écrit `order_handover` puis `received_on` sans `handed_over_at` : compatible.

**Retour arrière** : B4 — `DROP CONSTRAINT`, rebrancher l'abonné ; B3 — ne se
défait pas (le déclencheur figé l'interdit, et c'est voulu : la valeur est
vraie) ; B1 — `RENAME COLUMN` inverse, tant que le contrat front n'a pas été
déployé seul.

## 4. Questions pour Hugo

- **Q1.** Option A (le commerce calcule le jour à la copie de la remise) ou
  option B (le fait de retrait porte le jour, décidé dans le bloc `handover`) ?
  A est plus petit ; B met la règle là où la remise a lieu.
- **Q2.** À la porte, l'arrêt est-il clos AVANT que le fait de retrait ne parte ?
  Sinon le jour retombe sur le jour de Paris de l'attestation — vrai dans 99 %
  des cas, faux pour une attestation passée minuit.
- **Q3.** Libellés : « livré le » partout, ou « retiré le » pour un retrait au
  comptoir (facture, Factur-X en note, écran client) ?
- **Q4.** Une commande retirée peut-elle être annulée ensuite (avoir) ? Si oui,
  sa date de réception reste — c'est ce que le plan suppose.
- **Q5.** Resserrer aussi le sens inverse (`received_on` ⇒ `handed_over_at`) ?
  Il faudrait réécrire les fixtures e2e qui sèment un jour sans remise.
- **Q6.** La reprise en production : migration SQL (règle écrite deux fois,
  jointure inter-schémas dans un `migration.sql`) ou script d'exploitation par
  le bus avant la migration de contrainte (règle écrite une fois) ?

---

## 5. Contradiction de `vitruve` (2026-10-24) — l'emporte sur les §0 à §3

Confirmé : la règle (§0.3), l'absence de geste qui défait une remise en
production (§0.2), et la faisabilité des frontières. `lint:cross-schema-join`
ne lit que `src/`, pas les migrations, et `lint:prisma-model-ownership`
raisonne par bloc.

### BLOQUANT

1. **L'option A peut rendre `null`.** `receivedOnOf(null, …)` rend `null`
   quand aucune ligne `order_handover` n'est lue (`monthly-invoicing.ts:204-206`).
   Or trois suites lancent `MarkOrderFulfilledCommand` sans en semer :
   `test/card-invoices.e2e-spec.ts:183`, `test/guest-account-claim.e2e-spec.ts:120`
   et `test/loyalty-earning.e2e-spec.ts:142`. **Corrigé** : le dernier repli
   est le jour de Paris de `command.at`, l'instant porté par le fait. Le jour
   n'est donc jamais nul par construction, et la phrase du §0.3 ne vaut qu'avec
   ce repli.
2. **La liste des fixtures de B4 était incomplète.** Il faut ajouter :
   - le test `deliveryDayMissing` de `monthly-invoices` (retiré en B4), qui pose `handedOverAt` seul
     (c'est le test `deliveryDayMissing` du chantier non commité) ;
   - les doubles de `markFulfilled` dans `test/packing-order-packed.e2e-spec.ts:93`
     et `test/production-day-closed.e2e-spec.ts:87`, dont la signature change.

   **Corrigé, avec un préalable** : commiter d'abord le chantier
   `procedure-orders` en cours. B1 ne renomme pas du code que personne n'a relu.

3. **La reprise en SQL du §1 D3 est fausse sur le modèle réel.** Dans
   `src/delivery/infrastructure/prisma-order-delivery-history.reader.ts:29-52` :
   - `departed_at` vit sur la tournée, pas sur l'arrêt ;
   - « ramené » n'est pas une colonne mais une décision `bring_back` ;
   - les filtres `removedAt` et arrêts de commande manquent ;
   - le tri se fait sur `created_at`.

   **Corrigé** : Q6 est tranchée par la contradiction. La reprise se fait par
   un **script d'exploitation par le bus** (la commande de B2, la règle
   TypeScript, écrite une seule fois), jamais par une migration SQL. Les
   requêtes de contrôle « avant / après » restent valables.

4. **« B2→B4 en un seul déploiement » ne marche pas.** `deploy_lfd_api.yml:351`
   lance `migrate deploy` AVANT le basculement. Le CHECK serait donc posé
   pendant que l'ancien code écrit encore des remises sans date, et une
   migration en échec bloque tous les déploiements suivants jusqu'à un
   `migrate resolve` à la main. **Corrigé** : au moins **trois temps**, et le
   runbook le dit :
   1. déployer B1+B2 ;
   2. lancer le script de reprise et les contrôles « après » ;
   3. déployer B4, qui porte le CHECK et retire l'abonné.

### SÉRIEUX

5. **La preuve à la porte s'efface.** `order_handover_proof` est purgée
   (`src/handover/infrastructure/prisma-handover-proof.eraser.ts`). Une reprise
   lancée après effacement prend le jour de Paris au lieu du jour de tournée,
   et aucun contrôle ne le voit. **Assumé et signalé** : la reprise court tôt,
   et les écarts éventuels tombent sur des remises anciennes, déjà hors de la
   fenêtre de purge. Il reste à vérifier, à chaud, si la preuve est écrite
   avant que le fait parte (Q2).
6. **Déplacer la règle emporte plus qu'une fonction.** Elle dépend de
   `orderHistory`, `deliveringDay` et des types `Dossier*Fact`
   (`invoice-dossier-history.ts:17-149`). **Corrigé** : la règle reste dans
   `accounting`, et `orders` l'importe, comme il le fait déjà dans
   `settlement-regime.ts`. B2 doit prouver que `lint:import-cycles` passe.
7. **Une injection DI peut-être circulaire.** `HandoverFeedModule` importe
   `OrdersModule` (`appBootstrap/handover-feed.module.ts:70`), et l'option A y
   ferait consommer en retour `OrderHandoverHistoryReader`. **À prouver** par
   un boot e2e, avant tout le reste de B2.
8. **Retirer l'abonné laisse des lettres mortes.** Une livraison en attente
   pour un abonné retiré passe en lettre morte (`outbox-relay.ts:81-84`). Les
   lettres mortes déjà présentes pour `accounting.record-delivery-day.on-handover`
   sont précisément les commandes sans date. **Corrigé** : la reprise les
   couvre, puis le runbook dit de les acquitter au temps 3.
9. **Le déclencheur après le `RENAME`.** Le corps plpgsql lit
   `OLD.delivered_on` en texte. **Corrigé** : B1 fait un
   `CREATE OR REPLACE FUNCTION` explicite qui lit `received_on`, et son retour
   arrière est symétrique.
10. **Ordre de déploiement front / back.** Les workflows sont séparés par
    application. **Assumé** : on déploie l'API d'abord, puis les deux fronts.
    Le retour arrière de B1 n'est sûr que tant que les fronts ne sont pas partis.

MINEUR, pris en compte :

- le compte de fichiers est corrigé au §0.5 ;
- la facture carte lit la ligne déjà écrite dans la même unité de travail ;
- `test/production-batch.e2e-spec.ts:951` remet `handedOverAt` à `NULL`, ce
  qui reste compatible avec le CHECK.

---

## 6. Décisions de Hugo (2026-10-24) — l'emportent sur les §0 à §5

- **Q1 — option A.** Le commerce calcule le jour à la copie de la remise.
- **Q2 — vérifiée par un test au premier lot** : à la porte, l'arrêt est-il
  clos et la preuve écrite avant que le fait de retrait ne parte ? **Oui**
  (2026-10-24) : `HandoverDoorstepAttestor.attest` écrit l'attestation, son
  fait dans la boîte d'envoi et la preuve, puis `closeStop`, dans UNE unité de
  travail du livreur ; le relais ne livre qu'après validation. Prouvé par
  `apps/lfd-api/test/order-received-on.e2e-spec.ts` (« Q2 ») : la tournée
  roule dans une semaine, la remise est attestée aujourd'hui, et
  `received_on` vaut le jour de la tournée.
- **Q3 — « Reçue le » partout**, un seul mot, livrée ou retirée (écran de la
  facture émise, dialogue client, note Factur-X / PDF ; « réception non
  constatée » pour une ligne sans date).
- **Q4 — la date ne change jamais une fois posée**, même si la commande est
  annulée ensuite. Le déclencheur figé le tient déjà.
- **Q5 — les deux sens** : « remise ⇒ date » ET « date ⇒ remise ». Les deux
  contraintes n'arrivent qu'au **troisième temps** (B4), pas avant ; les
  fixtures qui sèment un jour sans remise (`test/factories.ts`
  `receivedOnColumn`, et les 13 suites qui la lisent) sont à réécrire à B4.
- **Q6 — reprise par script, pas par migration** : c'est le deuxième temps
  (§8).
- **Q6 révisée (Hugo, 2026-10-24) — pour ce seul cas, la migration de B4 date
  elle-même les remises sans date, par la règle simple, AVANT de poser les
  contraintes.** Raisons : éviter d'exporter l'URL de production sur un poste
  pour lancer le script ; il n'en restait qu'UNE en production
  (ORD-MV0Q32ES-0XXX, remise le 2026-10-13 à 12:35Z → 2026-10-13, contrôle
  n° 5 à 0 le même jour) ; B1+B2 est déployé, donc plus aucune remise neuve
  ne part sans date et la liste ne peut pas grandir. Pas de jointure
  inter-schémas : la règle de la porte n'est pas rejouée. Le script du §8 est
  retiré avec B4 (il écrivait par le port `OrderDeliveryDays`, retiré).

## 7. Premier temps (B1 + B2) — ce qui est bâti (2026-10-24, non commité)

**Migration** `apps/lfd-api/prisma/migrations/20261024120000_la_date_de_reception/migration.sql` :
`RENAME COLUMN` sur `orders` et `invoice_order` (aucune valeur recalculée),
`ALTER INDEX … RENAME`, `ALTER TRIGGER … RENAME` et `ALTER FUNCTION … RENAME`,
puis `CREATE OR REPLACE FUNCTION orders_received_on_frozen()` dont le corps lit
`received_on` (objection 9). Aucune ligne écrite, aucun CHECK.

**Un seul écrivain** : `MarkOrderFulfilledHandler` relit
`OrderHandoverHistoryReader` et `OrderDeliveryHistoryReader` (canaux
existants), applique `receivedOnOf` importée de
`b2b/accounting/domain/services/monthly-invoicing.ts` (jamais recopiée),
repli sur le jour de Paris de `command.at` ; `OrderRepository.markFulfilled`
prend `receivedOn` et l'écrit dans le même `updateMany` que `handed_over_at`.
Si l'ancien abonné l'a déjà posée, une seconde instruction pose la remise sans
toucher la colonne : la date figée ne bloque pas la remise (prouvé en e2e).
L'ancien abonné reste branché : son `where received_on IS NULL` le rend inerte
après la remise, et sa valeur, quand il passe avant, est la même règle.

**Facture carte** : `card-invoice-support.ts` lit `CardInvoiceCandidate.receivedOn`
(la colonne) au lieu de recalculer le jour de Paris de `handedOverAt`.

**Contrat** : `IssuedInvoiceOrderView.receivedOn` (`packages/contracts/src/issued-invoices.ts`) ;
`deliveryDayMissing` reste jusqu'à B4.

**Injection** : le boot de `apps/lfd-api/test/order-received-on.e2e-spec.ts` prouve qu'elle
n'est pas circulaire (objection 7) — les deux lecteurs viennent de modules
`@Global`.

Un constat en le bâtissant : l'objection 6 dit qu'`orders` importe déjà
`accounting` « dans `settlement-regime.ts` ». Ouvert le 2026-10-24 : ce fichier
ne fait que le CITER en commentaire ; l'import de `receivedOnOf` par
`mark-order-fulfilled.handler.ts` est le premier `orders → accounting` du
domaine.

## 8. Deuxième temps — le script de reprise (bâti et lancé en dev le 2026-10-24, non commité ; NON lancé en production)

Il se lance **après** le déploiement du premier temps, **avant** B4.

### 8.1 Ce qu'il fait

Pour chaque commande `handed_over_at IS NOT NULL AND received_on IS NULL`,
dans l'ordre de `created_at`, il exécute par le bus
`RecordOrderDeliveryDayCommand(orderId)` — la même règle `receivedOnOf`,
écrite une fois, et l'écriture conditionnée `received_on IS NULL` : jamais une
date déjà posée ne bouge, le déclencheur ne mord pas. C'est exactement
`datePastDeliveries` (`apps/lfd-api/src/dev/seeding/invoice-handovers.seed.ts`),
lancé dans un contexte Nest autonome contre la base de production.

⚠️ **Ce n'est pas la commande de B2** : `MarkOrderFulfilledCommand` ne touche
pas une commande déjà remise (`where handedOverAt: null`), et c'est voulu.

✅ **Décidé par Hugo le 2026-10-24 : la reprise a le MÊME repli que la remise.**
Quand `receivedOnOf` ne rend rien (`handed_over_at` posé, aucune ligne
`order_handover`), la date est le jour de Paris de `handed_over_at`. La règle
et son repli sont écrits une fois, `receivedOnOrDayOf`
(`b2b/accounting/domain/services/monthly-invoicing.ts`), appelée par
`MarkOrderFulfilledHandler` (B2) et par la commande de reprise. Les commandes
« date posée sans remise » ne se réparent pas : le script les compte et les
liste par numéro, sans rien écrire, pour décision de Hugo.

**Ce qui est bâti** (au lieu de l'esquisse ci-dessous, qui reste pour mémoire) :

- `BackfillOrderReceivedOnCommand(orderId, handedOverAt)` + handler
  (`b2b/accounting/application/commands/backfill-order-received-on.*`) — une
  commande DÉDIÉE : `RecordOrderDeliveryDayHandler` reste sans repli, c'est
  juste pour l'abonné du retrait. Même écriture conditionnée
  `received_on IS NULL` (`OrderDeliveryDays.recordFirst`).
- `prisma/ops/received-on-backfill` (retiré en B4) (contrôles + boucle, lit en
  Prisma, écrit par le bus seulement ; l'attestation se lit par
  `OrderHandoverHistoryReader`, pas par jointure sur `production`) et
  `prisma/ops-received-on-backfill` (retiré en B4) (amorce l'application
  réelle, affiche `hôte:port/base`, jamais l'utilisateur ni le mot de passe).
- `pnpm --filter lfd-api ops:received-on-backfill` : simulation ;
  `… --apply` : écriture, puis contrôles « après », code de sortie 1 si
  l'un des n° 1, 2, 4, 5 n'est pas à zéro (n° 3 est informatif).
- Lancé en dev le 2026-10-24 contre `localhost:5433/lfc_b2b_dev` : avant 0 / 0 / 0
  / 0, après 0 partout — rien à dater (les 21 du constat avaient déjà leur date).

### 8.2 Contrôles (runbook), noms de colonnes après le premier temps

Avant :

```sql
-- 1. combien, et lesquelles
SELECT count(*) FROM orders WHERE handed_over_at IS NOT NULL AND received_on IS NULL;
SELECT order_number, handed_over_at, (handed_over_at AT TIME ZONE 'Europe/Paris')::date AS jour_paris
  FROM orders WHERE handed_over_at IS NOT NULL AND received_on IS NULL ORDER BY handed_over_at;
-- 2. parmi elles, celles sans attestation de retrait (le repli manquant, §8.1)
SELECT o.order_number FROM orders o
  WHERE o.handed_over_at IS NOT NULL AND o.received_on IS NULL
    AND NOT EXISTS (SELECT 1 FROM production.order_handover h WHERE h.order_id = o.id);
-- 3. celles déjà sur une facture (date figée NULL sur la ligne de facture)
SELECT o.order_number FROM orders o JOIN invoice_order io ON io.order_id = o.id
  WHERE o.handed_over_at IS NOT NULL AND o.received_on IS NULL;
-- 4. instantanés de comparaison (même session que les contrôles « après »)
CREATE TEMP TABLE avant AS SELECT id, received_on FROM orders;
CREATE TEMP TABLE factures_avant AS SELECT invoice_id, order_id, received_on FROM invoice_order;
-- 5. le sens inverse (Q5, contrainte de B4) : une date sans remise
SELECT count(*) FROM orders WHERE received_on IS NOT NULL AND handed_over_at IS NULL;
```

Après :

```sql
-- 1. doit rendre 0
SELECT count(*) FROM orders WHERE handed_over_at IS NOT NULL AND received_on IS NULL;
-- 2. aucune date déjà posée n'a bougé — doit rendre 0
SELECT count(*) FROM orders o JOIN avant a USING (id)
  WHERE a.received_on IS NOT NULL AND o.received_on IS DISTINCT FROM a.received_on;
-- 3. écart à la règle simple (attendu : seulement des remises à la porte)
SELECT order_number FROM orders
  WHERE handed_over_at IS NOT NULL AND received_on <> (handed_over_at AT TIME ZONE 'Europe/Paris')::date;
-- 4. aucune facture touchée — doit rendre 0 (la ligne figée ne bouge jamais)
SELECT count(*) FROM invoice_order io JOIN factures_avant f USING (invoice_id, order_id)
  WHERE io.received_on IS DISTINCT FROM f.received_on;
-- 5. le sens inverse doit aussi rendre 0 avant B4 (Q5)
SELECT count(*) FROM orders WHERE received_on IS NOT NULL AND handed_over_at IS NULL;
```

⚠️ Le contrôle « après » n°5 n'est pas couvert par la reprise : une date sans
remise ne se répare pas en posant une date. Si la base en porte, B4 (Q5) ne
passera pas, et la décision est à prendre avec Hugo.

### 8.3 Le geste de production — SANS OBJET (Q6 révisée, 2026-10-24)

La migration de B4 fait la reprise ; le script et sa commande
`ops:received-on-backfill` sont retirés. Le texte ci-dessous reste pour mémoire.

Après le déploiement du premier temps (migration `20261024120000` appliquée,
API servie), avant B4. Depuis un poste, dans `apps/lfd-api` :

1. Exporter la cible dans le shell (l'environnement prime sur `.env`, que
   `--env-file-if-exists` ne lit qu'en complément) :
   `export DATABASE_LFD_URL='<URL directe de production>'` et les autres
   variables qu'`AppConfig` exige au démarrage.
2. `pnpm ops:received-on-backfill` — **simulation**. Vérifier la ligne
   `Base ciblée : <hôte>:<port>/<base>` : c'est la production, et rien
   d'autre. Relever les chiffres « AVANT » (n° 1 à 3, 5).
3. Si le n° 5 (« dates sans remise ») n'est pas à zéro : **s'arrêter**, transmettre
   la liste des numéros à Hugo. La reprise ne la répare pas, et le contrôle
   « après » échouerait.
4. `pnpm ops:received-on-backfill --apply` — écriture par le bus. Le n° 1
   « APRÈS » doit rendre 0, les n° 2 et 4 aussi ; le n° 3 ne doit lister que
   des remises à la porte. Code de sortie 0 attendu.
5. Relancer la simulation : « AVANT » n° 1 doit être à 0 (idempotence vérifiée).
6. `unset DATABASE_LFD_URL` et les autres variables exportées.

Rien d'autre n'écrit : pas de SQL à la main, pas d'`UPDATE`.

## 9. Troisième temps (B4) — bâti le 2026-10-24, non commité

**Migration** `apps/lfd-api/prisma/migrations/20261024150000_la_reception_suit_la_remise/migration.sql`,
dans une transaction explicite (`BEGIN` / `COMMIT` : Prisma n'en ouvre pas,
et un échec sur le second CHECK laissait l'`UPDATE` et le premier appliqués,
constaté sur une base de test) :

1. `UPDATE` des remises sans date, par la règle simple (Q6 révisée). ⚠️
   `handed_over_at` est un `TIMESTAMP(3)` SANS fuseau, écrit en UTC :
   l'expression est `(("handed_over_at" AT TIME ZONE 'UTC') AT TIME ZONE
'Europe/Paris')::date`. Le seul `AT TIME ZONE 'Europe/Paris'` (§1 D3,
   §8.2 n° 3) lit l'heure comme une heure de Paris et rend le jour de la
   session — faux pour une remise après 22h/23h UTC (vérifié : 22:30Z le 13
   rend le 13 au lieu du 14). Sans effet sur la commande de production
   (12:35Z). Le déclencheur figé laisse passer `NULL` → valeur.
2. `orders_handover_has_received_on` et `orders_received_on_has_handover` (Q5).

**Retirés** : l'abonné `RecordDeliveryDayOnHandover`
(`accounting.record-delivery-day.on-handover`), `RecordOrderDeliveryDayCommand`,
`BackfillOrderReceivedOnCommand`, le port `OrderDeliveryDays` et
`PrismaOrderDeliveryDays`, le script `ops:received-on-backfill` et son e2e,
`deliveryDayMissing` (contrat `collection-procedure-invoices.ts`, domaine,
écran de l'onglet Factures), `datePastDeliveries`. `markFulfilled` n'a plus
qu'une instruction : une commande pas encore remise n'a jamais de date.
`issuableCount` compte toutes les réceptions confirmées.

**Fixtures** : `receivedOnColumn` devient `receivedColumns` (les deux colonnes
ensemble), `markDelivered` pose aussi `handed_over_at`, `invoice-dossiers`
pose la remise avec le jour, `delivery-en-route` pose les deux colonnes ; le
test `deliveryDayMissing` de `monthly-invoices` est retiré (état refusé en
base), et `order-received-on` prouve les deux refus.

**Reste au déploiement** : les lettres mortes éventuelles de l'abonné retiré
(§5 obj. 8) ne sont pas acquittées par la migration — à constater et
acquitter à la main après le déploiement.
