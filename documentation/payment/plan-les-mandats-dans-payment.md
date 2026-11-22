# Plan — les mandats SEPA rejoignent `payment` (marches 0 à 2)

> 📐 **Plan**, écrit le 2026-11-22 à la demande de Hugo (« fais un plan, en
> lisant le code »). Il couvre les **marches 0 à 2** du déménagement des
> mandats (lot D3 de
> [`prelevement-et-virement-dans-payment.md`](prelevement-et-virement-dans-payment.md)) :
> le **code** déménage, **les tables ne bougent pas**. La marche 3 (les
> tables) et D4 (les lots, le `pain.008`) sont hors de ce plan. Argent et
> frontière : contredit par `vitruve` avant Hugo. **Rien n'est décidé ni
> planifié dans le temps** : Hugo a demandé le plan, pas le bâti.

> ⏸️ **SUSPENDU le 2026-11-22**, après contradiction par `vitruve` : le plan
> ne tient pas tel qu'écrit (§6). Le déménagement des mandats est d'abord
> une **décision de conception** — un mandat connaît la société, et le bloc
> `payment` ne connaît que des sujets opaques — à reprendre quand une
> deuxième application devra prélever. Rien n'a été bâti ; le prélèvement
> n'a pas été touché. Les §1 et §2 ci-dessous gardent leurs erreurs,
> corrigées au §6 : lire le §6 d'abord.

# Partie 1 — L'explication simple

Le prélèvement SEPA a deux moitiés :

- **les mandats** — l'autorisation signée par le client de prélever son
  compte, avec son IBAN (scellé) et sa référence unique (RUM) ;
- **les lots** — ce qu'on prélève chaque mois, et le fichier `pain.008`
  envoyé à la banque.

Les deux vivent dans le commerce. Ce plan ne déplace **que le code des
mandats**, en trois marches où **aucune donnée ne bouge** :

```mermaid
flowchart LR
  M0["Marche 0<br/>le fichier témoin :<br/>le pain.008 d'aujourd'hui, gardé"] --> M1["Marche 1<br/>la porte :<br/>la facturation et la croissance<br/>ne lisent les mandats que par elle"]
  M1 --> M2["Marche 2<br/>le code déménage<br/>dans payment/sepa-debit/,<br/>derrière la même porte"]
  M2 -.->|"plus tard, hors plan"| M3["Marche 3<br/>les tables"]
```

**Ce qui protège le prélèvement** : avant de commencer, on enregistre le
fichier `pain.008` que le système produit aujourd'hui pour un lot de test.
Après chaque marche, la CI refait le même lot et **refuse la marche si un
seul octet du fichier change** (hors date de création). Une marche qui ne
touche que des branchements ne peut pas passer en changeant ce que la banque
reçoit.

**Le risque restant**, dit franchement : une erreur de branchement qui
ferait échouer un geste du staff (signer, révoquer, envoyer un mandat) sans
changer le fichier. Les e2e existants des mandats la verraient ; la CI les
lance tous.

# Partie 2 — La technique

## 1. Ce qui existe (ouvert le 2026-11-22)

### 1.1 Le contexte

`apps/lfd-api/src/lafoliecoffee/payments/` : environ 9 700 lignes hors
tests, dont les **demandes de paiement libres** (`free-charge/`,
`payment-link*`, à ne pas déplacer) et, pour le reste, **les mandats et le
compte du débiteur** : agrégats `PaymentMandate` (`domain/entities/payment-mandate.ts`,
404 lignes) et `CompanyBankAccount` ; les gestes frapper, signer, envoyer,
révoquer, joindre une preuve, régler les options ; le document du mandat ;
les contrôleurs `admin-mandates`, `company-mandate`, `admin-company-bank-account`,
`company-bank-account` ; les réglages de comptabilité (`accounting-settings`,
qui portent aussi le plafond des liens libres).

### 1.2 Ce que les mandats prennent à la facturation

Imports de `lafoliecoffee/payments` vers `lafoliecoffee/accounting`
(décomptés le 2026-11-22, hors tests) :

