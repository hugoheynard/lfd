# Lexique du prélèvement — les sigles, ouverts une fois

> **Écrit le 2026-09-12**, parce que les trois autres documents de ce dossier
> empilaient des sigles sans jamais les ouvrir. Un document qu'on ne peut lire
> qu'accompagné n'est pas un document.
>
> Il ne décrit aucun code : c'est du vocabulaire de métier et de norme. Il ne
> périme donc pas au rythme du dépôt.

---

## 1. Les acteurs

| Sigle    | Développé                              | Ce que c'est                                                                    |
| -------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| **SEPA** | _Single Euro Payments Area_            | La zone où un paiement en euros obéit aux mêmes règles partout                  |
| **SDD**  | _SEPA Direct Debit_                    | Le **prélèvement**. Deux schémas, voir ci-dessous                               |
| **SCT**  | _SEPA Credit Transfer_                 | Le **virement**. Ce n'est pas notre sujet, mais il partage les formats          |
| **ICS**  | **I**dentifiant **C**réancier **SEPA** | **Notre** matricule de préleveur — `FR00ZZZ…`. C'est lui que le débiteur oppose |
| **RUM**  | **R**éférence **U**nique de **M**andat | Le numéro de **ce** mandat-là. `UMR` en anglais                                 |
| **IBAN** | _International Bank Account Number_    | Le numéro du **compte**                                                         |
| **BIC**  | _Bank Identifier Code_                 | L'identifiant de la **banque** qui tient ce compte                              |

### SDD Core et SDD B2B — la différence qui décide de tout

|                          | **Core**           | **B2B** _(le nôtre)_               |
| ------------------------ | ------------------ | ---------------------------------- |
| Débiteur                 | particulier ou pro | **professionnel uniquement**       |
| Remboursement sans motif | **8 semaines**     | **aucun**                          |
| Le débiteur doit…        | rien de plus       | **déclarer le mandat à sa banque** |

🔴 **Le formulaire n'est PAS le même.** Un mandat B2B porte la mention
« INTERENTREPRISES » et dit expressément que le débiteur ne peut pas se faire
rembourser un prélèvement autorisé ; le mandat CORE accorde au contraire les
8 semaines. ⚠️ **Depuis le 2026-09-15 (en construction), ce dépôt imprime les
DEUX** : l'entité juridique choisit le schéma de ses frappes, chaque mandat fige
le sien, le lot sort un fichier par schéma — voir
[`plan-mandat-deux-schemas.md`](plan-mandat-deux-schemas.md). La
constante unique `SEPA_SCHEME` du 2026-09-14 disparaît. Historique :
[`todo-mandat-core-contre-b2b.md`](todo-mandat-core-contre-b2b.md).

🔴 **C'est le B2B qui rend le prélèvement sûr pour nous, et contraignant pour le
client.** Il ne peut pas se faire rembourser sur simple demande — mais sa banque
**refusera** le premier débit tant qu'il ne lui a pas déclaré notre ICS et la
RUM. Voir [`prelevement-sepa.md`](prelevement-sepa.md).

⚠️ **« B2B » veut dire deux choses dans ce dépôt**, et elles n'ont aucun
rapport : la plateforme de vente aux professionnels
(`apps/lfc-ecommerce-frontend`, `src/b2b/`), et le schéma de prélèvement entre
professionnels. Le contexte
tranche toujours, mais il faut le savoir une fois.

---

## 2. Le fichier

**`pain.008`** est le message que nous déposons à la banque pour demander les
prélèvements. `pain` n'a rien d'anglais courant : c'est **PA**yment **IN**itiation,
une famille de messages de la norme **ISO 20022**.

| Message    | À quoi il sert                                |
| ---------- | --------------------------------------------- |
| `pain.001` | demander des **virements**                    |
| `pain.008` | demander des **prélèvements** — le nôtre      |
| `pain.002` | le **compte rendu** que la banque renvoie     |
| `camt.*`   | _CAsh ManagemenT_ — relevés, retours, impayés |

### Les balises, ou l'anglais sans ses voyelles

La norme abrège en retirant les voyelles. Une fois la règle connue, tout se lit.

