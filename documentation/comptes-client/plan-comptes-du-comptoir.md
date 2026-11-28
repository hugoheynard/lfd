# Plan — les comptes du comptoir (doc-first, 2026-11-28)

> 📐 **Doc-first : aucune ligne de code.** Le plan touche l'argent (un crédit
> sans moyen d'encaisser) et une frontière (qui commande à crédit) :
> **`vitruve` avant Hugo** (CLAUDE.md § 9 bis). Chaque affirmation sur
> l'existant cite un fichier ouvert le 2026-11-28.

## 1. En deux mots

La Direction veut qu'un agent du comptoir puisse **ouvrir un compte pro
incomplet** — sans SIRET vérifié, sans RIB, sans mandat — et y **commander
au compte tout de suite**. Le commerce **convertit** ensuite ce compte en
compte normal, depuis une page qui liste ces comptes et ce qu'ils doivent.

```mermaid
flowchart LR
  A[Agent du comptoir] -->|ouvre| B[Compte ouvert au comptoir]
  B -->|commandes au compte, par le comptoir seulement| C[Encours dû]
  B -->|le commerce complète SIRET + adresse| E[Compte converti : pending ou active]
  E -->|l'encours entre dans la facture du mois, virement| D[Le client paie]
```

### Décisions de Hugo du 2026-11-28

| #   | Question                        | Réponse                                                                          |
| --- | ------------------------------- | -------------------------------------------------------------------------------- |
| D1  | Qui ouvre et commande au compte | **Les agents du comptoir**, et seulement eux (pas le client depuis la boutique)  |
| D2  | Le statut                       | **« Ouvert au comptoir »**, un état nommé                                        |
| D3  | Plafond                         | **Réglage**, par défaut **aucun**                                                |
| D4  | Réconcilier                     | **Une page de l'espace commerce, une table** des comptes à convertir, avec le dû |
| D5  | Moyen d'encaissement            | **Virement obligé**                                                              |
| D6  | Droit                           | **Une ressource « les comptes du comptoir »**                                    |

## 2. Ce qui existe (ouvert le 2026-11-28)

- **Le crédit** se juge dans `accountStanding`
  (`apps/lfd-api/src/lafoliecoffee/orders/application/services/order-settlement.ts:166`) :
  société **`active`** (et payeur actif, `settlingStatusOf`) **et**
  `settlesOnAccount` du payeur. Sinon `TermsNotGrantedError`.
- **`settlesOnAccount`** (`prisma-order-guard.reader.ts:49`) lit
  `grantedTerms` (non vide) et `directDebitBlockedAt` ; l'agrégat a la même
  règle (`company.ts:746`). `DeferredTerm` n'a qu'une valeur, `monthly`
  (`prisma/schema/public/account.prisma:6`).
- **Les statuts** : `pending | active | suspended | terminated`
  (`account.prisma:32`). Rien entre « inscrit en ligne » et « validé ».
- **Le virement existe** comme moyen d'encaissement d'un payeur :
  `PayerCollectionMeans` (`prisma/schema/public/collection-means.prisma`),
  historique append-only, motif obligatoire, **aucune ligne = prélèvement**.
  La facture du mois prend l'échéance du virement quand le moyen est
  `SEPA_CREDIT_TRANSFER` (`monthly-invoice-issuance.ts:123`). Doc :
  [`../comptabilite/le-paiement-par-virement.md`](../comptabilite/le-paiement-par-virement.md).
- **Le comptoir a sa propre garde du crédit** : `staff-settlement-refusal.ts`
  reçoit `atCounter` et passe par `counterStatusRefusalOf` (`:171`), qui
  refuse tout statut autre que `active` (`company_inactive`). La boutique,
  elle, passe par `accountStanding`.
- **La facture exige un SIREN et une adresse** :
  `accounting/domain/services/invoice-issuance-blockers.ts:246`
  (`buyer_siren_missing`) et `:271` (`buyer_address_missing`).
- **Le mode de facturation** : aucune ligne `payer_billing_mode` = mensuel
  (`billing-mode.prisma:30`) ; rien à écrire à l'ouverture.
- **Le comptoir crée déjà des clients** : `register-counter-particular`
  (particuliers) et `admin-counter-customers.controller.ts` (lecture).
  Aucune création de société pro au comptoir.
- **La règle du 2026-11-05** (`plan-pros-en-cours-d-inscription.md` § 0 bis) :
  « le seul truc qu'on ne peut pas faire sur un pending, c'est au compte ».
  **Elle reste vraie** : un compte ouvert au comptoir n'est pas un pending.

## 3. Le modèle

### 3.1 Un statut, pas un drapeau

