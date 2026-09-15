# Plan — fermer les restes du mandat : signature, verrou, purge, amendement

> **Ouvert le 2026-09-15** à la demande de Hugo (« tout », avant de déployer).
> 🟡 **Lots 1 à 3 construits le 2026-09-15 ; lot 4 (amendement) différé** jusqu'à
> la réponse de la Caisse d'Épargne. Le §8 fait foi sur la construction. Touche le prélèvement et porte des migrations : soumis à
> `vitruve` (§7). Remplace, une fois construit,
> [`todo-mandat-restes-de-la-frappe.md`](todo-mandat-restes-de-la-frappe.md).

## 1. Ce qui existe (vérifié le 2026-09-15)

| Fait                                                                                                                                                                                                           | Où                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Le bloc mandat du `pain.008` écrit `MndtId` et `AmdmntInd` = `false` en dur, sans `DtOfSgntr`                                                                                                                  | `accounting/domain/services/pain008.ts`, `transaction()`                                                      |
| Le port du lot rend `{ reference, iban, scheme, paymentType, bic }` ; le lecteur lit les mandats `active` et le RIB **courant**                                                                                | `accounting/domain/ports/debtor-mandate.reader.ts`, `payments/infrastructure/prisma-debtor-mandate.reader.ts` |
| Un mandat devient actif par `PaymentMandate.sign(at, now)`, qui pose `acceptedAt` ; un mandat Stripe l'a dès l'enregistrement                                                                                  | `payments/domain/entities/payment-mandate.ts`                                                                 |
| `LegalEntity.noteFirstMandateIssued(at)` existe, idempotent, **sans appelant** ; `first_mandate_issued_at` reste nul                                                                                           | `accounting/domain/entities/legal-entity.ts`                                                                  |
| La frappe tire la RUM et écrit le brouillon dans une unité de travail ; elle connaît l'émetteur (`creditorId`)                                                                                                 | `payments/application/mint-mandate-support.ts`                                                                |
| Un scan déposé est rangé sous une clé **horodatée** (`proofKeyFor(companyId, mandateId, now)`) : un remplacement crée un nouvel objet, l'ancien reste                                                          | `payments/application/mandate-proof-support.ts`                                                               |
| La caducité d'un brouillon le révoque sans toucher à sa pièce                                                                                                                                                  | `payments/application/draft-mandate-voiding.ts`                                                               |
| `DocumentStore` n'a que `save`, `read`, `readIfPresent` ; `S3StorageService` (`@lfd/storage`) a `delete`                                                                                                       | `platform/storage/document-store.ts`, `packages/storage/src/S3StorageService.ts`                              |
| Le client ne peut pas remplacer son RIB sous un mandat actif (`BankAccountBoundToActiveMandateError`, 409) ; le staff le peut, et `CompanyBankAccount.replaceWith` rend si le compte a changé — valeur ignorée | `payments/domain/errors/mandate-errors.ts`, `record-company-bank-account.ts`                                  |
| Aucun cycle de prélèvement n'est persisté ni marqué **déposé** : le lot est un XML brouillon téléchargé                                                                                                        | `accounting/http/admin-billing-cycle.controller.ts` — aucun modèle Prisma                                     |
| `prelevement-sepa.md` décrit encore les marqueurs `IBAN-INCONNU`/`MANDAT-INCONNU` et « `RCUR` pour tout le lot », disparus avec le lot par schéma                                                              | `prelevement-sepa.md` §« le fichier »                                                                         |

## 2. Lot 1 — `DtOfSgntr`

- `DebtorMandate.signedAt: Date` ; le lecteur la lit sur `accepted_at`.
- `pain008.ts` écrit `<DtOfSgntr>AAAA-MM-JJ</DtOfSgntr>` après `MndtId`, **date
  locale `Europe/Paris`** (même règle que `CreDtTm`).
