# Plan — le lot rejeté par la banque (PSR1 après « Marquer déposé »)

> 🚧 **Bâti le 2026-10-23, pas encore commité.** Décision de Hugo du 2026-10-23,
> option (b) : un lot **déposé** dont la banque rejette le **fichier entier**
> (accusé PSR1, avant toute signature ni exécution) passe dans un état propre,
> et ses commandes redeviennent à prélever. Contredit par `vitruve` le
> 2026-10-23 ; ses objections et les décisions de Hugo sont au § 0, qui
> **l'emporte** sur les §§ 1 à 9 là où ils diffèrent.

Comble le manque nommé dans [`procedure-de-prelevement.md`](procedure-de-prelevement.md)
§ 2.8 et § 5 (« pas de dé-déposer un lot déposé dont le fichier est rejeté »).

## 0. Contradiction de vitruve et décisions (2026-10-23)

### 0.1 Bloquants — corrigés

| #   | Objection                                                                                                                                                                                                                                                                          | Correction                                                                                                                                                                                                                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a   | Le CHECK `collection_batch_deposited_is_signed` (migration `20261005140000`, l. 43-44) lie `status = 'deposited'` à la trace du dépôt **dans les deux sens** : un lot rejeté, qui la garde, serait refusé.                                                                         | Remplacé par `("status" IN ('deposited', 'rejected_by_bank')) = (deposited_at IS NOT NULL AND deposited_by_staff_id IS NOT NULL)`. Plus `collection_batch_rejected_is_signed` : les trois colonnes du rejet posées ssi `status = 'rejected_by_bank'`.                                                               |
| b   | L'index unique partiel `collection_batch_one_live_per_cycle` (l. 58-60, `WHERE status <> 'cancelled'`) compterait le lot rejeté comme vivant : la clôture ne se reconstituerait jamais.                                                                                            | Recréé avec `WHERE status NOT IN ('cancelled', 'rejected_by_bank')`.                                                                                                                                                                                                                                                |
| c   | La décision « lot vivant » se prend surtout **en domaine et en application**, par des `!== "cancelled"`, pas seulement dans les lecteurs Prisma du § 1. Un site oublié = « Mes factures » qui dit prélevée une facture qui ne l'est pas, ou une clôture qui ne se reconstitue pas. | UN prédicat de domaine, `isDeadBatchStatus` (`domain/entities/collection-batch-status.ts`), et sa traduction Prisma `LIVE_BATCH_STATUS` / SQL (`infrastructure/live-batch-status.ts`), employés à **chaque** site du tableau 0.2. Le préfixe du fichier retéléchargé d'un lot rejeté est `REJETE-` (pas `ANNULE-`). |

### 0.2 Les sites « lot vivant » — inventaire exhaustif

Grep exact (vérifié le 2026-10-23) : `grep -rn '"cancelled"' apps/lfd-api/src --include='*.ts'`
hors `__tests__`, puis tri à la main de ce qui lit le statut d'un **lot**.

| Site                                                              | Ce qu'il décide                                  | Traitement                           |
| ----------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------ |
| `domain/services/invoice-settlement.ts:31`                        | type `DebitBatchStatus`                          | élargi au type du domaine            |
| `domain/services/invoice-settlement.ts:91` (`latestLiveDebit`)    | « Mes factures » : la ligne qui règle la facture | `isDeadBatchStatus`                  |
| `domain/services/collection-procedure.ts:26`                      | type `ProcedureBatch.status`                     | élargi                               |
| `domain/services/collection-procedure.ts:73`                      | raison de l'onglet 3                             | raison neuve `rejected_by_bank`      |
| `domain/services/collection-procedure.ts:182`                     | lot suivi d'une clôture                          | `isDeadBatchStatus`                  |
| `domain/services/collection-procedure.ts:196` (`replacementOf`)   | le lot qui remplace                              | `isDeadBatchStatus`                  |
| `domain/services/collection-procedure-list.ts:137, 145`           | clôture manquée / de nouveau à préparer          | `isDeadBatchStatus`                  |
| `domain/services/collection-procedure-warnings.ts:38`             | type du statut                                   | élargi                               |
| `domain/errors/collection-return-errors.ts:60`                    | message d'un retour sur lot non déposé           | message propre au lot rejeté (§ 0.3) |
| `application/collection-procedure-support.ts:141`                 | clôture déjà préparée ?                          | `isDeadBatchStatus`                  |
| `application/collection-procedure-identity-support.ts:37`         | lots comptés dans l'identité de la procédure     | `isDeadBatchStatus`                  |
| `application/procedure-rhythms-support.ts:25`                     | rythmes des lots vivants                         | `isDeadBatchStatus`                  |
| `application/queries/get-billing-rhythms-calendar.handler.ts:144` | calendrier : clôture couverte ?                  | `isDeadBatchStatus`                  |
| `application/queries/get-collection-procedure.handler.ts:143`     | lot de remplacement                              | `isDeadBatchStatus`                  |
| `application/queries/export-collection-batch-file.handler.ts:70`  | préfixe du fichier                               | `REJETE-` pour un lot rejeté         |
| `infrastructure/prisma-batched-mandates.reader.ts:18`             | mandat déjà présenté                             | `LIVE_BATCH_STATUS`                  |
| `infrastructure/prisma-collection-candidates.reader.ts:172, 211`  | chaînage des cycles, un lot par clôture          | `LIVE_BATCH_STATUS`                  |
| `infrastructure/prisma-autopilot-coverage.reader.ts:30`           | couverture de l'automatisme                      | `LIVE_BATCH_STATUS`                  |
| `infrastructure/prisma-recorded-closure.reader.ts:16`             | clôture enregistrée                              | `LIVE_BATCH_STATUS`                  |
| `infrastructure/prisma-cycle-notices.reader.ts:24`                | `batchLive` d'un avis                            | `isDeadBatchStatus`                  |

