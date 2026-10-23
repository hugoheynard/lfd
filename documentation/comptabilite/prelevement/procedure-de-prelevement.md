# La procédure de prélèvement, pas à pas

> **Procédure, destinée à devenir un runbook.** Écrite le 2026-10-23 à la
> demande de Hugo (« une doc procédure de prélèvement qui fait un récap de ce
> qu'on doit faire à la clôture d'une période »). Chaque étape cite l'écran, la
> route ou le fichier qui la fait, **ouverts le 2026-10-23**. Elle ne décrit pas
> le mécanisme (les docs d'état le font) : elle dit **qui fait quoi, quand, où,
> et ce qu'on vérifie**. Contredite par `vitruve` le même jour (§ 7).
>
> 🔴 **Aujourd'hui, aucune remise ne peut partir** : le contrat CENET REMISES
> n'est pas signé, et l'export des comptes destinataires n'est pas encore bâti
> ([`reponses-de-la-banque.md`](reponses-de-la-banque.md) § 3). L'export des
> mandats suit le modèle de la banque depuis le 2026-10-23
> ([`prerequis-export-mandats.md`](prerequis-export-mandats.md)). Le § 0
> n'est donc pas fait ; tout le reste suppose qu'il l'est.

Légende, sur chaque geste :

- ✅ **dans l'outil** — un écran ou un automatisme du back-office le fait ;
- ✋ **à la main** — hors de l'outil (portail CENET, mail, téléphone), ou dans
  l'outil mais sans contrôle qui le garantisse ;
- ⛔ **pas bâti** — décrit comme à faire ; aujourd'hui personne ne le fait.

Écrans cités (back-office, menu Comptabilité, `b2b_accounting`) :

- **Prélèvement du mois** — `/comptabilite/prelevement-du-mois`
  (`apps/lfd-backoffice-frontend/src/app/comptabilite/prelevement-du-mois/`) ;
- **Fiche de l'entité** — `/comptabilite/entites-juridiques/:id` (cartes
  « Prélèvement automatique », « Mandats à la banque ») ;
- **Prélèvement d'essai** — `/comptabilite/prelevement-d-essai`.

Routes API sous `apps/lfd-api/src/b2b/accounting/http/` (abrégé `http/`).

## Le cycle

```mermaid
flowchart TB
  subgraph UNE["Une fois pour toutes (§ 0)"]
    C0["Contrat CENET REMISES + convention par schéma<br/>plafonds communiqués · limite de dépôt réglée"]
  end
  subgraph CLIENT["À chaque nouveau client (§ 1)"]
    M1["Mandat signé + RIB"] --> M2["Export des comptes destinataires → import CENET"]
    M2 --> M3["Export des mandats → vérification CENET → import"]
    M3 --> M4["Compte rendu lu → « Marquer importé »"]
  end
  subgraph CLO["À chaque clôture (§ 2)"]
    F["Factures émises<br/>(23h55 la veille de la clôture)"] --> P["Lot préparé<br/>(auto ou « Préparer le lot »)"]
    P --> N["Avis de prélèvement envoyés<br/>(pré-notification)"]
    N --> K{"Contrôle du lot<br/>Contrôle CSV, signalements"}
    K -->|"faux"| X["Annuler → corriger → préparer de nouveau<br/>(rectificatif / annulation aux payeurs)"]
    X --> P
    K -->|"juste"| D["Télécharger « Fichier »<br/>déposer sur CENET avant la limite"]
    D --> MD["« Marquer déposé »<br/>(AVANT de signer)"]
    MD -->|"refusé"| AC["Annuler la remise sur CENET<br/>puis « Annuler » le lot"]
    AC --> P
    MD -->|"accepté"| S["Signer la remise sur CENET<br/>lire PSR1 / PSR2 / PSR3"]
  end
  subgraph APRES["Après l'échéance (§ 3)"]
    R1["Crédit global sur le compte · relevé SDD"] --> R2["Fichier d'impayés pain.002 / camt.054<br/>→ « Importer un fichier de la banque »"]
    R2 --> R3["Chaque retour : re-présenter, régler autrement, passer en perte"]
  end
  C0 --> CLIENT --> CLO --> APRES
  R3 -->|"re-présenté"| P
```

---

## 0. Une fois pour toutes

Rien de ceci n'est dans l'outil, sauf le réglage de la limite de dépôt.
Responsable : Hugo.