- Un mandat actif sans `accepted_at` est **impossible** : la base le refuse
  (`payment_mandates_active_is_signed`, §7 #5), et le lecteur lève s'il en
  trouvait un plutôt que de l'écarter en silence.
- Tests : la date écrite est celle du papier, pas celle de la frappe ; un
  mandat signé le 1er à 00 h 30 à Paris écrit le 1er.

## 3. Lot 2 — le verrou du créancier imprimé

- Port **déclaré et implémenté par `accounting`** : `FirstMandateLedger.note(creditorId, at)`
  — charge l'entité, `noteFirstMandateIssued(at)`, sauve.
- Appelé par la frappe **dans son unité de travail**, avec l'instant de frappe :
  le verrou et le mandat s'écrivent ensemble ou pas du tout. Pas d'abonné : il
  tournerait hors transaction (`BackgroundWork`), et l'événement de frappe ne
  porte pas l'émetteur.
- **Migration de rattrapage** : `first_mandate_issued_at` = plus ancien
  `payment_mandates.created_at` de l'émetteur, pour les entités encore nulles
  qui ont des mandats (aucune en production, des postes de dev en ont).
- Tests : première frappe ⇒ verrou posé ; seconde ⇒ inchangé ; après frappe,
  corriger le titulaire du créancier est refusé (`CreditorIdentityIsFrozenError`).

## 4. Lot 3 — purger les pièces jamais valides

**Décidé par Hugo le 2026-09-15** : on supprime **seulement** ce qui n'a jamais
prouvé un consentement — le scan remplacé d'un brouillon, et le scan d'un
brouillon devenu caduc. Tout scan d'un mandat qui a été signé (`acceptedAt`
non nul) est conservé : c'est la preuve opposable.

- `DocumentStore.delete(key)` ; objet absent = succès (idempotent).
- La règle vit dans l'agrégat : `PaymentMandate.purgeableProofKey()` rend la clé
  seulement pour un mandat **jamais signé** ; sinon `null`.
- Purge **après** la validation de l'unité de travail (l'objet ne peut pas se
  restaurer si la transaction échoue) ; un échec de suppression est journalisé
  et ne fait pas échouer le geste — l'objet reste orphelin, comme aujourd'hui.
- Points de purge : remplacement d'une pièce sur un brouillon (l'ancienne clé),
  caducité d'un brouillon (révocation par RIB, zones, schéma, type).
- Fait au journal `payment_mandate.proof_purged` (sans clé de stockage).

## 5. Lot 4 — l'amendement d'un mandat actif

⚠️ **Règles de la norme, pas d'un guide bancaire en main.** La doc du dépôt
atteste la règle CFONB « `FRST` et `OrgnlDbtrAgt = SMNDA` après un changement de
banque » (`prelevement-sepa.md`) ; le reste — champs exacts, séquence après un
changement de compte dans la même banque — **est à confirmer avec la Caisse
d'Épargne** avant le premier dépôt réel.

### 5.1 Ce qui change sur le mandat

- Quand le **staff** remplace le RIB d'une société dont le mandat est actif, et
  que `replaceWith` rend « compte changé » : le mandat actif enregistre un
  **amendement en attente** — l'IBAN d'origine (scellé), le BIC d'origine, et
  sa nature (`same_bank` si le BIC ne change pas, `new_bank` sinon). La RUM ne
  bouge pas.
- Un second changement avant annonce **garde l'origine du premier** : la banque
  doit apprendre le compte qu'elle connaît, pas un intermédiaire jamais débité.
- Colonnes additives sur `payment_mandates` : `amended_from_iban_sealed`,
  `amended_from_bic`, `amendment_kind` (nullables).

### 5.2 Ce que le lot écrit

- `AmdmntInd` = `true` pour un mandat qui porte un amendement en attente, avec
  `AmdmntInfDtls` :
  - `same_bank` ⇒ `<OrgnlDbtrAcct><Id><IBAN>…</IBAN></Id></OrgnlDbtrAcct>` ;
  - `new_bank` ⇒ `<OrgnlDbtrAgt><FinInstnId><Othr><Id>SMNDA</Id></Othr></FinInstnId></OrgnlDbtrAgt>`,
    et la séquence **`FRST`** pour ce débit (un `PmtInf` par séquence existe déjà).
- Le CSV d'audit le montre (IBAN d'origine masqué).

### 5.3 Quand l'amendement est consommé

Un fichier téléchargé n'est pas un fichier déposé : l'annonce ne peut pas
s'éteindre à l'export. **Nouveau geste staff « lot déposé »** pour un cycle et
un schéma :