**Faux positifs, laissés intacts** (statut d'une **commande**, pas d'un lot) :
`infrastructure/billable-order-criterion.ts:91`,
`infrastructure/prisma-detached-unpaid.reader.ts:35`,
`infrastructure/prisma-collection-orders.readers.ts:16`. Hors sujet :
`prisma-billing-statement.repository.ts:64` (statut d'un arrêté), les
historiques de mode (`billing-mode*.ts`, `payer-billing-mode-history.ts`),
`payments/` (lien de paiement Stripe). Les lecteurs qui ne font que **copier**
le statut (`prisma-closure-batches`, `prisma-collection-batch`,
`prisma-billing-statement`, `prisma-invoice-settlement-facts`) passent par
le type élargi : `tsc` refuse tout `switch` incomplet.

### 0.3 Sérieux — corrigés

- **Transition gardée en base.** Un déclencheur `collection_batch_transition`
  sur `collection_batch` n'admet `rejected_by_bank` **que depuis
  `deposited`**, et refuse toute sortie de `rejected_by_bank` (terminal).
  C'est la condition qui rend acceptable le relâchement de
  `billing_statement_immutable` (Q4) : un lot ne peut être `rejected_by_bank`
  en base qu'après être passé par le geste.
- **Le garde des arrêtés.** `cancelForBatch` n'a pas de garde applicative
  (vérifié le 2026-10-23 : `prisma-billing-statement.repository.ts:53-67`
  n'en porte aucune, `BatchNotConstitutedError` n'y est pas) ; la seule garde
  est le déclencheur, remplacé pour accepter `constituted` **ou**
  `rejected_by_bank`.
- **Ordre d'écriture.** Handler propre, `RejectCollectionBatchByBankHandler`
  (pas de réutilisation de l'annulation, qui écrit les arrêtés **avant** le
  lot) : `save(batch)` **avant** `cancelForBatch`.
- **Course rejet / retour.** Dans la même transaction : verrou
  `SELECT … FOR UPDATE` sur la ligne du lot (port `CollectionBatchLock`),
  puis relecture des retours de ses lignes, puis refus s'il y en a. Un retour
  enregistré en même temps prend le même verrou avant de lire le statut du lot.
- **Rejet déclaré à tort.** Un retour qui arrive sur un lot
  `rejected_by_bank` reçoit `ReturnOnRejectedBatchError` : « ce lot a été
  déclaré rejeté par la banque par … le … ; s'il a été exécuté, il y a un double
  débit : rembourser … ». La procédure (§ 7, runbook) décrit le geste de
  sortie, hors outil (procédure § 4.7).
- **Q1 retirée.** Le lot réel est toujours `RCUR` ou `OOFF` (réponse 20 de la
  banque ; CHECK `collection_batch_line_sequence`, vérifié le 2026-10-23) :
  il n'y a pas de `FRST` à rejouer.

### 0.3 bis Écarts de bâti (mécanique, 2026-10-23)

- Le fait au journal s'appelle `collection.batch_rejected_by_bank` (pas
  `accounting.collection_batch.rejected_by_bank`) : ses voisins sont
  `collection.batch_cancelled`, `collection.batch_deposited`.
