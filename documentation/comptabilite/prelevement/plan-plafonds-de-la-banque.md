# Plan — les plafonds de la banque, sur l'entité

> Écrit le **2026-10-24** à la demande de Hugo (« noter le plafond dans
> l'entité »), réponse 2 et décision D1 de
> [`reponses-de-la-banque.md`](reponses-de-la-banque.md). **Doc-first : rien
> n'est bâti.**

## 0. Ce qui existe (ouvert le 2026-10-24)

- Aucun plafond nulle part : `grep -i plafond apps/lfd-api/src` ne rend que des
  bornes techniques (corps JSON, relance d'outbox).
- Le calendrier de prélèvement de l'entité (`CollectionSchedule`,
  `domain/value-objects/collection-schedule.ts`) est rangé sur la ligne de
  l'entité (`accounting.prisma:178-179`, `deposit_cutoff_*`). Il refuse une
  valeur hors de ses bornes, et une valeur absente se dit « à renseigner »,
  jamais une valeur inventée.
- L'onglet 3 de la page « Procédure de prélèvement » **avertit** par débiteur
  (P4 révisé, `plan-page-procedure-de-prelevement.md` § 3.3) et ne verrouille
  pas : la banque ne contrôle rien au dépôt (réponse 15).

## 1. Ce que la banque a dit

Réponse 2 : la convention d'émission porte **trois plafonds**, unitaire (un
prélèvement), par remise (un fichier) et cumul mensuel. Nous devons les
communiquer (D1, chiffres de Hugo, pas encore arrêtés). La réponse ne dit pas
ce que fait la banque d'une remise au-dessus d'un plafond.

## 2. Ce qu'on bâtit

### 2.1 Les trois plafonds sur l'entité

Un value object `BankCollectionLimits` : trois montants **en centimes**,
chacun **facultatif** (`null` = « non renseigné », rien n'est contrôlé, et
l'écran le dit). Refuse un montant non entier ou ≤ 0, et une incohérence :
unitaire ≤ par remise ≤ mensuel, pour ceux qui sont renseignés.

Un seul jeu par entité, pas un par schéma : nous ne prélevons qu'en B2B (D8).
Le jour où une convention CORE s'ouvre, le jeu se dédouble par schéma.

Migration **additive** : trois colonnes `Int?` sur la ligne de l'entité, à côté
de `deposit_cutoff_*`. Aucune valeur écrite. Une commande dédiée
`SetBankCollectionLimits` (une raison de changer, comme `set-collection-schedule`),
journalisée. Elle est saisie à l'écran, sur la carte « Prélèvement » des
réglages de l'entité, sous la limite de dépôt.

### 2.2 L'avertissement, pas le blocage

Sur la lecture de la procédure (onglet 3 « Fichier de prélèvement »), à côté
de l'avertissement par débiteur :

| Plafond    | Comparé à                                                                                                                                       | Ce qu'on dit                               |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| unitaire   | chaque ligne du lot (un débiteur)                                                                                                               | le débiteur nommé, son montant, le plafond |
| par remise | le total du lot                                                                                                                                 | le total, le plafond                       |
| mensuel    | la somme des lots **non annulés et non rejetés** de l'entité dont l'**échéance** tombe dans le même mois civil (heure de Paris), ce lot compris | le cumul, le plafond                       |

Un avertissement, pas un verrou, pour la même raison que P4 : on ne sait pas
ce que fait la banque, et un plafond se relève par un appel au chargé
d'affaires. Bloquer ferait manquer une limite de dépôt pour une règle que la
banque n'a peut-être pas.

La constitution (automatique ou à la main) ne change pas : le lot se constitue
tel quel, l'avertissement se lit sur la page.

## 3. Questions pour Hugo

- **Q1.** Avertir seulement (proposé), ou bloquer « Marquer déposé » au-dessus
  d'un plafond ?
- **Q2.** Le mois du cumul : celui de l'**échéance** (proposé : c'est le jour où
  la banque débite), ou celui du dépôt ?

## 4. Lots

| Lot | Contenu                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| PL1 | VO + migration + commande + route + carte des réglages (back-office), tests aux trois niveaux |
| PL2 | Les trois avertissements dans la lecture de la procédure et l'onglet 3                        |