- table `billing_cycle_deposits` (`cycle_tag`, `scheme`, `deposited_at`,
  `deposited_by`, unique `(cycle_tag, scheme)`) ;
- refusé si le fichier de ce schéma n'est pas déposable ;
- dans la même unité de travail, efface l'amendement en attente de chaque
  mandat **présent dans ce fichier** ; fait au journal ;
- le tableau de bord montre « déposé le … » et ne propose plus le geste.

## 6. Lots et ordre

| Lot     | Contenu                                                                                                   | Agent     |
| ------- | --------------------------------------------------------------------------------------------------------- | --------- |
| 1       | `DtOfSgntr`                                                                                               | batisseur |
| 2       | verrou du créancier + rattrapage                                                                          | batisseur |
| 3       | purge des pièces                                                                                          | batisseur |
| 4       | amendement + dépôt du lot (API)                                                                           | batisseur |
| 4-écran | bouton « lot déposé » et état au tableau de bord ; mention de l'amendement en attente sur la fiche client | pablo     |

Doc : `prelevement-sepa.md` (marqueurs, séquence, `DtOfSgntr`, amendement), la
todo fermée, `lexique.md` si un sigle entre.

## 7. Contradiction (vitruve)

Rendue le 2026-09-15. Les corrections priment sur les §2 à §5.

| #   | Niveau   | Objection                                                                                                                                                                                                                                                                                             | Correction                                                                                                                                                                              |
| --- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BLOQUANT | « mandats présents dans CE fichier » sans mécanisme : aucun fichier n'est persisté, `buildCycleDraft` prend le cycle de l'horloge (`accounting/application/cycle-draft-support.ts:58-60`) ; un clic tardif recalcule autre chose que ce qui a été déposé et peut effacer un amendement jamais annoncé | figer un manifeste au téléchargement, ou téléverser le XML déposé et y relire `MndtId`/`AmdmntInd` — **ou différer le lot 4** (question à Hugo)                                         |
| 2   | BLOQUANT | `unique (cycle_tag, scheme)` sans l'entité, alors que le code prévoit plusieurs émetteurs                                                                                                                                                                                                             | `unique (legal_entity_id, cycle_tag, scheme)`                                                                                                                                           |
| 3   | BLOQUANT | la purge peut détruire la preuve d'un mandat activé : `save()` écrit sans condition (`payments/infrastructure/prisma-payment-mandate.repository.ts:144-156`), un redépôt client concurrent d'une signature staff réécrit `draft` puis purge la pièce signée                                           | écriture conditionnelle `where status='draft' and proof_storage_key=K0`, purge seulement si elle a tenu                                                                                 |
| 4   | BLOQUANT | l'audit CSV lit la première balise `IBAN` (`pain008-audit.ts`) : `OrgnlDbtrAcct` précède `DbtrAcct`                                                                                                                                                                                                   | lire l'IBAN dans `DbtrAcct` ; colonne « amendement » après « Schéma »                                                                                                                   |
| 5   | SÉRIEUX  | lot 1 : e2e qui insèrent des actifs sans `acceptedAt` (`test/accounting-legal-entity.e2e-spec.ts:441-451`) ; fuseau du `sign` (`sign-mandate.handler.ts:67`)                                                                                                                                          | `CHECK (status <> 'active' OR accepted_at IS NOT NULL)` + fixtures corrigées ; test depuis la commande `AAAA-MM-JJ`                                                                     |
| 6   | SÉRIEUX  | lot 2 : transaction bien partagée, mais `save` de l'entité réécrit toutes les colonnes : un geste concurrent efface le verrou                                                                                                                                                                         | écriture conditionnelle `WHERE first_mandate_issued_at IS NULL`, colonne retirée de `legalEntityColumns` ; port exporté par `accounting.module.ts` ; JSDoc « abonné rejouable » réécrit |
| 7   | SÉRIEUX  | lot 2 : le rattrapage ne sert que les postes de dev et gèle leur créancier sans retour                                                                                                                                                                                                                | **abandonné** : pas de migration de rattrapage, aucune entité de production n'a de mandat                                                                                               |
| 8   | SÉRIEUX  | lot 3 : « jamais signée » lu comme `acceptedAt = null`, alors qu'un scan de brouillon est un papier signé                                                                                                                                                                                             | décision de Hugo relue : l'option retenue nommait exactement « le scan remplacé sur un brouillon, et le scan d'un brouillon devenu caduc » — tenue telle quelle                         |
| 9   | SÉRIEUX  | lot 3 : le staff peut signer une pièce qu'il n'a pas relue (remplacée entre-temps)                                                                                                                                                                                                                    | la signature transporte la clé relue et refuse si elle a changé                                                                                                                         |
| 10  | SÉRIEUX  | lot 3 : pas de point « après commit » quand la comptabilité rend des brouillons caducs dans SA transaction                                                                                                                                                                                            | `voidDraftsOf` rend les clés, la purge part d'`announceVoided`                                                                                                                          |
| 11  | SÉRIEUX  | lot 3 : fait au journal écrit hors transaction peut mentir                                                                                                                                                                                                                                            | fait écrit seulement après une suppression réussie ; échec au log                                                                                                                       |
| 12  | SÉRIEUX  | lot 4 : `FRST` invalide pour `one_off`, cas A→B→A, second changement, rotation, propriétaire de l'IBAN d'origine, BIC d'agence, B2B peut-être « nouveau mandat », pas de retour arrière d'un dépôt, double clic, course client                                                                        | **à trancher avec la banque avant de construire** (question à Hugo)                                                                                                                     |
| —   | MINEUR   | chemins du §1 sans `b2b/` ; faits manquants ; e2e des lots 3-4 ; justifications à reprendre (`prelevement-sepa.md:365`, `:399`, `todo-mandat-core-contre-b2b.md`)                                                                                                                                     | pris dans les lots ; `auditeur-de-justifications` après construction                                                                                                                    |