| #   | Geste                                                                                                                                                                                   | Où                                                                                                                       | État                                                                                     |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| 0.1 | Signer le contrat **CENET REMISES** et une **convention d'émission par schéma** (B2B au moins ; CORE si décidé, D8) ; faire paramétrer les services aller (remises) et retour (impayés) | la banque                                                                                                                | ✋ ; 🔴 pas fait — sans lui, **aucun dépôt possible** (réponse 1)                        |
| 0.2 | Communiquer les **trois plafonds** : par opération, par remise, cumul mensuel (D1)                                                                                                      | la banque                                                                                                                | ✋ ; pas fait                                                                            |
| 0.3 | Choisir le format des retours (`pain.002` ou `camt.054`, D6), l'imputation des impayés (D7), le PSR2 (D5)                                                                               | la banque                                                                                                                | ✋ ; pas fait                                                                            |
| 0.4 | Renseigner la **limite de dépôt** de l'entité (jours ouvrés + heure)                                                                                                                    | fiche de l'entité, carte « Prélèvement automatique »                                                                     | ✅ réglage (`legal_entities.deposit_cutoff_*`) ; **vide** tant que D4 n'est pas tranchée |
| 0.5 | Envoyer **par mail** à la banque un fichier d'essai et un brouillon de lot, pour qu'elle les teste (réponse 23)                                                                         | écran Prélèvement d'essai ; `GET admin/accounting/billing-cycle/draft.xml` (`http/admin-billing-cycle.controller.ts:71`) | ✋ ; pas fait                                                                            |
| 0.6 | Importer les **comptes destinataires** existants, puis les **mandats** existants                                                                                                        | voir § 1                                                                                                                 | dépend de 0.1                                                                            |

**La limite de dépôt n'est pas tranchée.** La banque a écrit deux choses :
« au plus tard J-2 » avant la date de règlement (réponse 3) et « CORE reçu à
J-1 avant 14 h 45, B2B avant 13 h 45 » (réponse 22). Les deux ne sont pas
conciliées (décision D4, [`reponses-de-la-banque.md`](reponses-de-la-banque.md)
§ 4). La proposition écrite là-bas — **2 jours ouvrés, 13:45** — tient les deux
lectures ; elle n'est **pas confirmée par la banque**. Tant qu'elle n'est pas
renseignée, l'écran n'affiche aucune date limite (`depositDeadlineOf` rend
`null`, `apps/lfd-api/src/b2b/accounting/domain/services/collection-calendar.ts:83`)
et **rien ne prévient d'un dépôt tardif**.

_Si on l'oublie_ : sans contrat, le fichier est inutilisable ; sans limite, un
dépôt tardif décale l'échéance chez la banque (« recalculée à J+2 », réponse 22)
alors que l'avis envoyé au débiteur annonçait l'ancienne date.

Les deux imports de départ ont leurs propres documents, en cours d'écriture le
2026-10-23 et non recopiés ici : [`prerequis-export-ribs.md`](prerequis-export-ribs.md)
(comptes destinataires) et [`prerequis-export-mandats.md`](prerequis-export-mandats.md)
(mandats).

---

## 1. À chaque nouveau client prélevé

Qui : la comptabilité (`b2b_accounting`), sauf 1.1 (le client). Quand : **avant
la première clôture** où le client a des factures, et au plus tard avant le
dépôt de ce lot.

