# Les mentions obligatoires du mandat

> **Doc d'état**, écrite le 2026-10-08 à partir du code (relu ce jour-là). Elle
> remplace le plan du 2026-09-15 (« plan mentions obligatoires du mandat »,
> supprimé ; il reste dans l'historique git, et la migration
> `20260915120000_siren_et_forme_juridique_du_titulaire` le cite encore).
> En production (la migration est sur `main`).

> « On ne peut pas frapper un mandat si on n'a pas les infos obligatoires du
> mandat » — Hugo, 2026-09-15.

**Un mandat ne se frappe pas tant qu'une mention que son formulaire exige
manque.** Les mentions dépendent du schéma de l'émetteur
([`mandat-deux-schemas.md`](mandat-deux-schemas.md)).

## 1. Ce que chaque formulaire exige

| Mention                                     | CORE | Interentreprises | Où elle vit                  |
| ------------------------------------------- | ---- | ---------------- | ---------------------------- |
| Titulaire, adresse, IBAN                    | ✱    | ✱                | RIB                          |
| BIC                                         | ✱    | hors EEE         | RIB                          |
| **Raison sociale du débiteur**              | —    | ✱                | `Company.raisonSociale`      |
| **SIREN du débiteur**                       | —    | ✱                | `Company.siren`              |
| **Civilité / forme juridique du titulaire** | —    | ✱                | RIB `holder_legal_form`      |
| Créancier, ICS, adresse                     | ✱    | ✱                | l'émetteur unique et complet |
| Lieu, date, signature                       | ✱    | ✱                | à la main                    |

## 2. La règle unique

`mintBlockers` (`b2b/payments/domain/services/mint-blockers.ts`) est **la
seule** fonction qui décide : la frappe (staff et client) la lit pour
refuser, les lectures pour l'annoncer.

| Code                        | Quand                                             |
| --------------------------- | ------------------------------------------------- |
| `bank_account_missing`      | aucun RIB déposé                                  |
| `issuer_missing`            | pas d'émetteur unique et complet                  |
| `company_name_missing`      | B2B, raison sociale vide                          |
| `siren_missing`             | B2B, SIREN vide                                   |
| `holder_legal_form_missing` | B2B, RIB déposé sans forme juridique du titulaire |

- Refus : `payments.mandate.mentions_missing` (409), dont le message nomme
  ce qui manque. Les codes ne sortent pas dans le corps du 409
  (`AppErrorFilter`) : les écrans lisent `mintBlockers` dans leurs vues.
- La forme juridique n'est réclamée que sur un RIB **déposé** : sans RIB,
  `bank_account_missing` suffit, un seul geste pour une seule chose à faire.

## 3. Le SIREN de la société

- **Saisi à part**, pas déduit du SIRET (Hugo, 2026-09-15). VO `Siren` dans
  `b2b/account/` (9 chiffres, clé de Luhn), colonne `companies.siren`, index
  non unique (plusieurs établissements partagent un SIREN).
- **Invariant** : si le SIRET est connu, le SIREN est ses 9 premiers
  chiffres ; `Company` refuse une paire contradictoire
  (`legal-registration.ts`). Une correction staff vers un SIRET d'un autre
  préfixe vide le SIREN s'il venait de l'ancien SIRET, le garde s'il avait été
  saisi (`recomputedFor`).
- La migration a rempli le SIREN des SIRET valides existants (Luhn calculé
  sans jamais lever : `ascii(…) - 48`).

## 4. La forme juridique du titulaire

- Champ du RIB, saisi par le staff et par le client
  (`bank-account-form`, `@lfd/b2b-ui`), libellé « Civilité (M., Mme) ou forme
  juridique (SAS, SARL…) ».
- **Obligatoire à l'écran quand l'émetteur est en interentreprises**
  (`holderLegalFormRequired`, lu de `issuerScheme`), facultatif sinon ; le
  serveur reste le garde.
- Le semis de dev n'en invente pas : la frappe B2B y est refusée, comme elle
  le serait en production sans la mention.

## 5. Ce qui reste ouvert

- La règle de correction du SIREN (§ 3) est **à confirmer par Hugo**.
- `CREATE INDEX companies_siren_idx` a été posé sans `CONCURRENTLY` : table
  modeste, assumé.