## 8. Contrat de construction — 2026-09-15

**Tranché par Hugo le 2026-09-15** : l'**amendement est différé** jusqu'à la
réponse de la Caisse d'Épargne (lot 4 non construit) ; en attendant, le **staff
est refusé comme le client** quand il remplace le RIB sous un mandat actif. La
purge porte sur ce que l'option retenue nommait : le scan remplacé d'un brouillon
et le scan d'un brouillon devenu caduc. Le §7 prime sur les §2-§5, ce §8 sur tout.

| Lot                    | Agent     | Contenu                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A — `DtOfSgntr`        | batisseur | contrainte `payment_mandates_active_is_signed` (`CHECK (status <> 'active' OR accepted_at IS NOT NULL)`) ; `DebtorMandate.signedAt` ; `<DtOfSgntr>` entre `MndtId` et `AmdmntInd`, jour local `Europe/Paris` ; fixtures e2e ; test depuis la date `AAAA-MM-JJ` de la commande de signature ; `prelevement-sepa.md` (marqueurs, séquence, `DtOfSgntr`)                                                                                                                                                  |
| B — verrou + RIB staff | batisseur | port `FirstMandateLedger.note(creditorId, at)` déclaré et implémenté par `accounting`, écriture conditionnelle `WHERE first_mandate_issued_at IS NULL`, appelé dans l'unité de travail de la frappe ; `first_mandate_issued_at` retiré des colonnes réécrites par `save` ; pas de rattrapage ; remplacement staff du RIB refusé sous un mandat actif (`BankAccountBoundToActiveMandateError`)                                                                                                          |
| C — purge              | batisseur | `DocumentStore.delete` (absent = succès) ; écriture de la pièce conditionnelle (`status = draft` et clé précédente inchangée, sinon 409) ; `PaymentMandate.purgeableProofKey()` (jamais signé) ; purge après validation, fait `payment_mandate.proof_purged` seulement si la suppression a réussi ; caducités qui rendent les clés à purger ; `PaymentMandateView.proofRevision` (empreinte opaque, jamais la clé) et `signMandatePayloadSchema.proofRevision`, signature refusée si la pièce a changé |
| Écran                  | pablo     | admin : la signature envoie `proofRevision` ; la section RIB staff se désarme sous un mandat actif et dit le geste de sortie                                                                                                                                                                                                                                                                                                                                                                           |
