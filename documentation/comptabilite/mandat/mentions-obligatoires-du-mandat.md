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
  serveur reste le garde. Une civilité ou une forme de la liste la satisfait.
- Le semis de dev n'en invente pas : la frappe B2B y est refusée, comme elle
  le serait en production sans la mention.

### 4.1 Une liste fermée, pas une saisie libre (Hugo, 2026-10-12)

Constaté : la case recevait « Col Pers SAS » au lieu de « SAS », et le mandat
imprimait le nom du titulaire dans la petite case de la forme. **La règle :
Titulaire = « Col Pers », Forme = « SAS ».**

- **La liste** (`HOLDER_LEGAL_FORM_LABELS`, `packages/contracts/src/legal-form.ts`) :
  « M. », « Mme », « Mlle », puis les **libellés** des formes de l'écran
  Identité (`legalFormSchema` / `LEGAL_FORM_LABELS`) — une seule source, une
  forme ajoutée à l'identité apparaît aussi ici. **Exclues** par une liste
  nommée (`NOT_A_HOLDER_LEGAL_FORM`) : « Micro-entreprise » et
  « Auto-entrepreneur », régimes et non formes — pour le titulaire d'un compte,
  c'est « Entreprise individuelle ». L'écran Identité les garde.
- **« Autre »** ouvre une saisie courte : 12 caractères au plus. Une valeur
  enregistrée hors liste s'y réaffiche telle quelle, sans être effacée.
- **Ce qui s'enregistre et s'imprime est le libellé** (« SAS »,
  « Entreprise individuelle »), jamais la clé (`sas`). Le plus long,
  « Société de droit étranger », fait 25 caractères : la case de 40 les tient.
- **Préremplie** depuis la forme juridique de la société quand la case est
  vide et qu'on n'y a pas touché (`holderLegalFormOf` : `micro` et
  `auto_entrepreneur` proposent « Entreprise individuelle »). Branché sur la
  fiche client staff (section paiement) et sur le panneau RIB de
  `/mon-compte` ; **pas** sur la carte « forme de collecte » de la fiche, qui
  ne reçoit pas la forme de la société.
- **Aperçu** sous le formulaire, tel qu'imprimé : « SAS · Col Pers ».
- **Garde serveur, à l'écriture seulement** —
  `DebtorAccount.assertWritableLegalForm`, appelée par
  `CompanyBankAccount.declare` et `replaceWith`, jamais par `reconstitute` :
  un RIB d'avant la règle reste lisible. Refus `400`
  `HolderLegalFormNotALegalFormError` quand la forme normalisée (casse,
  accents, espaces) **contient le titulaire** normalisé — pour toute valeur —,
  ou quand une saisie **hors liste** dépasse 12 caractères. Le contrat garde
  `max(40)`, borne de relecture.
- ⚠️ Conséquence : un RIB enregistré avec une forme fautive est refusé au
  prochain enregistrement tant qu'on ne la corrige pas — y compris depuis un
  écran qui n'envoie pas le champ (la valeur existante est fusionnée, puis
  vérifiée).
- **L'audit** des RIB enregistrés : `dev-toolbox/audits/rib-holder-legal-form.mjs`,
  lecture seule (transaction `READ ONLY`, aucune colonne d'IBAN lue), URL par
  `DATABASE_LFD_URL`. Il liste société, titulaire et forme pour chaque RIB dont
  la forme contient le titulaire, est hors liste, ou dépasse 12 caractères.
  Base de dev le 2026-10-12 : 0 suspect sur 2 RIB. **La production n'a pas été
  auditée.**

## 5. Ce qui reste ouvert

- La règle de correction du SIREN (§ 3) est **à confirmer par Hugo**.
- `CREATE INDEX companies_siren_idx` a été posé sans `CONCURRENTLY` : table
  modeste, assumé.