| #   | Geste                                                                                                                                                         | Où                                                                                                                                                                               | État                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 | Le client saisit son **RIB** et **signe le mandat** (détenteur ou comptable de la société)                                                                    | boutique, `/mon-compte` ([`../mandat/rib-client.md`](../mandat/rib-client.md), [`../mandat/plan-mandat-client.md`](../mandat/plan-mandat-client.md))                             | ✅                                                                                                                                                                                                                                 |
| 1.2 | Exporter son **compte destinataire** et l'importer dans CENET (nouveaux seulement : un compte déjà connu fait rejeter **tout** l'import ; 200 lignes au plus) | [`prerequis-export-ribs.md`](prerequis-export-ribs.md)                                                                                                                           | ⛔ export pas bâti ; ✋ saisie à la main dans CENET en attendant                                                                                                                                                                   |
| 1.3 | « Préparer l'export » des mandats, puis « Télécharger »                                                                                                       | fiche de l'entité, carte « Mandats à la banque » ; `POST`/`GET admin/accounting/legal-entities/:id/mandate-exports…` (`http/admin-mandate-bank-exports.controller.ts:59`, `:72`) | ✅ conforme au modèle depuis le 2026-10-23 (F `AAAAMMJJ`, G `RECURRENT`/`PONCTUEL`, K `O` et L `N` supposés, 18 colonnes, 200 mandats par export, nom > 140 refusé — [`prerequis-export-mandats.md`](prerequis-export-mandats.md)) |
| 1.4 | Sur CENET : **vérifier le fichier** d'abord (compte rendu d'anomalies), puis l'importer                                                                       | CENET                                                                                                                                                                            | ✋                                                                                                                                                                                                                                 |
| 1.5 | **Lire le compte rendu d'import** : lignes lues, chargées, en erreur                                                                                          | CENET                                                                                                                                                                            | ✋                                                                                                                                                                                                                                 |
| 1.6 | « Marquer importé » — **seulement si le compte rendu ne porte aucune erreur**                                                                                 | même carte ; `POST …/mandate-exports/:exportId/imported` (`http/admin-mandate-bank-exports.controller.ts:92`)                                                                    | ✅ ; marque l'export **entier** (⛔ « sauf les RUM en erreur »)                                                                                                                                                                    |

À vérifier : le nom, l'IBAN et la RUM de la ligne CENET correspondent à la
fiche. Un import avec des erreurs **ne se marque pas importé** : on corrige et
on ré-exporte (consigne de [`reponses-de-la-banque.md`](reponses-de-la-banque.md),
réponse 13).

_Si on l'oublie_ : la banque **ne contrôle pas** les mandats au dépôt d'un
fichier (réponse 15) ; le débit part, puis revient en rejet le jour J. Rien
dans l'outil ne relie aujourd'hui « mandat jamais importé » et « lot à
déposer » (⛔ avertissement prévu, réponse 15).

Changement de compte d'un client : la banque demande **un nouveau mandat**
(réponse 9) ; la forme exacte (nouvelle RUM ou colonnes M–R) n'est pas tranchée
(D9). Ne pas traiter de changement de compte sans cette décision.

---

## 2. À chaque clôture

Une **clôture** est un jour du rythme de facturation (mensuel, deux fois par
mois, hebdomadaire, réglé par mode sur l'entité, le client choisissant un mode),
**et le 1er de chaque mois** (`isClosingDay`, `domain/services/billing-cycle.ts`,
[`../facturation/plan-rythme-de-facturation.md`](../facturation/plan-rythme-de-facturation.md)
§ 16 et § 17). D'où **jusqu'à cinq remises par mois**. Chaque clôture donne
**un lot par entité et par schéma** ; chaque lot est **un fichier**, avec une
seule échéance (`ReqdColltnDt`, `apps/lfd-api/src/b2b/accounting/domain/services/pain008-document.ts:185`) —
ce que la banque exige (« un fichier par schéma et par échéance », réponse 18).

### 2.1 Les factures sont émises — ✅ automatique

- **Quand** : 23h55 heure de Paris, la veille de la clôture (cron
  `55 21,22 * * *` UTC, `POST admin/accounting/monthly-invoices/autopilot`,
  `http/invoice-autopilot.controller.ts:30`) ; rattrapé par le passage horaire
  du lot si 23h55 a été manqué ([`prelevement-automatique.md`](prelevement-automatique.md) § 5).
  Le cron passe **deux fois** par soir (été / hiver) ; le handler ne tente qu'à
  23h55 heure de Paris et l'autre passage se tait
  (`http/invoice-autopilot.controller.ts:12-20`) — un passage à 22h55 ou 00h55
  dans les journaux n'est pas une anomalie.
- **Où le voir** : Prélèvement du mois › « Les factures du mois ».
- **Vérifier** : la tentative automatique est « émise », et les payeurs
  signalés sont nuls ou compris.
- **Si elle a manqué** : bouton « Émettre les factures … »
  (`POST admin/accounting/monthly-invoices`, `http/admin-monthly-invoices.controller.ts:47`),
  rejouable. ✅
- _Si on l'oublie_ : le lot n'encaisse que des factures émises ; sans facture,
  la ligne n'a rien à prélever.

### 2.2 Le lot est préparé — ✅ automatique ou bouton

- **Quand** : après la clôture, plus le délai réglé (1 h par défaut), si
  « Préparer le lot tout seul » est coché sur la fiche de l'entité ; une seule
  tentative par clôture (cron `15 * * * *`, `POST admin/accounting/collection/autopilot`,
  `http/collection-autopilot.controller.ts:43`). Sinon, ou si l'automatisme a
  manqué une clôture (il se **suspend** et le dit) : bouton « Préparer le lot … »
  (`POST admin/accounting/collection/batches`, `http/admin-collection-batches.controller.ts:75`).
- **Ce qui se passe** : les lignes (une par débiteur, ses factures), les
  exclusions nommées, le XML **figé et stocké** avec son empreinte, l'échéance
  figée (`frozenCollectionDay`, `domain/services/collection-calendar.ts:108` :
  jamais avant clôture + N, ni avant préparation + délai de pré-notification,
  puis jour ouvré TARGET2) — et **un avis de prélèvement par ligne** mis en file.

### 2.3 La pré-notification part — ✅ automatique, à surveiller

- **Ce que dit le code** : un avis par ligne (montant, échéance, RUM, ICS,
  factures réglées), envoyé au contact de facturation de la société payeuse,
  sinon à son détenteur ; ni l'un ni l'autre → `unsendable`
  ([`prelevement-automatique.md`](prelevement-automatique.md) § 4). Délai réglé
  sur l'entité, **14 jours par défaut** ; le prélèvement ne peut pas tomber plus
  tôt (`CollectionBeforeNoticeError`, `domain/value-objects/collection-schedule.ts:126`).
- **Ce que dit la banque** : elle ne lit pas la pré-notification (réponse 4).
  **Cela ne la lève pas** : l'obligation est envers le **débiteur** (règlement
  SEPA, CGV, mandat), et un prélèvement non pré-notifié est contestable
  ([`prelevement-sepa.md`](prelevement-sepa.md) § 8). Ne rien retirer de l'avis.