| Balise          | Lecture                                 | Ce que ça désigne                           |
| --------------- | --------------------------------------- | ------------------------------------------- |
| `Cdtr`          | **Cr**edi**t**o**r**                    | le créancier — **nous**                     |
| `Dbtr`          | **D**e**bt**o**r**                      | le débiteur — **le client**                 |
| `Acct`          | **Acc**oun**t**                         | le compte                                   |
| `Agt`           | **Ag**en**t**                           | la **banque** qui tient le compte           |
| `CdtrAgt`       | _Creditor Agent_                        | **notre banque** — son BIC                  |
| `DbtrAcct`      | _Debtor Account_                        | le compte à débiter — son IBAN              |
| `MndtId`        | _Mandate Identification_                | la **RUM**, dans le fichier                 |
| `MndtRltdInf`   | _Mandate Related Information_           | le bloc qui l'entoure                       |
| `SeqTp`         | _Sequence Type_                         | voir la section 3                           |
| `AmdmntInd`     | _Amendment Indicator_                   | « ce mandat a été modifié »                 |
| `EndToEndId`    | _End To End Identification_             | la référence qui voyage de bout en bout     |
| `NbOfTxs`       | _Number Of Transactions_                | le nombre d'opérations — la banque recompte |
| `CtrlSum`       | _Control Sum_                           | la somme de contrôle — idem                 |
| `ReqdColltnDt`  | _Required Collection Date_              | la date de débit demandée                   |
| `InstdAmt`      | _Instructed Amount_                     | le montant demandé                          |
| `RmtInf/Ustrd`  | _Remittance Information / Unstructured_ | le libellé libre, 140 caractères            |
| `ChrgBr` `SLEV` | _Charge Bearer / Service Level_         | chacun paie les frais de **sa** banque      |
| `LclInstrm`     | _Local Instrument_                      | `CORE` ou `B2B` — le schéma                 |

---

## 3. La séquence, et le mot qui la complique

Chaque prélèvement déclare **où il se situe dans la série** :

| Valeur | Développé   | Quand                                    |
| ------ | ----------- | ---------------------------------------- |
| `FRST` | _First_     | le **premier** débit d'un mandat         |
| `RCUR` | _Recurrent_ | tous les suivants                        |
| `OOFF` | _One-Off_   | un mandat qui n'autorise **qu'un** débit |
| `FNAL` | _Final_     | le dernier, annoncé comme tel            |

**`SMNDA`** — _Same Mandate, New Debtor Agent_ : « même mandat, nouvelle banque
du débiteur ». C'est ce qu'on écrit quand un client change de banque **sans**
qu'on refasse signer : le mandat survit, sa RUM aussi, et cette valeur prévient
la nouvelle banque qu'elle hérite d'une autorisation existante.

🔴 **La règle, vérifiée à la source (CFONB) le 2026-09-12** : c'est le
**TITULAIRE** du compte qui décide, pas l'IBAN. Titulaire inchangé → le mandat
survit, RUM conservée. Titulaire différent → mandat caduc, **nouvelle RUM**.

---

## 4. Qui écrit les règles

| Sigle         | Développé                                                                        | Rôle                                              |
| ------------- | -------------------------------------------------------------------------------- | ------------------------------------------------- |
| **EPC**       | _European Payments Council_                                                      | écrit le _rulebook_ — la norme européenne         |
| **CFONB**     | **C**omité **F**rançais d'**O**rganisation et de **N**ormalisation **B**ancaires | la transposition française, et la FAQ qui tranche |
| **ISO 20022** | —                                                                                | la norme des **formats** de message               |

⚠️ **Préférer ces deux-là aux blogs.** Le 2026-09-12, deux sites de prestataires
donnaient des réponses **opposées** à « faut-il refaire signer quand le client
change d'IBAN ». La FAQ du CFONB a tranché en trois lignes.

---

## 5. Signature électronique

| Sigle     | Développé                                      | Ce que ça vaut                                 |
| --------- | ---------------------------------------------- | ---------------------------------------------- |
| **eIDAS** | _electronic IDentification And trust Services_ | le règlement européen 910/2014                 |
| **SES**   | _Simple Electronic Signature_                  | recevable, mais la preuve est à notre charge   |
| **AES**   | _Advanced Electronic Signature_                | liée au signataire, détecte l'altération       |
| **QES**   | _Qualified Electronic Signature_               | **la seule** qui vaut une signature manuscrite |

Le détail, et les trois branches encore ouvertes, sont au §12 de
[`prelevement-sepa.md`](prelevement-sepa.md).

---

## 6. Les sigles qui n'ont rien à voir avec la banque

Ils traînent dans les mêmes phrases, d'où leur présence ici.

| Sigle       | Ce que c'est                                                                                    |
| ----------- | ----------------------------------------------------------------------------------------------- |
| **P2002**   | le code Prisma pour « contrainte d'unicité violée »                                             |
| **AOT**     | _Ahead-Of-Time_ — la compilation Angular qui vérifie les **gabarits**, ce que `tsc` ne fait pas |
| **DDL**     | _Data Definition Language_ — le SQL qui change la **forme** des tables, pas leur contenu        |
| **RIB**     | relevé d'identité bancaire : le trio titulaire + IBAN + BIC                                     |
| **AES-GCM** | le chiffrement des colonnes scellées. ⚠️ **Rien à voir** avec l'`AES` des signatures            |
