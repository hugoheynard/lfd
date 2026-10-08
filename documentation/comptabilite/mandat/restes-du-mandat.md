# Les restes du mandat : signature, verrou, purge, amendement

> **Doc d'état**, écrite le 2026-10-08 à partir du code (relu ce jour-là). Elle
> remplace le plan du 2026-09-15 (« plan restes du mandat », supprimé ; il
> reste dans l'historique git, et des `migration.sql` le citent encore).
> Trois lots bâtis le 2026-09-15 ; l'**amendement** (§ 4) est conçu et
> **différé** jusqu'à la réponse de la Caisse d'Épargne
> ([`../prelevement/question-banque.md`](../prelevement/question-banque.md)).

## 1. La date de signature dans le fichier (`DtOfSgntr`)

- Le lot écrit `<DtOfSgntr>` après `MndtId`, au **jour local Europe/Paris**
  de `payment_mandates.accepted_at` (`pain008-document.ts`) : la date du
  papier, pas celle de la frappe.
- **Un mandat actif sans date de signature est impossible** : contrainte
  `payment_mandates_active_is_signed` (migration `20260915140000`), et le
  lecteur lève plutôt que d'écarter en silence.

## 2. Le verrou du créancier imprimé

- Dès le **premier mandat frappé**, l'identité imprimée du créancier est
  figée : `LegalEntity.noteFirstMandateIssued(at)` pose
  `first_mandate_issued_at`, et corriger le titulaire du créancier est ensuite
  refusé (`CreditorIdentityIsFrozenError`).
- Port `FirstMandateLedger`, déclaré et implémenté par `accounting`, appelé
  par la frappe **dans son unité de travail** : le verrou et le mandat
  s'écrivent ensemble ou pas du tout ; l'écriture est conditionnelle
  (`WHERE first_mandate_issued_at IS NULL`).
- **Le staff, comme le client, ne peut plus remplacer le RIB sous un mandat
  actif** (`BankAccountBoundToActiveMandateError`, 409) : un changement de
  banque attend l'amendement.

## 3. La purge des pièces jamais valides

Décidé par Hugo le 2026-09-15 : on ne supprime **que** ce qui n'a jamais
prouvé un consentement. Le scan d'un mandat signé est la preuve opposable,
il est gardé.

- Purgés : le scan **remplacé** d'un brouillon, et le scan d'un brouillon
  devenu **caduc** (RIB, zones, schéma, type de paiement).
- La règle est dans l'agrégat : `PaymentMandate.purgeableProofKey()` ne rend
  une clé que pour un mandat jamais signé.
- La suppression part **après** la validation (`mandate-proof-purge.ts`) ;
  absent = succès ; un échec est journalisé sans faire échouer le geste. Fait
  `payment_mandate.proof_purged` (sans la clé), seulement si la suppression a
  réussi.
- **Signer exige la pièce qu'on a vue** : `proofRevision` (empreinte opaque,
  jamais la clé) circule de la vue à la commande de signature, et
  `PaymentMandate.sign` refuse si la pièce a changé entre-temps.

## 4. L'amendement d'un mandat actif — conçu, pas bâti

À confirmer avec la banque avant d'être bâti : les champs exacts et la
séquence après un changement de compte.

- Quand le RIB change sous un mandat actif, le mandat garde un **amendement
  en attente** : IBAN d'origine (scellé), BIC d'origine, nature
  (`same_bank` / `new_bank`). La RUM ne bouge pas ; un second changement
  avant annonce garde l'origine du premier.
- Le lot écrit `AmdmntInd = true` et `AmdmntInfDtls` : `OrgnlDbtrAcct` pour
  `same_bank` ; `OrgnlDbtrAgt = SMNDA` et la séquence `FRST` pour `new_bank`.
- **L'amendement s'éteint au dépôt, pas à l'export.** Le geste « Marquer
  déposé » du lot existe depuis (`CollectionBatch.markDeposited`,
  [`../prelevement/prelevement-automatique.md`](../prelevement/prelevement-automatique.md)) :
  c'est lui qui consommera l'amendement des mandats présents dans le lot.
- Tant qu'il n'est pas bâti, le remplacement du RIB reste refusé sous un
  mandat actif (§ 2).