- **Réduire le délai sous 14 jours** demande une clause CGV et mandat qui
  n'est pas écrite (question non répondue, [`reponses-de-la-banque.md`](reponses-de-la-banque.md) § 5). ✋
- **Vérifier** : Prélèvement du mois › lot à traiter › état des avis — tous
  `envoyé`. **Tout autre état bloque le dépôt** — `échec`, `impossible`, mais
  aussi `en attente` (l'envoi n'a pas encore abouti : recharger la page,
  `pending-batch/pending-batch.html:40-45`)
  (`CollectionNoticesNotSentError`, `apps/lfd-api/src/b2b/accounting/domain/entities/collection-batch.ts:229`).
  Il n'y a **pas de bouton « renvoyer »** : corriger le contact, puis annuler et
  préparer de nouveau (§ 2.4).

### 2.4 Contrôler le lot — ✋ dans l'outil

Qui : la comptabilité. Où : Prélèvement du mois › le lot à traiter.

- Télécharger **« Contrôle CSV »** (`GET batches/:id/audit.csv`,
  `http/admin-collection-batches.controller.ts:133`, IBAN masqués) et le relire :
  un débiteur par ligne, montants égaux à la somme TTC de ses factures,
  échéance.
- Relire les **exclusions** (sans mandat, payeur détaché, mandat ponctuel déjà
  débité, créancier ambigu…) et les **sociétés sans mandat** : elles bloquent
  le dépôt (`BatchHasUnmandatedCompaniesError`, `collection-batch.ts:219`).
  Pour une commande à sortir du prélèvement : « Marquer réglée » (réglée
  autrement, avec une note ; `POST orders/:orderId/settle-otherwise`,
  `http/admin-collection-batches.controller.ts:150`).
- Comparer le total aux **plafonds** communiqués à la banque (§ 0.2). ⛔ Aucun
  avertissement dans l'outil ; au-delà, la banque **appelle** (réponse 2), elle
  ne rejette pas.
- Vérifier que chaque débiteur a un mandat **importé** chez la banque (§ 1.6).
  ⛔ Non relié dans l'outil.
- **Corriger** : « Annuler » (`POST batches/:id/cancel`, `:92` ; ses commandes
  repassent dues), corriger la cause, « Préparer le lot » de nouveau. Les payeurs
  déjà avisés reçoivent un **rectificatif** (termes changés) ou une
  **annulation** (plus prélevés) ; mêmes termes, rien ne part. ✅

