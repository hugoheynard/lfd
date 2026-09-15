# Plan — SIREN de la société, forme juridique du titulaire, et pas de mandat sans ses mentions

> **Ouvert le 2026-09-15** à la demande de Hugo. 🟠 **Doc-first.** Porte une
> migration de données : soumis à `vitruve` avant construction (§8).

## 0. La demande

> « dans identité légale on va devoir ajouter le siren en plus du siret, on ne
> peut pas frapper un mandat si on a pas les infos obligatoires du mandat » —
> Hugo, 2026-09-15.

Tranché le même jour (questions posées) :

- **le SIREN est un champ saisi à part**, pas déduit du SIRET ;
- **la civilité / forme juridique du titulaire du compte est un champ du RIB**,
  saisi par le staff et par le client.

## 1. Ce qui existe (vérifié le 2026-09-15)

| Fait                                                                                                                                                                                  | Où                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `Company` porte `siret` (VO `Siret` : 14 chiffres, Luhn, **facultatif** à l'ouverture) ; pas de SIREN                                                                                 | `account/domain/entities/company.ts`, `value-objects/siret.ts`                                                           |
| Unicité du SIRET : index **partiel** `siret <> ''`, invisible du schéma Prisma                                                                                                        | migration `20260811160000_unicite_siret_et_interlocuteur`                                                                |
| Deux écritures d'identité : `completeLegalIdentity` (comble les vides — client et staff) et `correctLegalIdentity` (réécrit — **staff seulement**)                                    | `company.ts:268-310`, `update-company-identity.handler.ts`, `admin-company.handlers.ts` (`UpdateIdentityByStaffHandler`) |
| Payload `updateIdentityPayloadSchema` : `raisonSociale`, `formeJuridique`, `siret` à `.default("")` — vide = ne réécrit rien                                                          | `packages/contracts/src/company.ts:56-68`                                                                                |
| Vues servies : `CompanyView.siret`, `AdminCompanyView.siret`                                                                                                                          | `contracts/src/account.ts:83`, `admin-company.ts:46`                                                                     |
| Un VO `Siren` existe **dans `accounting`** (entité juridique émettrice)                                                                                                               | `accounting/domain/value-objects/siren.ts`                                                                               |
| Le RIB (`company_bank_accounts`) : `holder`, adresse, `iban_sealed`, `bic`, zones 14/19 — **aucune forme juridique**                                                                  | `model CompanyBankAccount` ; VO `DebtorAccount`                                                                          |
| Payload RIB : `setCompanyBankAccountPayloadSchema` (`holder` `min(1)`)                                                                                                                | `contracts/src/company-bank-account.ts:35`                                                                               |
| La frappe exige : société connue, RIB présent, émetteur unique complet — **aucune mention du débiteur**                                                                               | `payments/application/mint-mandate-support.ts` (`mintPreconditions`)                                                     |
| Le rendu B2B tire le SIREN du SIRET (`sirenOfSiret`) et laisse la forme juridique du titulaire **vide**                                                                               | `debtor-snapshot.ts`, `customer-mandate-support.ts`, `b2b-mandate-blocks.ts`                                             |
| Formulaires partagés : `company-identity-fields`, `bank-account-form` (`@lfd/b2b-ui`) ; écrans admin `identite-panel`, `bank-account-section` ; client `identity-panel`, `bank-panel` | `packages/b2b-ui/src/company`, `…/payment`                                                                               |

## 2. Les mentions obligatoires, par schéma

Relevées sur les deux formulaires imprimés (astérisques).

| Mention                                     | CORE (EPC) | Interentreprises (DGFiP) | Source                                               |
| ------------------------------------------- | ---------- | ------------------------ | ---------------------------------------------------- |
| Nom du titulaire                            | ✱          | ✱                        | RIB `holder` (déjà exigé)                            |
| Adresse du titulaire                        | ✱          | ✱                        | RIB (déjà exigée)                                    |
| IBAN                                        | ✱          | ✱                        | RIB (déjà exigé)                                     |
| BIC                                         | ✱          | hors EEE seulement       | RIB (déjà exigé)                                     |
| **SIREN du débiteur**                       | —          | ✱                        | **nouveau** `Company.siren`                          |
| **Raison sociale du débiteur**              | —          | ✱                        | `Company.raisonSociale` (peut être vide aujourd'hui) |
| **Civilité / forme juridique du titulaire** | —          | ✱                        | **nouveau** RIB `holderLegalForm`                    |
| Créancier, ICS, adresse créancier           | ✱          | ✱                        | émetteur (déjà exigé : `soleIssuer` complet)         |
| Lieu, date, signature                       | ✱          | ✱                        | à la main — hors frappe                              |

## 3. Décisions proposées

### 3.1 Le SIREN de la société

- VO `Siren` **dans `account`** (9 chiffres, clé de Luhn), pas un import de
  celui d'`accounting` : deux contextes, deux langages ; la duplication est
  une classe de quinze lignes.
- Colonne `companies.siren TEXT NOT NULL DEFAULT ''`, index **non unique** —
  plusieurs établissements (SIRET) partagent un SIREN.
- 🔴 **Invariant dans l'agrégat** : si le SIRET est connu, le SIREN **est**
  ses 9 premiers chiffres. `Company` refuse une paire qui se contredit
  (`SirenSiretMismatchError`, 400, message qui nomme les deux valeurs). Saisir
  un SIRET sur une société sans SIREN **pose** le SIREN ; un SIREN seul, sans
  SIRET, est permis.
- `completeLegalIdentity` et `correctLegalIdentity` gagnent `siren`, avec la
  même règle de vide que les autres champs.
- Payload `updateIdentityPayloadSchema.siren` à `.default("")` : ici le vide
  signifie « ne réécrit rien » dans **les deux** écritures (`company.ts`), donc
  un écran ancien qui ne l'envoie pas n'efface rien — à éprouver par un test.
- Vues `CompanyView.siren`, `AdminCompanyView.siren` (champ ajouté).
- **Migration de données** : `UPDATE companies SET siren = left(siret, 9)
WHERE siret <> ''` — le SIRET validé par Luhn garantit 9 chiffres.

### 3.2 La forme juridique du titulaire

- Colonne `company_bank_accounts.holder_legal_form TEXT NOT NULL DEFAULT ''`
  — rien à remplir : on ne sait pas qui est le titulaire.
- `DebtorAccount.holderLegalForm` (trim, borne de longueur à la case imprimée).
- 🔴 **Payload `holderLegalForm: z.string().trim().max(N).optional()`, PAS
  `.default("")`** : le RIB se réécrit en entier, et un écran encore ouvert sur
  l'ancien bundle **effacerait** la valeur à chaque enregistrement. Absent =
  inchangé. Et une réécriture du RIB rend un brouillon caduc : effacer ce champ
  rendrait aussi un mandat infrappable sans que personne l'ait voulu.
- Formulaire `bank-account-form` : champ « Civilité ou forme juridique du
  titulaire », obligatoire quand l'émetteur est interentreprises, facultatif
  sinon (libellé qui le dit).

### 3.3 La frappe refuse sans ses mentions

- Service de domaine pur `payments/domain/services/mint-blockers.ts` :
  `missingMentions(scheme, debtor): readonly MissingMention[]` ; chaque mention
  manquante porte **son nom et l'endroit où la saisir** (« SIREN — Identité
  légale », « Forme juridique du titulaire — RIB »).
- `mintPreconditions` (staff **et** client) : après le RIB et l'émetteur, lit
  les mentions (`findHolder` rend `siren` et `raisonSociale`, le RIB
  `holderLegalForm`) et lève `MandateMentionsMissingError` (409) avec la liste.
- **Pré-affichage** : `CustomerMandateView` null ⇒ la section client ne sait pas
  quoi manque. Ajouter `mintBlockers: readonly string[]` dans l'enveloppe de
  `GET /companies/:id/mandate-options` (déjà lue à chaque ouverture) et dans la
  vue staff de la section paiement ; les fronts désactivent « Générer » /
  « Frapper » et listent ce qui manque avec un lien vers le dialogue concerné.
- Le rendu B2B lit `siren` et `holderLegalForm` **stockés** ; `sirenOfSiret`
  disparaît.

### 3.4 Ce que ça ne change pas

- Les brouillons déjà frappés restent imprimables (aucun en production).
- Le CORE n'exige rien de nouveau.

## 4. Lots

| Lot | Contenu                                                                                                                                                                                                     | Agent                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| A   | Migration (deux colonnes + remplissage du SIREN) ; VO `Siren` ; `Company` (invariant, deux écritures) ; payloads et vues d'identité ; e2e identité                                                          | batisseur + `lecteur-de-migrations` |
| B   | `DebtorAccount.holderLegalForm`, repository, payload `.optional()`, vues RIB ; `mint-blockers.ts` ; `mintPreconditions` ; `mintBlockers` ; rendu B2B sur les champs stockés ; e2e frappe refusée / acceptée | batisseur                           |
| C   | Fronts : champ SIREN (`company-identity-fields`, admin et client) ; champ titulaire (`bank-account-form`) ; « Générer » / « Frapper » désactivés avec la liste des mentions manquantes                      | pablo                               |

A et B se touchent au rendu (`customer-mandate-support.ts`) : B après A, ou B
code contre `MandateHolder.siren` annoncé.

## 5. Tests qui tiennent le plan

- `Siren` : 9 chiffres, Luhn, espaces tolérés, refus nommés.
- `Company` : SIRET saisi ⇒ SIREN posé ; paire contradictoire refusée ; vide
  n'efface rien (complétion et correction).
- Mentions : B2B sans SIREN / raison sociale / forme juridique du titulaire ⇒
  liste exacte ; CORE sans eux ⇒ vide.
- Frappe : refus 409 listant les mentions, staff et client ; frappe acceptée
  une fois complétées.
- Régression nommée : « un RIB réenregistré sans le champ n'efface pas la
  forme juridique du titulaire ».
- Migration : SIREN rempli depuis un SIRET, vide sans SIRET (e2e sur la base
  migrée).

## 6. Questions ouvertes

1. Le client peut-il **corriger** son SIREN, ou seulement le compléter comme le
   SIRET aujourd'hui ? Proposé : compléter seulement, correction staff.
2. Longueur maximale de la forme juridique du titulaire : proposée 40.

## 7. Ce que ça périme

- `debtor-snapshot.ts` (`sirenOfSiret`), `b2b-mandate-blocks.ts` (forme
  juridique vide), `plan-mandat-deux-schemas.md` §7 Q3/Q4 et §10 (« SIRET vide →
  peigne vide », « forme juridique : vide »).

## 8. Contradiction (vitruve)

Rendue le 2026-09-15. **Les corrections ci-dessous priment sur le §3 et le §4.**

| #   | Niveau   | Objection                                                                                                                                                                                                                                                                                                                                                                                                                | Correction retenue                                                                                                                                                                                                                                                                                            |
| --- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | BLOQUANT | La clé de Luhn d'un SIRET (14 chiffres) ne garantit pas celle de son préfixe : `81245678900021` (11 usages de tests), `nextValidSiret()` (`test/factories.ts:114`), `validSiret()` du semis growth passent en SIRET et échouent en SIREN. `left(siret, 9)` écrirait des SIREN qu'`Siren.create` refuse au chargement                                                                                                     | **Décision de Hugo (Q3)** ; proposé : le SIREN n'est posé depuis un SIRET que si le préfixe est un SIREN valide, sinon il reste vide ; migration idem (Luhn en SQL, ou remplissage applicatif). Requête de comptage en production avant migration. Fixtures régénérées                                        |
| 2   | BLOQUANT | `reconstitute` et les écritures directes (factories, semis, ancien binaire pendant la fenêtre de déploiement) produiront des SIREN vides à côté d'un SIRET                                                                                                                                                                                                                                                               | `reconstitute` **complète** un SIREN vide depuis un SIRET à préfixe valide et **ne lève jamais** pour cette paire ; seule une écriture refuse une contradiction. `siren` ajouté à `factories.ts`                                                                                                              |
| 3   | BLOQUANT | Création oubliée : `Company.declare`, `createCompanyPayload`, `adminCreateCompanyPayload` (`account/http/payloads.ts:48`), et trois écritures colonne par colonne du dépôt (`declareOwnedBy` l.96, `declareUnowned` l.149, `save` l.229)                                                                                                                                                                                 | Lot A les couvre, e2e « créée avec SIRET ⇒ SIREN en base »                                                                                                                                                                                                                                                    |
| 4   | SÉRIEUX  | L'écran admin actuel n'envoie que `siret` (`identite-panel.ts:130`) : une correction du SIRET se heurterait à l'ancien SIREN                                                                                                                                                                                                                                                                                             | `correctLegalIdentity` : un SIRET envoyé sans SIREN **recalcule** le SIREN (règle du §1)                                                                                                                                                                                                                      |
| 5   | SÉRIEUX  | Le refus de frappe sans écran pour saisir SIREN et forme juridique bloque toute frappe B2B (l'émetteur de production est B2B depuis la migration du matin)                                                                                                                                                                                                                                                               | **Lots B et C dans le même déploiement**                                                                                                                                                                                                                                                                      |
| 6   | SÉRIEUX  | `mintBlockers` en `string[]` : seconde vérité (RIB, émetteur omis), pas de code pour le lien, vue staff inexistante (`MandateSectionView` composée dans `admin-mandates.controller.ts:93`)                                                                                                                                                                                                                               | **Une seule fonction pure** rend des **codes** (`bank_account_missing`, `issuer_missing`, `siren_missing`, `company_name_missing`, `holder_legal_form_missing`) ; elle sert la frappe **et** la lecture ; contrat `MintBlocker` ; ajouté à `MandateSectionView` (staff) et à l'enveloppe des options (client) |
| 7   | SÉRIEUX  | `.optional()` sur `holderLegalForm` contredit l'ordre de `record-company-bank-account.ts:50-56` (compte construit avant lecture) ; la justification « rendrait infrappable » est fausse, toute écriture du RIB révoque déjà le brouillon                                                                                                                                                                                 | Le handler **lit le RIB existant puis fusionne** ; justification retirée — reste : un écran ancien n'efface pas une saisie                                                                                                                                                                                    |
| 8   | SÉRIEUX  | `siren` obligatoire dans `CompanyView` / `AdminCompanyView` casse 12 specs et fixtures front dès le lot A                                                                                                                                                                                                                                                                                                                | Fixtures front dans le lot A                                                                                                                                                                                                                                                                                  |
| 9   | SÉRIEUX  | Pas de retour arrière : l'ancien code corrigerait des SIRET sans toucher au SIREN                                                                                                                                                                                                                                                                                                                                        | Retour arrière = redéployer puis recalculer **tous** les SIREN depuis les SIRET à préfixe valide (même règle que la migration), pas seulement les vides                                                                                                                                                       |
| —   | MINEUR   | Staff n'appelle que `correctLegalIdentity` (§1 corrigé) ; commentaire périmé `contracts/src/company.ts:53` ; `Siren` refuse `000000000` ; `@@index([siren])` dans le schéma ; fait `company.identity_corrected` gagne `siren` ; export `customers-csv.ts:71` ; prospects (`Lead.siret` libre) hors champ ; factures et `pain.008` ne lisent pas le SIRET ; le semis dev ne sème pas de SIRET → frappe B2B refusée en dev | Pris dans les lots A et B ; semis dev complété (SIREN, forme juridique du titulaire)                                                                                                                                                                                                                          |

⚠️ Correction du §1 : `completeLegalIdentity` est la complétion **client** ;
le staff n'appelle que `correctLegalIdentity`.

## 9. Contrat de construction — 2026-09-15

**Tranché par Hugo le 2026-09-15** : préfixe de SIRET qui n'est pas un SIREN
valide ⇒ **SIREN laissé vide** ; le client **complète seulement** son SIREN
(correction staff). Longueur de la forme juridique du titulaire : 40. Les §8
priment sur les §3-§5 ; ce §9 prime sur tout.

### 9.1 Règles

- `Siren` (VO dans `account`) : 9 chiffres, clé de Luhn, espaces tolérés, refuse
  `000000000`. `Siren.prefixOf(siret)` rend un `Siren` ou `null` si le préfixe
  n'est pas valide.
- `Company` :
  - SIRET connu et préfixe valide ⇒ le SIREN **est** ce préfixe ; un SIREN saisi
    qui le contredit est refusé (`SirenSiretMismatchError`, 400) ;
  - SIRET connu mais préfixe invalide ⇒ SIREN libre (saisi ou vide) ;
  - `declare` et `completeLegalIdentity` : SIREN posé depuis le SIRET si vide ;
  - `correctLegalIdentity` (staff) : un SIRET envoyé sans SIREN **recalcule** le SIREN ;
  - `reconstitute` complète un SIREN vide depuis un préfixe valide et **ne lève
    jamais** pour la paire SIREN/SIRET.
- Migration unique (lot A) : `companies.siren TEXT NOT NULL DEFAULT ''` +
  `@@index([siren])` ; `company_bank_accounts.holder_legal_form TEXT NOT NULL
DEFAULT ''` ; remplissage du SIREN **en SQL avec la clé de Luhn** sur le
  préfixe, jamais sur un préfixe invalide ni `000000000`.
- RIB : `DebtorAccount.holderLegalForm` (trim, ≤ 40, vide permis) ; le handler
  d'écriture **lit le RIB existant et fusionne** — payload absent = inchangé.

### 9.2 Noms partagés

| Où                                             | Nom                                                                                                                                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/src/company.ts`                     | `siren` dans `updateIdentityPayloadSchema` et les payloads de création (`.default("")`)                                                                                                                                   |
| `contracts/src/account.ts`, `admin-company.ts` | `CompanyView.siren`, `AdminCompanyView.siren`                                                                                                                                                                             |
| `contracts/src/company-bank-account.ts`        | `holderLegalForm: z.string().trim().max(40).optional()` dans `setCompanyBankAccountPayloadSchema` ; `holderLegalForm: string` dans les vues RIB staff et client                                                           |
| `contracts/src/payment-mandate.ts`             | `mintBlockerSchema = z.enum(["bank_account_missing", "issuer_missing", "company_name_missing", "siren_missing", "holder_legal_form_missing"])`, `MintBlocker` ; `MandateSectionView.mintBlockers: readonly MintBlocker[]` |
| `contracts/src/company-bank-account.ts`        | `CustomerMandateOptionsSectionView.mintBlockers: readonly MintBlocker[]`                                                                                                                                                  |
| API                                            | `MandateMentionsMissingError` (409), `blockers: MintBlocker[]`, message qui nomme chaque mention et où la saisir                                                                                                          |
| `payments/domain/services/mint-blockers.ts`    | `mintBlockersOf(input): readonly MintBlocker[]` — **la seule** fonction, lue par la frappe ET par les deux lectures                                                                                                       |

### 9.3 Lots — construits en parallèle, déployés ensemble

- **A (batisseur)** : migration, schéma Prisma, `Siren`, `Company`, dépôt
  (`declareOwnedBy`, `declareUnowned`, `save`, mappers), payloads et vues
  d'identité, fait `company.identity_corrected`, export `customers-csv.ts`,
  `test/factories.ts`, semis, fixtures front qui typent `CompanyView` /
  `AdminCompanyView`, e2e identité et migration.
- **B (batisseur)** : `DebtorAccount`, dépôt et handler du RIB (fusion), vues RIB,
  `mint-blockers.ts`, `mintPreconditions`, `MandateMentionsMissingError`,
  `MandateSectionView` et enveloppe des options, `MandateHolder.siren` (lu en base)
  et rendu B2B sur `siren` / `holderLegalForm` stockés (`sirenOfSiret` supprimé),
  e2e frappe refusée puis acceptée.
- **C (pablo)** : champ SIREN (`company-identity-fields`, admin `identite-panel`,
  client — éditable seulement s'il est vide) ; champ « Civilité ou forme
  juridique du titulaire » (`bank-account-form`, admin et client) ; « Frapper » /
  « Générer » désactivés avec la liste des mentions manquantes et un lien vers le
  dialogue qui les saisit ; libellés fr/en/it côté client.

## 10. Construit le 2026-09-15 — écarts à connaître

| #   | Écart                                                                                                                                                                                                                                                                                                                                                                                         | Lot   |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | **Migration corrigée après le lecteur de migrations** : le calcul de Luhn castait chaque caractère en `::int`, et Postgres ne garantit pas l'ordre d'évaluation d'un `AND` — un seul SIRET mal saisi en production aurait annulé la migration, donc le déploiement. Remplacé par `ascii(…) - 48`, qui ne lève jamais ; l'e2e rejoue le SQL sur des SIRET avec espaces, lettres et trop courts | A     |
| 2   | `CREATE INDEX companies_siren_idx` sans `CONCURRENTLY` (`migrate deploy` est transactionnel) : écritures sur `companies` bloquées le temps de la construction — table modeste, assumé                                                                                                                                                                                                         | A     |
| 3   | Correction staff vers un SIRET à préfixe invalide, sans SIREN : le SIREN est vidé s'il venait de l'ancien SIRET, gardé s'il avait été saisi (`LegalRegistration.recomputedFor`) — **à confirmer par Hugo**                                                                                                                                                                                    | A     |
| 4   | Les codes `blockers` ne sortent pas dans le corps du 409 (`AppErrorFilter` ne sérialise que code, message et faits numériques) : le message les nomme, les écrans lisent `mintBlockers`                                                                                                                                                                                                       | B     |
| 5   | Sans RIB ou sans émetteur, la frappe répond `payments.mandate.mentions_missing` au lieu des anciens codes (aucun front ne les lisait, vérifié par grep) ; `GET /admin/companies/:id/mandate` rend 404 pour une société inconnue                                                                                                                                                               | B     |
| 6   | ~~Le champ « forme juridique du titulaire » est facultatif partout~~ — **corrigé le même jour** (§10.1) : obligatoire à l'écran quand l'émetteur est `B2B` (`holderLegalFormRequired`, admin et client), facultatif sinon ; le serveur reste le garde via `holder_legal_form_missing`                                                                                                         | C     |
| 7   | **En-tête du mandat interentreprises** (demande de Hugo, 2026-09-15) : logo de l'entité à gauche, nom imprimé (`creditorNameOn`), adresse et ICS à droite, filet dessous ; sans logo, l'identité prend la place — `b2b-mandate-pdf.ts` (`letterhead`)                                                                                                                                         | rendu |
| 8   | Semis dev : RIB semé avec la forme juridique du titulaire ; un poste déjà semé garde l'ancien SIRET `81245678900021` (préfixe invalide) et reste sans SIREN jusqu'à un nouveau semis ou une saisie                                                                                                                                                                                            | A, B  |

### 10.1 Retour de Hugo, 2026-09-15 — corrigé

- **Aucune valeur inventée.** Le semis posait `holderLegalForm: "SARL"` faute
  de constante : une donnée fabriquée, que rien dans la société semée ne porte
  (sa raison sociale contient « SAS », ce qui n'en est pas une déclaration).
  Retiré — le RIB semé n'a pas de forme juridique, et la frappe interentreprises
  y est refusée en dev, comme elle le serait en production.
- **Le champ est obligatoire en interentreprises**, pas « facultatif partout ».
  `bank-account-form` reçoit `holderLegalFormRequired` ; il vaut vrai quand le
  schéma de l'émetteur est `B2B` — `issuerScheme` côté client (enveloppe des
  options), et désormais `MandateSectionView.issuerScheme` côté staff, lu par la
  même lecture que `mintBlockers`. Schéma inconnu (`null`) ⇒ non requis à
  l'écran, le serveur reste le garde.
- **Libellé** : « Civilité (M., Mme) ou forme juridique (SAS, SARL…) ».