## 5. À côté : la liste de la banque, remise à l'heure

Les points « à faire » de `reponses-de-la-banque.md` § 3 ont avancé sans que
la liste suive. Ouvert le 2026-10-24 :

- export des mandats conforme (F, G, K, L, 18 colonnes) — bâti `a82e885c6` ;
- export des comptes destinataires — bâti `5a7e9c6f4` ;
- export borné à 200 lignes — bâti (`export-mandates-for-bank.handler.ts`,
  `BANK_IMPORT_MAX_ROWS`) ;
- un mandat en erreur au compte rendu redevient « à exporter » — bâti
  (`RejectMandateAtBankCommand`) ;
- colonnes M–R — **en attente de la banque** (Q-B3) et de D9 : rien à bâtir
  avant leur réponse.

## 6. Contradiction de `vitruve` (2026-10-24) — l'emporte sur les § 2 à § 4

Confirmé : le rangement voisin de `deposit_cutoff_*`, l'avertissement P4
comme voisin (`lot-debtor-bank-standing.ts`), `Int` en centimes (≈ 21 M€),
aucun mur tenant à porter (lecture staff, par entité).

**BLOQUANT, corrigé** — les lots sans échéance. `requested_collection_day`
est `NULL` pour les lots d'avant le 2026-10-08. Ils sont tous d'avant le
premier dépôt réel (contrat CENET REMISES pas encore signé, pré-release) :
aucun ne tombe dans un mois où un vrai plafond s'appliquera. Le cumul les
ignore, et le dit dans son JSDoc avec cette date.

**SÉRIEUX, corrigés dans la proposition :**

- **Ce que somme le cumul** : ce que la banque recevra dans le mois, c'est-à-dire
  les lots `deposited` **et** `constituted` (un lot constitué part en principe),
  jamais `cancelled` ni `rejected_by_bank`. Question Q3.
- **Retours et représentations** : une représentation est un **nouveau débit**
  présenté à la banque ; la banque le compte, nous aussi. Un impayé ne retire
  rien du cumul : le débit a été présenté. Écrit dans le JSDoc.
- **Prélèvements d'essai** : exclus, et dit. Un essai fait au plus 1 €, hors
  `CollectionBatch` ; il ne déplace aucun plafond.
- **Un jeu par schéma dès maintenant** : une petite table
  `legal_entity_bank_limits (legal_entity_id, scheme, per_debit_cents,
per_remittance_cents, monthly_cents)`, clé (entité, schéma). L'écran ne
  montre que B2B tant que D8 tient. Évite la migration de données le jour
  d'une convention CORE.
- **unitaire ≤ remise ≤ mensuel n'est pas un refus** : la banque n'a rien dit
  de cette relation. L'agrégat refuse seulement un montant non entier ou ≤ 0 ;
  l'écran avertit d'une incohérence sans la refuser.
- **La forme** : une méthode de l'agrégat `LegalEntity`
  (`domain/entities/legal-entity.ts`), `setBankCollectionLimits(scheme, …)`,
  sur le modèle de `SetCollectionScheduleCommand` dans
  `legal-entity-commands.ts` ; fait de journal
  `legal_entity.bank_collection_limits_set` dans `legal-entity.events.ts` ;
  CHECK `> 0` en base sur les trois colonnes.

**MINEUR** : le total d'un lot se calcule (somme des `amount_cents` de ses
lignes), il n'est pas rangé. PL1 passe par `lecteur-de-migrations`.

## 7. Décisions de Hugo (2026-10-24) — l'emportent sur les § 2 à § 6

- **Q1 — avertir seulement.** Aucun plafond ne bloque « Marquer déposé ».
- **Q2 — non tranchée : la banque seule le sait.** Le cumul compte par mois
  d'**échéance**, SUPPOSÉ, en attendant Q-B7
  ([`reponses-de-la-banque.md`](reponses-de-la-banque.md) § 5 bis). Le choix du
  mois vit dans une seule fonction du domaine, pour qu'une réponse « mois de
  dépôt » se corrige en une ligne.
- **Q3 — lots constitués et déposés.** L'avertissement arrive avant le dépôt,
  quand on peut encore agir.