- Un second déclencheur, `collection_batch_born_live`, refuse un lot inséré
  directement `rejected_by_bank` (le déclencheur de transition ne voit que les
  `UPDATE`).
- Le message d'un retour sur un lot rejeté donne la date et le motif du rejet ;
  ~~l'auteur est renvoyé au journal du lot~~ **et nomme qui l'a déclaré**
  (décision de Hugo, 2026-10-23) : les handlers de saisie et de confirmation
  d'import lisent `StaffAuthorDirectory` au refus seulement, jamais sur le
  chemin d'un retour qui s'enregistre ; une référence que l'annuaire ne
  reconnaît plus se dit « un membre de l'équipe ». ⚠️ Un import refuse
  d'ordinaire en amont, à l'appariement (`ImportEntryNotRecordableError`,
  statut `not_returnable` de l'aperçu) : ce message-là ne nomme pas
  l'auteur — seule la course sous le verrou passe par le refus nommé.
- Route : `POST admin/accounting/collection/batches/:id/rejected-by-bank`,
  corps `{ attested: true, reason }`.

### 0.4 Décisions de Hugo (2026-10-23)

| #   | Décision                                                                        |
| --- | ------------------------------------------------------------------------------- |
| Q1  | retirée (§ 0.3)                                                                 |
| Q2  | reconstitution **à la main** ; l'automatisme ne reprend pas une clôture rejetée |
| Q3  | rejet **refusé à partir du jour d'échéance**, en plus du refus sur retour       |
| Q4  | relâcher la protection des arrêtés, **avec** le déclencheur de transition       |
| Q5  | pas d'avis rectificatif dans ce lot                                             |
| Q6  | le motif et l'auteur au registre RGPD (`lint:rgpd-staff`)                       |

### 0.5 Ce que la migration fait aux lignes existantes

Rien n'est réécrit. Les CHECK remplacés sont **plus larges** que les anciens
pour toute ligne qui n'est pas `rejected_by_bank` (aucune ne l'est) ; l'index
recréé couvre exactement les mêmes lignes ; les colonnes neuves sont nulles.
Pas de clé étrangère sur `rejected_by_staff_id`, comme ses voisines
`deposited_by_staff_id` et `cancelled_by_staff_id` (vérifié le 2026-10-23 :
aucune n'en a).

## 1. L'état

`CollectionBatchStatus` gagne **`rejected_by_bank`** (« Rejeté par la
banque »). États : `constituted → deposited → rejected_by_bank`, terminal.
Ce n'est **pas** `cancelled` : `cancelled` dit « l'équipe l'a retiré avant
dépôt » ; `rejected_by_bank` dit « il a été déposé, la banque l'a refusé
entier ». La trace du dépôt (`deposited_at`, `deposited_by_staff_id`) reste,
et s'y ajoutent `rejected_at`, `rejected_by_staff_id`, `rejection_reason`.

🔴 **Règle de lecture qui fait tout le plan :** pour tout ce qui demande « ce
lot est-il vivant ? », `rejected_by_bank` se lit **comme `cancelled`**. Il ne
diffère qu'à l'affichage et dans la trace. Les lecteurs qui écrivent
aujourd'hui `status: { not: "cancelled" }` (vérifié le 2026-10-23) :

| Lecteur (`b2b/accounting/infrastructure/`)                                                                                                              | Ce qu'il décide                                   | Avec un lot rejeté                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `prisma-batched-mandates.reader.ts:18`                                                                                                                  | mandat déjà présenté → séquence `RCUR`            | **exclu** : jamais présenté, le lot suivant repart en `FRST` [Q1]                                   |
| `prisma-collection-candidates.reader.ts:172`                                                                                                            | `previousClosure` (chaînage des cycles)           | exclu, comme un lot annulé                                                                          |
| `prisma-collection-candidates.reader.ts:211`                                                                                                            | `liveSchemes` (un lot par clôture et schéma)      | **exclu** : sinon la clôture ne se reconstitue jamais                                               |
| `prisma-collection-candidates.reader.ts:163`                                                                                                            | `consumedMandates` (ponctuel consommé)            | déjà `deposited` seulement : un ponctuel rejeté reste utilisable                                    |
| `prisma-autopilot-coverage.reader.ts:30`                                                                                                                | dernier lot vivant pour l'automatisme             | exclu ; la tentative de la clôture reste consommée → reconstitution à la main [Q2]                  |
| `prisma-cycle-notices.reader.ts:24`                                                                                                                     | `batchLive` d'un avis                             | non vivant                                                                                          |
| `prisma-invoice-settlement-facts.reader.ts`                                                                                                             | « Mes factures » côté client (`DebitBatchStatus`) | la facture n'est **pas** réglée par ce lot ; libellé comme un lot annulé                            |
| `prisma-closure-batches.reader.ts`, `prisma-recorded-closure.reader.ts`, `prisma-collection-batch.reader.ts`, `export-collection-batch-file.handler.ts` | lectures et fichier                               | à relire un par un au bâti ; le fichier d'un lot rejeté se retélécharge préfixé comme un lot annulé |

Bâti : une seule constante (`DEAD_BATCH_STATUSES = ["cancelled", "rejected_by_bank"]`)
remplace chaque `not: "cancelled"`, pour qu'un futur état mort n'en oublie
aucun. ⚠️ Un lecteur oublié = un lot rejeté qui bloque sa clôture, ou une
séquence `RCUR` sur un mandat jamais débité (rejet de la banque).

## 2. Qui, quand

- **Qui** : ressource `b2b_accounting` (même droit que « Marquer déposé »).
- **Quand** — `CollectionBatch.rejectByBank(stamp, reason, returnedLines)` refuse :
  - lot non `deposited` → `BatchNotDepositedError` (409) — un lot préparé
    s'annule, il ne se « rejette » pas ;
  - une ligne au moins porte un **retour** enregistré → `RejectedBatchHasReturnsError`
    (409) : un retour prouve que la remise a été exécutée ; le message nomme
    les payeurs et dit de traiter ces lignes en retours ;
  - motif vide ou > 200 caractères → `DomainError` (400).
- **« Exécution enregistrée »** : l'outil n'enregistre **aucune** exécution
  (le crédit global se constate à la main, procédure § 3.1 — vérifié le
  2026-10-23 : rien dans `accounting/` ne pose un fait « exécuté »). Seul le
  retour est un signe d'exécution. [Q3] Faut-il **en plus** refuser une fois
  l'échéance du lot passée (`requestedCollectionDay ≤ aujourd'hui`) ? Un PSR1
  arrive avant exécution ; un rejet saisi après l'échéance est soit tardif,
  soit faux, et c'est le second qui débite deux fois. Proposition : refuser
  à partir du jour d'échéance, message « l'échéance est passée : vérifiez sur
  CENET que la remise n'est pas partie ; si elle est partie, traitez les lignes
  en retours ».

## 3. Ce que le geste défait, dans UNE transaction

1. **Le lot** : `deposited → rejected_by_bank`, avec auteur, instant, motif.
2. **Les commandes** : `collected → due` par une nouvelle transition
   `OrderCollection.releaseRejected(at)` (n'accepte que `collected` ; `returned`
   reste à la décision humaine du retour). Comme `release`, elle efface
   `batchId`/`lineRank` : la ligne du lot garde la liste des commandes
   (`collection_batch_line.order_ids`), c'est elle la trace.
3. **Les arrêtés de facturation** du lot : `active → cancelled`.
   🔴 **Le déclencheur `billing_statement_immutable`** (migration
   `20261008140000`) n'accepte cette transition que si le lot est
   `constituted` en base. Il faut le **remplacer** (`CREATE OR REPLACE
FUNCTION`) pour accepter aussi `rejected_by_bank`, et le handler écrit le
   lot **avant** les arrêtés (l'ordre inverse de l'annulation). C'est un
   relâchement d'une garde en base, borné à un état qui n'est atteignable
   que depuis `deposited` par le seul geste ci-dessus. [Q4]
4. **Les factures** : rien à écrire — elles n'ont pas de statut « prélevée »
   (le règlement côté client se dérive des lots, cf. le tableau du § 1). Elles
   redeviennent à prélever avec leurs bons, comme pour un lot annulé.
5. **Les avis de pré-notification** déjà partis : rien n'est rappelé ni
   effacé. La reconstitution met en file un **nouvel avis par ligne**, avec
   l'échéance du nouveau lot, recalculée par `frozenCollectionDay`
   (préavis compté depuis la nouvelle préparation). Le payeur reçoit donc deux
   avis pour une dette ; [Q5] faut-il un texte « remplace l'avis du … » ?
   Proposition : non dans ce lot (l'annulation ne le fait pas non plus,
   procédure § 4.1 point 4) ; noté au § 5 de la procédure.
6. **Le délai de dépôt** du lot suivant : rien de neuf — la limite de dépôt
   et le préavis s'appliquent au nouveau lot comme à tout lot ; la
   limitation de procédure § 4.1 point 5 (l'échéance n'est pas reculée pour
   la limite de dépôt) vaut ici aussi.

Ce qui ne se défait **jamais** : le fichier stocké et son empreinte, les
lignes, les stamps de constitution et de dépôt.

## 4. Le fait au journal

`accounting.collection_batch.rejected_by_bank` (même forme que
`CollectionBatchCancelledEvent`) : lot, entité, auteur (identifiant staff
local), instant, motif, nombre de lignes, total en centimes. Plus un
`billing_statement.cancelled` par arrêté, comme l'annulation. Phrase du
back-office : « {auteur} a déclaré le fichier du lot {code} rejeté par la
banque (PSR1) : {motif}. {n} commandes redeviennent à prélever. »

## 5. Le doublon CENET

- Le lot reconstitué a un **nouvel ULID**, donc un nouveau `MsgId`, une
  nouvelle heure de création et de nouveaux `EndToEndId` (préfixe dérivé du
  lot, `collection-identifiers.ts`) : c'est ce que la banque demande pour
  redéposer après rejet (réponse 28).
- Le contrôle de doublon **par transaction** (RUM, IBAN, montant, échéance,
  réponse 21) peut toucher le redépôt si l'échéance reste la même. Comme le
  préavis est recompté depuis la nouvelle préparation, l'échéance change
  presque toujours ; quand elle ne change pas, le risque est un **rejet de
  doublon par la banque**, pas un double débit. Assumé, écrit dans la
  procédure (§ 4.3).
- 🔴 **Le risque qui reste**, et qu'aucun code ne ferme : déclarer « rejeté »
  un lot dont la remise est en réalité **signée et partie**. Le lot suivant
  débiterait une seconde fois. Défenses : l'attestation à l'écran, le motif
  obligatoire, le refus dès qu'un retour existe (et [Q3] dès l'échéance), le
  journal nominatif. Assumé, pas fermé.

## 6. Migration (additive)

- `ALTER TYPE "CollectionBatchStatus" ADD VALUE 'rejected_by_bank'` (seule
  dans sa migration : une valeur ajoutée ne s'emploie pas dans la même
  transaction).
- `collection_batch` : `rejected_at TIMESTAMPTZ NULL`,
  `rejected_by_staff_id TEXT NULL` (FK staff comme `deposited_by_staff_id`),
  `rejection_reason TEXT NULL` ; CHECK : les trois sont posés ssi
  `status = 'rejected_by_bank'`, et `deposited_at` l'est aussi.
- `CREATE OR REPLACE FUNCTION billing_statement_immutable` (§ 3 point 3).
- Registre RGPD : `public.collection_batch.rejected_by_staff_id`, même
  finalité que ses trois voisines. `rejection_reason` est un texte libre du
  staff : il peut contenir un nom → au registre aussi [Q6].

## 7. L'écran

- Bouton **« La banque a rejeté ce fichier »** sur un lot `déposé`, dans la
  barre de l'onglet 3 de la page procédure (`procedure-batch-actions`) et
  sur « Prélèvement du mois » (`app-pending-batch`). Il ouvre un panneau fold :
  attestation à cocher « La banque a rejeté ce fichier (accusé PSR1) — la
  remise n'a pas été signée », motif court obligatoire, confirmer.
- L'onglet 3 et la table des procédures montrent l'état « Rejeté par la
  banque » (motif, auteur, date) et invitent à « Préparer de nouveau ».

## 8. Ce qui reste interdit

- **Annuler** un lot déposé (`DepositedBatchNotCancellableError`, inchangé).
- Rejeter un lot préparé, annulé, ou déjà rejeté.
- Rejeter une **partie** du lot : un rejet de transactions est un retour
  (procédure § 3).
- Revenir de `rejected_by_bank` : terminal.

## 9. Questions ouvertes

| #   | Question                                                        | Proposition                                        |
| --- | --------------------------------------------------------------- | -------------------------------------------------- |
| Q1  | Un `FRST` rejeté au niveau fichier : le suivant est-il `FRST` ? | oui (jamais présenté) — à confirmer avec la banque |
| Q2  | L'automatisme reconstitue-t-il après un rejet ?                 | non : reconstitution à la main                     |
| Q3  | Refuser le rejet à partir de l'échéance ?                       | oui                                                |
| Q4  | Relâcher le déclencheur des arrêtés, ou garder l'arrêté actif ? | relâcher, borné à `rejected_by_bank`               |
| Q5  | Un avis « remplace l'avis du … » ?                              | non dans ce lot                                    |
| Q6  | Le motif libre au registre RGPD ?                               | oui                                                |
