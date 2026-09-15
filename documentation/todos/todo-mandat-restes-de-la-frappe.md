# Mandat — ce que la frappe de la RUM n'a pas fermé

> Ouvert le 2026-09-15, en retirant le plan de la tranche « frappe de la RUM » :
> la frappe, le brouillon, l'impression, l'envoi et l'activation sur preuve sont
> en production, et [`../comptabilite/rum.md`](../comptabilite/rum.md) les
> décrit. Restent ces quatre points, vérifiés dans le code ce jour-là.

## 1. 🔴 `DtOfSgntr` n'est pas écrit dans le `pain.008`

`transaction()` dans `pain008.ts` écrit `MndtRltdInf` avec `MndtId` et
`AmdmntInd`, **sans** `DtOfSgntr`. `prelevement-sepa.md` le présentait comme
écrit depuis `PaymentMandate.acceptedAt`.

La date de signature accompagne la RUM dans le bloc mandat de chaque
prélèvement (à confirmer sur le XSD `pain.008.001.02` et le guide de la Caisse
d'Épargne — non vérifié dans le dépôt). Le port `DebtorMandate` ne transporte pas
`acceptedAt` : il faut l'y ajouter, puis l'écrire.

## 2. 🔴 Le verrou du créancier imprimé ne se pose jamais

`LegalEntity.noteFirstMandateIssued(at)` fige le titulaire et l'adresse du
créancier après le premier mandat — et **n'a aucun appelant**. `first_mandate_issued_at`
reste nul : le nom et l'adresse imprimés sur des mandats déjà frappés restent
modifiables, alors que le débiteur a autorisé CE nom-là.

À brancher : un abonné au fait de frappe (`payment_mandate.minted`) côté
comptabilité, qui charge l'émetteur et appelle la méthode — elle est idempotente.

## 3. Les pièces déposées ne se suppriment pas

`DocumentStore` n'a que `save`, `read` et `readIfPresent`. Un scan de mandat
signé porte l'IBAN manuscrit du débiteur, et aucune purge n'est possible — ni
d'un brouillon révoqué, ni d'une pièce remplacée.

## 4. L'amendement d'un mandat actif

Changer de RIB sous un mandat actif n'a pas de mécanisme : `AmdmntInd` est écrit
`false` en dur, et le lot lit le RIB courant. Décrit, avec le geste à décider
avec la banque, dans
[`todo-mandat-core-contre-b2b.md`](todo-mandat-core-contre-b2b.md) (section
« Un mandat ACTIF dont le staff change le RIB »).