_Si on l'oublie_ : une erreur déposée et signée ne s'annule plus (§ 4.2) ; seul
un retour, ou un remboursement hors de l'outil, la défait.

### 2.5 Télécharger le fichier `pain.008` — ✅

- Bouton **« Fichier »** (`GET batches/:id/file.xml`, `:116`) : le XML stocké,
  pas re-rendu ; l'empreinte est vérifiée au téléchargement. Droit d'**écriture**
  exigé (IBAN en clair) : le bouton s'affiche aussi en lecture seule
  (`pending-batch.html:54`), et l'API refuse alors.
- **Un fichier par lot**, donc par schéma et par échéance ; deux schémas ou deux
  clôtures = deux fichiers, deux remises.
- **Ne jamais retoucher le XML à la main** (`MsgId`, `CreDtTm`, montants) : le
  lot ne le saurait pas, et le rapprochement des retours par `EndToEndId` non
  plus.
- Ranger le fichier téléchargé dans un dossier local hors du dépôt, et le
  supprimer après dépôt : il porte des IBAN en clair. ✋

### 2.6 Déposer sur CENET avant la limite — ✋

- **Quand** : avant la **date limite de dépôt** affichée par le calendrier du
  lot (si elle est renseignée, § 0.4). Repères de la banque, non conciliés :
  **B2B avant 13 h 45, CORE avant 14 h 45, à J-1** de l'échéance (réponse 22) —
  **ou J-2** (réponse 3). En attendant D4, **déposer à J-2 ouvré au plus tard,
  avant 13 h 45**, ce qui respecte les deux. Tant que la limite n'est pas
  renseignée, l'outil ne la calcule pas : lire l'**échéance** du lot (calendrier
  du lot, ou `ReqdColltnDt` du fichier) et compter J-2 ouvré à la main. Mieux :
  renseigner dès maintenant 2 jours / 13:45 sur l'entité (§ 0.4) — c'est la
  consigne même de cette procédure.
- **Où** : CENET REMISES, service « remises » (aller), convention du **schéma
  du lot** (B2B ou CORE).
- **Vérifier** à l'écran CENET avant de signer : nombre d'opérations et montant
  total = ceux du lot dans le back-office ; schéma ; date d'échéance.
- _Si on dépose trop tard_ : la banque recalcule l'échéance (J+2, réponse 22) ;
  le débit ne tombe plus à la date annoncée au débiteur.

### 2.7 « Marquer déposé » — ✅, **avant** de signer

🔴 **L'ordre compte.** Une remise signée ne s'annule plus (réponse 29) ; un lot
refusé par « Marquer déposé » ne peut plus recevoir de retours (un retour exige
un lot déposé, `domain/entities/collection-return.ts:111-112`). Signer d'abord
laisserait de l'argent parti que l'outil ne peut ni constater ni défaire. On
fait donc le geste de l'outil **pendant que la remise est encore annulable**.

- **Quand** : remise déposée sur CENET, contrôlée (§ 2.6), **pas encore
  signée**, et sans PSR1.
- Bouton « Marquer déposé » (`POST batches/:id/deposit`,
  `http/admin-collection-batches.controller.ts:101` ;
  `CollectionBatch.markDeposited`, `collection-batch.ts:212`). Il relit tout et
  **refuse en nommant le cas** : société sans mandat, avis pas `envoyé`, mandat
  révoqué, IBAN changé, commande annulée (`DepositRecheckFailedError`, `:232`).
- **S'il refuse** : annuler la remise **sur CENET** (non signée, donc possible),
  puis « Annuler » le lot, corriger, préparer de nouveau (§ 4.1).
- **S'il accepte** : le lot est `déposé`, « Annuler » disparaît ; passer à 2.8.
- _Si on l'oublie_ : les commandes restent dans un lot préparé, le lot suivant
  ne les reprend pas, aucun retour ne peut être enregistré — et « Annuler »
  reste ouvert (règle ci-dessous). ⛔ Rien ne signale un lot préparé depuis
  longtemps sans être déposé.