| Symbole                                   | Nature                                                           | Où il doit aller                                                                                                                                                              |
| ----------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Iban`, `Bic`, `InvalidIbanError`         | objets-valeurs bancaires                                         | **`payment`** : ce sont des formes bancaires ; la facturation les importera par le canal                                                                                      |
| `Rum`, `SepaScheme`, `MandatePaymentType` | objets-valeurs du mandat                                         | **`payment`**                                                                                                                                                                 |
| `LegalAddress`                            | adresse légale                                                   | reste à la facturation (identité) ; le mandat reçoit une adresse par un type du canal                                                                                         |
| `CreditorReader`, `CreditorSnapshot`      | le créancier : IBAN, ICS, nom de l'entité                        | **reste avec l'entité** (décision de Hugo du 2026-11-22) : `payment` **déclare** le port, la facturation l'implémente (`prisma-creditor.reader.ts`), `appBootstrap` les relie |
| `LegalEntityLogoReader`, `readEntityLogo` | le logo imprimé sur le document du mandat                        | idem : port déclaré par `payment`, implémenté par la facturation                                                                                                              |
| `FirstMandateLedger`                      | « ce mandat a-t-il déjà été prélevé ? » (séquence `FRST`/`RCUR`) | port déclaré par `payment`, implémenté par la facturation (`prisma-first-mandate-ledger.ts`), qui tient les lots                                                              |
| `printOptionalZones`, `bankExportBicOf`   | services de mise en forme                                        | à trier à la lecture : ils suivent l'objet-valeur qu'ils servent                                                                                                              |
| `NoIssuerError`                           | erreur de la facturation                                         | remplacée par une erreur du bloc                                                                                                                                              |
| `AccountingModule`                        | import de module Nest                                            | disparaît : les ports se relient dans `appBootstrap`                                                                                                                          |

### 1.3 Ce que la facturation et la croissance prennent aux mandats

- **Quatre ports déclarés par la facturation, implémentés par les mandats**,
  reliés dans `appBootstrap/` (`debtor-mandate.module.ts`,
  `issued-mandates.module.ts`…) : `DebtorMandateReader`,
  `MandatesForBankExportReader`, `AccountsForBankExportReader`,
  `IssuedMandatesReader`. **La forme est déjà celle d'un canal**, mais à
  l'envers : c'est le lecteur qui déclare. Dans `payment`, c'est le bloc qui
  publie ses lectures (« le propriétaire parle de ce qui est à lui », §3 du
  `CLAUDE.md`).
- **Une lecture Prisma directe hors du propriétaire** :
  `lafoliecoffee/growth/infrastructure/sales-sheet-steps.batch.ts:51-52` lit
  `companyBankAccount` et `paymentMandate`. Aujourd'hui aucune porte ne la
  voit (même bloc). Dans `payment`, `lint:prisma-model-ownership` la
  refuserait : elle passe par une lecture publiée.
- `appBootstrap/site-mandate-revocation.module.ts`, `card-payment-feed.module.ts`,
  `pay-link-feed.module.ts` et trois semis de `dev/` importent le contexte.

### 1.4 Le chiffrement des IBAN — vérifié, pas de piège

`AesGcmFieldCipher` (`platform/crypto/aes-gcm-field-cipher.ts`) chiffre avec
la clé globale `FIELD_ENCRYPTION_KEY`, sans donnée associée (`setAAD`
n'apparaît pas) : le scellé ne dépend ni de la table ni de la colonne.
Déplacer le code — et plus tard les tables — ne rend aucun IBAN illisible.

### 1.5 Les tests qui produisent un `pain.008`

Le document est éprouvé **par morceaux** : `pain008.spec.ts`,
`pain008-xsd.spec.ts` (validation au schéma), `pain008-audit.spec.ts`,
`pain008-document-bounds.spec.ts`, et les e2e du prélèvement d'essai
(`collection-test-generate`, `collection-test-file`). **Aucun fichier
témoin** d'un lot complet n'existe. Le dépôt a le modèle à copier :
`test/pricing-golden-master*.ts` et son `pricing-golden-master.snapshot.json`.

## 2. Les marches

### Marche 0 — le fichier témoin (avant tout le reste)

- Un e2e `test/collection-golden-master.e2e-spec.ts` : il sème par les
  **vrais handlers** un créancier confirmé, trois clients (un `FRST`, un
  `RCUR`, un sous-compte rattaché au mandat du principal), leurs mandats
  signés, des factures au prélèvement ; il constitue un lot par le geste
  réel ; il capte le XML `pain.008` et le normalise (date de création,
  identifiants tirés au hasard remplacés par des jetons stables).
- Le XML normalisé est rangé dans `test/collection-golden-master.snapshot.xml`
  et comparé **au caractère près**. Un changement du fichier exige de
  réécrire le témoin dans un commit à part, qui le dit.
- Le même e2e capte aussi les **exports bancaires** (comptes et mandats) et
  le document PDF d'un mandat (texte extrait), pour que la marche 2 ne puisse
  pas changer ce que le client signe.
- **Livrée seule**, sans rien toucher d'autre : elle doit être verte sur le
  code d'aujourd'hui.

### Marche 1 — la porte, sans déplacer le code

Le code des mandats reste dans `lafoliecoffee/payments/`. On change **qui
déclare quoi** :

1. Les objets-valeurs bancaires et du mandat (`Iban`, `Bic`, `Rum`,
   `SepaScheme`, `MandatePaymentType` et leurs erreurs) passent dans
   `payment/sepa-debit/domain/value-objects/`, exportés par
   `payment/channels/`. La facturation et les mandats les importent de là.
   Le code est **déplacé tel quel**, sans un caractère changé hors imports.
2. `payment/channels/` **déclare** les ports dont les mandats ont besoin
   (`CreditorReader`, `LegalEntityLogoReader`, `FirstMandateLedger`) ; la
   facturation garde ses implémentations, reliées dans `appBootstrap/`.
3. Les quatre lecteurs aujourd'hui déclarés par la facturation deviennent
   des **lectures publiées** de `payment/channels/` ; leurs implémentations
   restent où elles sont jusqu'à la marche 2.
4. La croissance lit par une lecture publiée au lieu de Prisma.
5. Les mandats n'importent plus rien de l'intérieur de la facturation, ni
   `AccountingModule`.

À la fin : le fichier témoin est identique, et une **porte** (la carte des
sous-contextes du commerce, ou une entrée de `context-boundaries`) refuse
tout nouvel import de l'intérieur de la facturation depuis les mandats.

### Marche 2 — le code déménage

1. Le code des mandats et du compte du débiteur passe de
   `lafoliecoffee/payments/` à `payment/sepa-debit/`, par `git mv`, imports
   seulement. Les demandes de paiement libres et les réglages de
   comptabilité **restent**.
2. Les contrôleurs : leurs routes ne changent pas (`admin/…/mandate`,
   `companies/…/mandate`) — un contrat servi ne bouge pas pour un
   déménagement de dossier.
3. `lint:prisma-model-ownership` : les modèles `PaymentMandate` et
   `CompanyBankAccount` appartiennent désormais à `payment/sepa-debit/`.
4. Les tables restent dans `public`, avec leurs clés étrangères vers
   `companies` et `legal_entities` : la marche 3 les traitera.
5. À la fin : fichier témoin identique, e2e des mandats verts.

## 3. Ce qui reste à trier à la lecture du bâti

- Le droit d'accès des écrans (`StaffResource` des mandats) : il ne change
  pas de nom (une valeur écrite ne se renomme pas).
- Les faits de journal des mandats (`payment_mandate.*`) : valeurs écrites,
  inchangées.
- Les cloches (`mandate-staff-bell.ts`) : elles suivent le code.
- Les e-mails envoyés par les mandats : le bloc `payment` a déjà droit au
  canal `mail/channels/` (matrice du `CLAUDE.md`).
- Les droits RGPD (`rgpd-registre.json`) : les colonnes ne bougent pas, la
  « finalité » peut citer le nouveau dossier.

## 4. Le déploiement

Chaque marche est **un déploiement à part**, sans migration. Fenêtre :
juste **après** un dépôt de lot à la banque, loin du suivant, jamais pendant
qu'un lot attend son échéance. Après chaque déploiement, Hugo vérifie :
ouvrir un mandat au back-office, son document, et la liste des mandats à
exporter.

## 5. Questions ouvertes

| Question                                                                                                                                                                         | À qui              |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Le calendrier : maintenant, ou quand une deuxième application prélèvera ?                                                                                                        | Hugo               |
| Les réglages de comptabilité (`accounting-settings`) : ils portent le plafond des liens libres et des réglages de prélèvement ; les couper en deux à la marche 2, ou plus tard ? | à trancher au bâti |

## 6. Ce que `vitruve` a contredit (2026-11-22)

**BLOQUANT**

1. **La marche 2 n'est pas un simple déménagement.** Le code des mandats
   importe aussi `account` (les gestes de site, le port de révocation des
   mandats de site, `AccountModule`), `lafoliecoffee/shared` (`company-standing`,
   seule lecture admise du rôle dans une société, et l'acteur client des
   intentions) et `orders` (`ORDER_CARD_SUBJECT_TYPE` dans
   `admin-mandates.controller.ts`). La matrice n'autorise à `payment` que
   `staff`, `platform` et `mail`.
2. **Il lirait la table des sociétés** (`prisma-mandate-debtor.reader.ts`,
   `prisma-payment-mandate.repository.ts`, relations `company` et `debtor`),
   qui appartient au commerce.
3. **Un mandat connaît la société** : rangé par `companyId`, servi par
   `admin/companies/:companyId/mandate` et `companies/me/…`, gardé par le
   rôle dans la société, les accès fonctionnels et les gestes de site. Le
   bloc `payment` ne connaît que `(subject_type, subject_id)`. **C'est une
   décision de conception, pas un déménagement.**
4. **Le §1 est faux** sur ce que les deux se doivent :
   - **sept** ports déclarés par la facturation et branchés sur les mandats,
     pas quatre (`CollectionMandatesReader`, qui alimente le `pain.008`,
     `MandateRecheckReader`, et `IssuedDraftMandates`, qui est une
     **écriture** : l'annulation des brouillons) ;
   - **`FirstMandateLedger` n'a rien à voir avec `FRST`/`RCUR`** : c'est le
     verrou du créancier imprimé (« premier mandat frappé sous une entité »),
     écrit dans la transaction de la frappe. Erreur de l'auteur du plan, qui
     l'a déduite du nom ;
   - **le document du mandat est dessiné par la facturation**
     (`sepa-mandate-pdf.ts` et ses gabarits), pas par les mandats.

**SÉRIEUX**

5. **Le témoin est aveugle ou instable** : la RUM est tirée au hasard,
   `DtOfSgntr` et `ReqdColltnDt` dépendent du jour, `MsgId`/`PmtInfId`/`EndToEndId`
   dérivent de l'identifiant du lot ; le cas `RCUR` demande un premier lot
   déposé ; il ne voit ni les faits `payment_mandate.*`, ni les cloches, ni
   l'e-mail, ni le verrou du créancier, ni les gardes du RIB ; aucun outil
   n'extrait le texte d'un PDF. Un témoin au niveau du domaine (pur)
   coûterait moins cher qu'un e2e.
6. **Des portes nomment les chemins en dur** (`mail-receipt-admitted.mjs`,
   `intent-key-gestures.mjs`, `journal-tracked.mjs`) : elles échoueraient au
   déménagement.
7. `Iban` et `Bic` servent aussi la facturation pour elle-même (31
   fichiers) : les déplacer crée une dépendance permanente de la facturation
   envers `payment/channels`.
8. `CreditorSnapshot` porte `MandatePaymentType`, et tous les objets-valeurs
   importent `accounting-errors.js` : rien ne bouge « tel quel ».
9. Le contexte est mixte au-delà des mandats et des liens :
   `get-my-company-billed-to.*`, `on-refund-without-order.handler.ts`,
   `mandate-proof-purge.ts` (une purge RGPD), `prisma-mandate-debtor.reader.ts`.

**Ce qui tient** : le chiffrement des IBAN ne dépend ni de la table ni de
la colonne (`setAAD` absent) ; la lecture directe de la croissance
(`sales-sheet-steps.batch.ts:51-52`) ; les tests `pain008*` et le modèle
`pricing-golden-master`.

**La question à reprendre le jour venu** : qu'est-ce qu'un mandat quand il
ne sait plus ce qu'est une société ? Piste : un **débiteur opaque**
(`debtor_ref`), comme un sujet ; le commerce garde qui peut voir et gérer
le mandat d'une société, le bloc garde le mandat, son IBAN, sa RUM et sa
vie.