`CompanyStatus` gagne **`counter_opened`** (migration additive d'une valeur
d'enum). Pourquoi un statut plutôt qu'une colonne `opened_at_counter` sur un
`pending` : la garde du crédit lit le statut, et un drapeau ferait de chaque
lecteur de `pending` un lecteur à revoir. Un statut neuf est refusé partout
où on ne l'a pas admis — c'est le sens sûr (mémoire « interdire plutôt que
vérifier »).

- **Factory** : `Company.openAtCounter({ enseigne, contact, … }, by, at)`.
  Exige un nom d'usage et un contact joignable. **N'exige pas** SIRET,
  adresse de facturation, KBIS, RIB ni mandat (Q1, Hugo, 2026-11-28 :
  « plafond seul »).
- **Les lignes au prix pro** (Hugo, 2026-11-28) : une commande d'un compte
  du comptoir fige ses lignes avec la réduction de l'audience pro, comme
  toute commande pro, **de manière optimiste** (Hugo, 2026-11-28) : on
  suppose le compte pro avant que le commerce l'ait vu. Le snapshot ne
  change pas à la conversion ; un compte refusé ensuite garde ses lignes au
  prix pro (aucun re-tarif — lecture du mot « optimiste » à confirmer).
- **Pas facturable avant conversion** : sans SIREN ni adresse, l'émission
  du mois le bloque (§ 2). L'encours s'accumule sans facture ni échéance ;
  **le plafond (§ 3.3) est le seul frein**, et il est vide par défaut — un
  compte du comptoir est donc, par défaut, un crédit sans borne ni facture.
  C'est assumé ; la page du § 4 est le seul endroit qui le montre.
- **La conversion exige SIRET et adresse de facturation** : c'est ce qui rend
  l'encours facturable. Les commandes déjà passées entrent dans la facture de
  la période de leur clôture suivante (à vérifier en K5 : une commande d'une
  période close reste-t-elle facturable plus tard ?).
- **Transitions** : `counter_opened → pending` (le commerce complète la
  fiche ; le parcours d'activation normal reprend) ou `→ active` directement
  si le verdict d'activation existant (`plan-mon-compte-a-completer.md`) est
  vert — aucune garde neuve ; `→ terminated` comme les autres. Jamais
  `pending → counter_opened`.
- **Audience** : pro (`audienceOf` rend `b2b`), comme un pending.
- **Aucun membre** tant que `counter_opened` : l'invitation d'un membre est
  refusée par l'agrégat (le client n'a pas d'espace avant conversion).
- **Ce que « refusé partout » demande** : le statut est recopié dans des
  types fermés qui ne dérivent pas de l'enum — `account/domain/value-objects/company-status.ts`,
  `orders/domain/ports/company-status.reader.ts`,
  `shared/company-standing/domain/company-standing.ts`,
  `packages/contracts/src/customer-sheet.ts` — et `CompanyStatus` apparaît
  dans 52 fichiers hors tests (compté par `vitruve` le 2026-11-28). Les
  tests `!== "pending"` (`company.ts:684`, `:1001`) ouvriraient un
  comportement : K1 les revoit un par un.

### 3.2 Le crédit d'un compte du comptoir

**Seule `counterStatusRefusalOf` admet `counter_opened`** (D1).
`accountStanding` — le chemin de la boutique — **ne change pas** : il rend
`none` pour `counter_opened`, et un e2e le tient. Aucun paramètre de canal
n'entre dans la garde de la boutique.

À l'ouverture, dans la même transaction :

- `grantedTerms = [monthly]` ;
- une ligne `PayerCollectionMeans` **`bank_transfer`**, motif « ouvert au
  comptoir » (D5) — à l'émission, ce moyen devient le code `"58"`
  (`SEPA_CREDIT_TRANSFER`, `invoice.types.ts:145`) ; K3 vérifie la traduction
  en e2e jusqu'à la facture émise. Sans elle, la facture se lirait « prélèvement sans mandat »
  et bloquerait le dépôt.

Le virement est **obligé** tant que le statut est `counter_opened` :
`setCollectionMeans(sepa_debit)` est refusé avec un message qui dit de
convertir le compte d'abord. **À la conversion**, le moyen reste le
virement ; le passage au prélèvement est un geste distinct du commerce, une
fois le mandat signé, avec son motif.

### 3.3 Le plafond (D3)

Un réglage `counterAccountCeilingCents` (entier, `null` = aucun, défaut
`null`). S'il est posé, la passation au compte d'un `counter_opened` est
refusée quand **encours non réglé + total de la commande > plafond**, par une
`BusinessError` qui nomme l'encours et le geste (« convertir le compte » ou
« encaisser par carte »). **L'encours n'a pas de lecture aujourd'hui** (cherché par `vitruve`).
K4 la crée : les commandes au compte non encore facturées (propriétaire :
`orders`) + les factures non réglées (propriétaire : `accounting`), deux
lectures nommées par lot, composées par la page et par la garde.

### 3.4 Le droit (D6)

Une valeur `StaffResource` **`b2b_counter_accounts`** (préfixe `b2b_`
assumé : c'est celui de toutes les ressources du bloc, une valeur ne se
renomme pas), ajoutée par migration
**sans aucun droit à un rôle** (`lint:no-role-grants-in-migrations`) ;
accordée à l'écran. Elle couvre : ouvrir un compte au comptoir, et passer une
commande au compte pour lui. La page de conversion (§ 4) demande le droit
des comptes clients existant, pas celui-ci.

### 3.5 La preuve d'identité (Hugo, 2026-11-28)

À l'ouverture, l'agent **photographie une pièce** avec l'appareil photo de
l'appareil : carte d'identité, permis, carte bancaire ou carte Vitale —
n'importe laquelle. La photo est obligatoire pour ouvrir le compte, rangée au
stockage (comme le KBIS), visible du commerce sur la page du § 4.

✅ **Les quatre pièces sont gardées** (Hugo, 2026-11-28), en connaissance
des deux risques ci-dessous, écrits pour qu'ils restent visibles. K2 réduit
ce qu'il peut : accès au seul droit du commerce, purge datée, aucune photo
dans un journal ni un e-mail, aucune lecture du numéro (pas d'OCR).

Les risques assumés :

- **Carte bancaire** : une photo porte le numéro complet, la date et le nom.
  La garder fait entrer notre stockage dans le périmètre PCI DSS, que le
  dépôt évite entièrement (Stripe tient les cartes). L'écran invite à masquer
  les chiffres du milieu avant la prise (non vérifiable).
- **Carte Vitale** : elle porte le NIR (numéro de sécurité sociale), dont le
  traitement est encadré strictement (décret « cadre NIR ») et n'est pas
  admis pour identifier un client commercial.
- **Carte d'identité et permis** : admissibles, mais donnée personnelle à
  déclarer : finalité (identifier qui ouvre un crédit), durée de
  conservation (proposée : jusqu'à la conversion + 3 mois, puis purge),
  accès restreint (droit du commerce seulement). Une ligne au registre RGPD.

Mécanisme : le même que les photos des notes du commercial
(`shared/photo-cards/`, stockage + vignette), à vérifier en K2.

## 4. La page « Comptes du comptoir » (D4)

Dans l'espace commerce du back-office : une table, une ligne par société
`counter_opened` (hors supprimées, `lint:company-archived-views`).

| Colonne           | Source                                                  |
| ----------------- | ------------------------------------------------------- |
| Enseigne, contact | la société                                              |
| Ouvert le, par    | la trace d'ouverture                                    |
| Commandes         | nombre de commandes au compte                           |
| **Dû**            | encours non réglé (facturé + pas encore facturé), en €  |
| Ce qui manque     | le verdict d'activation existant (SIRET, KBIS, mandat…) |
| Action            | **Convertir** → la fiche, puis `pending` ou `active`    |

Le dû vient d'une lecture nommée de `accounting`, par lot (une requête pour
la page, pas une par ligne). Total du dû en pied de table.

## 5. Lots

| Lot | Contenu                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1  | Statut `counter_opened`, factory, transitions, tests domaine ; revue de tous les lecteurs du statut                                                                 |
| K2  | Photo de la pièce d'identité (§ 3.5) ; ressource `b2b_counter_accounts` ; route et écran « ouvrir un compte pro » au comptoir ; virement et `monthly` à l'ouverture |
| K3  | Garde du crédit : `counter_opened` admis au comptoir seulement ; virement obligé ; e2e (boutique refusée, comptoir admis)                                           |
| K4  | Réglage du plafond et refus ; lecture de l'encours                                                                                                                  |
| K5  | Page « Comptes du comptoir » et conversion                                                                                                                          |

## 6. À vérifier (pour `vitruve`)

1. Tous les lecteurs de `CompanyStatus` (switchs exhaustifs, `audienceOf`,
   promotions lues sur le statut, mur de la boutique, `isOrderable`) : que
   rend chacun pour `counter_opened` ?
2. ✅ **Écartés de la facturation** (Hugo, 2026-11-28) : tant que le commerce
   ne l'a pas vu — c'est-à-dire converti —, un compte `counter_opened` n'est
   pas un payeur du mois. La sélection des payeurs l'exclut **par son
   statut**, dans la requête ; il ne bloque donc jamais la clôture des
   autres. K1 le tient par un e2e (une clôture avec un compte du comptoir
   émet les factures des autres).
3. ✅ Connu : `atCounter` dans `staff-settlement-refusal.ts` (§ 3.2).
4. ✅ Tranché : la conversion exige SIRET et adresse, donc l'encours d'un
   compte converti puis refusé reste facturable et réglable par virement.
   Le recouvrement est celui d'une facture impayée. Un compte jamais
   converti n'a, lui, aucun recouvrement outillé : il reste sur la page.
5. ✅ **Q1 (Hugo, 2026-11-28)** : rien n'est exigé à l'ouverture ; plafond seul.
6. Le client peut-il se connecter à ce compte avant conversion (membre,
   invitation) ? ✅ Non (§ 3.1).