🔴 **Règle : ne jamais cliquer « Annuler » sur un lot dont la remise est signée
chez la banque.** L'outil ne le sait pas et ne l'empêche pas (`cancel()` n'exige
que l'état constitué, `collection-batch.ts:196-199` ; bouton sans confirmation,
`pending-batch.html:69-78`) : les commandes redeviendraient dues et le lot
suivant les **prélèverait une seconde fois**. L'ordre ci-dessus rend le cas
impossible en temps normal ; il redevient possible si l'on signe avant d'avoir
marqué déposé.

### 2.8 Signer la remise — ✋

- Sur CENET, la remise déposée **se signe** pour partir. Avant signature, elle
  s'annule entière dans le suivi des remises ; jamais une seule ligne
  (réponse 29).
- ⚠️ La façon de signer (qui, quel moyen) dépend du contrat CENET REMISES,
  pas encore signé : **non documenté**.
- ⛔ Si la signature échoue, ou si un PSR1 arrive **après** « Marquer
  déposé », l'outil n'a pas de geste pour dé-déposer un lot. Ne pas annuler
  le lot (règle ci-dessus) ; remonter à Hugo avant tout redépôt (même `MsgId` :
  risque de doublon, § 4.3).

### 2.9 Lire les accusés PSR — ✋

Sur CENET (pas par mail, réponse 24) :

| Accusé | Ce qu'il dit                                          | Que faire                                              |
| ------ | ----------------------------------------------------- | ------------------------------------------------------ |
| PSR1   | le **fichier** est KO (n'arrive qu'en cas d'échec)    | avant « Marquer déposé » : § 4.1 ; après : § 2.8       |
| PSR2   | les **opérations** (positif + négatif par défaut, D5) | comparer au lot ; un négatif se traite en retour (§ 3) |
| PSR3   | les **opérations écartées**                           | chaque ligne écartée se traite comme un retour (§ 3)   |

⚠️ À quel moment PSR1 arrive (au dépôt, ou après signature) n'est pas dit par
la banque : à constater à la première remise.

---

## 3. Après l'échéance

| #   | Geste                                                                                                                                                                                               | Qui, où                                                                                                                                                                                          | État                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| 3.1 | Constater le **crédit global** de la remise sur le compte (un seul crédit par remise, réponse 19) ; le comparer au total du lot                                                                     | compta, relevé bancaire                                                                                                                                                                          | ✋                                                                                                |
| 3.2 | Rapprocher ligne à ligne avec le **relevé SDD** de la banque                                                                                                                                        | compta, CENET                                                                                                                                                                                    | ✋                                                                                                |
| 3.3 | Télécharger le **fichier d'impayés** du jour (`pain.002` ou `camt.054`, quotidien)                                                                                                                  | compta, CENET, service « retour »                                                                                                                                                                | ✋ ; dépend de 0.1 et D6                                                                          |
| 3.4 | L'importer : « Importer un fichier de la banque » → aperçu (chaque transaction jugée à blanc) → confirmer (tout ou rien)                                                                            | Prélèvement du mois › « Les retours de la banque » ; `POST admin/accounting/collection-returns/import/preview` puis `import/confirm` (`http/admin-collection-returns.controller.ts:137`, `:150`) | ✅, ⚠️ **jamais éprouvé sur un vrai fichier** de la banque                                        |
| 3.5 | À défaut, **saisir** le retour à la main : « Signaler un retour » sur la ligne (type, motif, date, frais)                                                                                           | même section ; `POST batches/:batchId/lines/:rank` (`:77`)                                                                                                                                       | ✅                                                                                                |
| 3.6 | Décider pour chaque retour : **« Re-présenter »** (entre au lot suivant, avec un avis « nouvelle présentation »), **« Régler autrement »** (lien de paiement, virement), ou **« Passer en perte »** | même section ; `:100`, `:109`, `:123`                                                                                                                                                            | ✅ décision ; ✋ relance du client                                                                |
| 3.7 | Motif qui appelle une révocation (MD01, AC04…) : révoquer le mandat par le geste existant (proposé, jamais automatique)                                                                             | fiche client                                                                                                                                                                                     | ✋                                                                                                |
| 3.8 | **Frais** de rejet : la banque les passe en écriture **distincte** (réponse 31) ; les saisir dans le champ frais du retour                                                                          | compta                                                                                                                                                                                           | ✅ champ ; ⛔ non refacturés (CGV à confirmer) ; ⛔ traitement comptable d'une perte : au cabinet |
| 3.9 | **Relancer** le client dont la ligne est revenue                                                                                                                                                    | compta, mail / téléphone                                                                                                                                                                         | ✋ ; aucun blocage automatique du client                                                          |

Rien ne repart tout seul : une ligne `returned` n'entre dans aucun lot tant
qu'un humain n'a pas décidé ([`retours-bancaires.md`](retours-bancaires.md)).
Re-présenter est refusé pour un mandat ponctuel consommé, un mandat inactif, ou
une ligne d'avant la facture émise.

_Si on l'oublie_ : l'outil continue de croire la facture payée ; le client ne
paie jamais ; et un fichier d'impayés non importé à temps se retrouve mêlé aux
suivants (⛔ un rejet du **lot entier**, sans détail par transaction, n'est pas
lu par l'import).

---

## 4. Incidents

### 4.1 Le fichier est rejeté (PSR1)

1. **Ne pas** « Marquer déposé » (s'il l'a déjà été : § 2.8).
2. Lire le motif sur CENET. Un défaut de **format** (un accent dans un nom…)
   fait rejeter le fichier entier ([`../mandat/rum.md`](../mandat/rum.md) § 4).
3. Dans le back-office : « Annuler » le lot, corriger la cause, « Préparer le
   lot » de nouveau. Le nouveau lot a un **nouvel ULID**, donc un nouveau
   `MsgId` et une nouvelle heure de création : c'est ce que la banque demande
   pour redéposer (« modifier l'heure de création », réponse 28). ✅
4. Les payeurs reçoivent un rectificatif si les termes ont changé (§ 2.4). ✅
5. Redéposer avant la limite. ⚠️ L'outil recule l'échéance du nouveau lot
   **seulement** pour tenir le préavis (`frozenCollectionDay`,
   `collection-calendar.ts:108`), **pas** pour la limite de dépôt : un redépôt
   tardif garde l'ancienne échéance sans prévenir. Si la limite est passée,
   vérifier l'échéance du nouveau lot à la main ; ⛔ la repousser n'a pas de
   geste propre.

### 4.2 Annuler une remise déposée

- **Avant signature** : l'annuler **entière** sur CENET, dans le suivi des
  remises (✋), **puis** « Annuler » le lot dans le back-office (✅). Dans cet
  ordre : l'inverse laisse une remise vivante chez la banque que l'outil croit
  morte.
- **Après signature** : impossible (réponse 29). **Ne pas** annuler le lot
  dans l'outil (règle du § 2.7 : double débit). Laisser partir, puis traiter
  les lignes fausses comme des retours ou des remboursements. ⛔ Le
  remboursement d'un prélèvement encaissé à tort n'a pas de geste dans l'outil.

### 4.3 Doublon

La banque contrôle sur **10 à 15 jours glissants** : au niveau fichier (`MsgId`

- nombre + montant) et au niveau transaction (`EndToEndId`, RUM, IBAN, montant,
  échéance) (réponse 21).

* Un lot n'est jamais déposé deux fois sous le même `MsgId` : un lot
  reconstitué en prend un autre ✅. Mais **déposer deux fois le même fichier
  téléchargé** est possible côté CENET (✋) : avant tout dépôt, vérifier dans le
  suivi CENET que la remise de ce lot n'y est pas déjà.
* **Essais** : un essai répété à l'identique (même débiteur, montant, échéance)
  dans les 15 jours peut être pris pour un doublon — varier le montant ou
  l'échéance.

### 4.4 Dépassement de plafond

La banque n'arrête pas la remise : son service EDI **appelle** pour vérifier
(réponse 2). Répondre avec le Contrôle CSV du lot. ⛔ L'outil ne prévient pas
avant ; ✋ comparer soi-même au § 2.4.

### 4.5 Mandat inconnu de la banque

La banque ne contrôle pas au dépôt (réponse 15) ; le débit est rejeté **le jour
d'exécution** et revient comme un retour (réponse 27). Traiter par § 3, puis
importer le mandat (§ 1) avant de re-présenter.

### 4.6 Lot manqué

Si l'automatisme a manqué une clôture, il se **suspend** et l'écran le dit, avec
le geste « Préparer le lot » ([`prelevement-automatique.md`](prelevement-automatique.md)
§ 5). ✅ Le lot manuel couvre les clôtures manquées ; l'échéance est repoussée
pour tenir le préavis.

---

## 5. Ce qui manque dans l'outil, en un coup d'œil

| Manque                                                                                        | Effet sur la procédure                                 | Référence                                                    |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------ |
| ~~Export des mandats non conforme~~ — corrigé le 2026-10-23 ; reste K et L à confirmer (Q-B2) | 🟡 vérification CENET avant le premier import          | [`prerequis-export-mandats.md`](prerequis-export-mandats.md) |
| Export des comptes destinataires                                                              | 🔴 saisie à la main dans CENET                         | [`prerequis-export-ribs.md`](prerequis-export-ribs.md)       |
| Limite de dépôt non renseignée (D4)                                                           | aucune date limite affichée                            | § 0.4                                                        |
| « Marquer importé sauf les RUM en erreur » ; borne de 200 lignes                              | un import partiel oblige à tout ré-exporter            | réponses 12, 13                                              |
| Avertissement plafond, mandat non importé                                                     | contrôles à la main au § 2.4                           | réponses 2, 15                                               |
| Lien entre une remise CENET et le lot (signature, PSR)                                        | « Marquer déposé » reste une déclaration humaine       | réponse 24                                                   |
| « Annuler » ouvert sur un lot dont la remise est signée ; pas de « dé-déposer »               | règle écrite seulement (§ 2.7), risque de double débit | `collection-batch.ts:196-199`                                |
| Alerte d'un lot préparé et jamais déposé                                                      | un oubli ne se voit pas                                | § 2.7                                                        |
| Échéance repoussée pour une limite de dépôt passée                                            | contrôle à la main                                     | § 4.1                                                        |
| Import des retours jamais éprouvé ; rejet de lot entier non lu                                | vérifier chaque import à la main la première fois      | [`retours-bancaires.md`](retours-bancaires.md)               |
| Remboursement d'un prélèvement à tort, frais refacturés, écriture de perte                    | hors outil                                             | § 3, § 4.2                                                   |

---

## 6. Ce qui n'est pas tranché

- **J-1 ou J-2** pour la limite de dépôt (D4) — consigne provisoire : J-2 ouvré,
  avant 13 h 45.
- **Clause CGV / mandat** pour pré-notifier à moins de 14 jours.
- Changement de compte d'un client : nouvelle RUM ou colonnes M–R (D9).
- Valeur de K « Mandat déjà émis » (Q-B2).
- La façon de signer une remise sur CENET REMISES (contrat non signé).

## 7. La contradiction de `vitruve` (2026-10-23)

`vitruve` a vérifié routes, lignes, libellés et crons : justes, à une ligne
près. Ses objections portaient sur l'ordre des gestes.

| Objection                                                                                                                                   | Rang     | Suite                                                                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Signer avant « Marquer déposé » : si l'outil refuse, aucune issue (retour impossible sur un lot non déposé, `collection-return.ts:111-112`) | BLOQUANT | **corrigée** : « Marquer déposé » avant la signature, refus → annuler sur CENET (§ 2.7) ; PSR1 ou signature ratée après coup **assumé** comme manque (§ 2.8, § 5) |
| « Annuler » possible sur une remise signée → double prélèvement                                                                             | BLOQUANT | **corrigée** par l'ordre (un lot déposé n'est plus annulable) et une règle écrite ; **assumée** côté outil : rien ne l'empêche, inscrit au § 5                    |
| Oubli de « Marquer déposé » sous-estimé ; pas d'alerte                                                                                      | SÉRIEUX  | corrigée (§ 2.7, § 5)                                                                                                                                             |
| Cron 23h55 qui passe deux fois                                                                                                              | SÉRIEUX  | corrigée (§ 2.1)                                                                                                                                                  |
| Consigne J-2 que rien ne fournit                                                                                                            | SÉRIEUX  | corrigée : où lire l'échéance, renseigner 2 j / 13:45 tout de suite (§ 2.6)                                                                                       |
| Avis `en attente` bloque aussi le dépôt                                                                                                     | SÉRIEUX  | corrigée (§ 2.3)                                                                                                                                                  |
| Redépôt tardif : échéance non recalculée pour la limite                                                                                     | SÉRIEUX  | corrigée (§ 4.1), manque au § 5                                                                                                                                   |

Non vérifié par `vitruve` : les numéros de réponses de la banque, le compte
« cinq remises par mois », l'envoi du rectificatif à l'annulation.
