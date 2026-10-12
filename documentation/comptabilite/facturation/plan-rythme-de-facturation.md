# Plan — le rythme de facturation et de prélèvement

> **Plan, doc-first**, écrit le 2026-10-12. Rien n'est bâti. Touche
> **l'argent** et porte une **migration de données** : contredit par
> `vitruve` avant Hugo. **Contredit le 2026-10-12 : quatre BLOQUANTS ; la
> révision est au §9 et l'emporte sur les §2 à §5 là où ils divergent.**

## 0. La demande

> « dans entité juridique prélèvement automatique, on doit avoir 3 formats
> mensuel, bi-hebdomadaire (2 fois par mois), et hebdomadaire, pour chaque
> mode j'ai besoin de définir les dates » — Hugo, 2026-10-12.

Décisions de Hugo le même jour :

- **A — la facture suit le rythme.** Chaque période donne une facture, et
  chaque facture est prélevée. Pas d'acompte prélevé sur une facture mensuelle.
- **Réglé par client, défaut sur l'entité.** L'entité émettrice porte le
  rythme par défaut ; un payeur peut avoir le sien.

« Deux fois par mois » se dit **bimensuel** (bihebdomadaire veut dire deux
fois par semaine). L'écran dira « Deux fois par mois ».

## 1. Ce qui existe (ouvert le 2026-10-12)

Le mois est partout. C'est un état, pas un oubli : tout a été bâti pour un
seul rythme.

| Où                                                    | Ce qui suppose le mois                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `domain/services/billing-cycle.ts`                    | `cycleAt`, `defaultClosureAfter`, `calendarCycle` : la clôture est le 1er à 00h00     |
| `domain/value-objects/statement-month.ts`             | la période facturée est un `StatementMonth` ; 8 fichiers hors tests le lisent         |
| `issue-monthly-invoices.handler.ts`                   | une passe par (entité, mois) ; émise le dernier jour du mois ; échéance = clôture + N |
| `run-invoice-autopilot.handler.ts` · `monthToInvoice` | le mois à facturer, une tentative par (entité, mois)                                  |
| `invoice_monthly_outcome`                             | clé `(legal_entity_id, month, payer_company_id, mandate_id)`                          |
| `invoice_autopilot_run`                               | clé `(legal_entity_id, month)`                                                        |
| `collection_autopilot_run`                            | clé `(legal_entity_id, cycle_closes_at)` — **déjà un instant**, pas un mois           |
| `collection-calendar.ts`                              | pur, prend une clôture : **ne suppose pas le mois**                                   |
| fiche de l'entité, carte « Prélèvement automatique »  | « Chaque mois… », « Une seule tentative par mois »                                    |
| `DeferredTerm.monthly`                                | le crédit « au compte » ; une VALEUR d'enum, elle ne se renomme pas ici               |

La table `invoice` ne porte **aucune période** (vérifié dans
`prisma/schema/public/invoice.prisma`) : elle n'a rien à migrer.

## 2. Le modèle

### 2.1 Le rythme, un value object

```ts
type BillingRhythm =
  | { kind: "monthly"; closingDay: DayOfMonth } // 1 à 28
  | { kind: "semimonthly"; closingDays: readonly [DayOfMonth, DayOfMonth] } // distincts, triés
  | { kind: "weekly"; closingWeekday: Weekday }; // 1 = lundi … 7 = dimanche
```

- **La date réglée est le jour de CLÔTURE, à 00h00 locales** : elle ferme la
  journée précédente, comme le « 1er à 00h00 » d'aujourd'hui. Le mensuel au
  1er est exactement le comportement actuel.
- **Jours 29 à 31 refusés** : février les n'a pas, et un « dernier jour du
  mois » se dit déjà « le 1er ».
- Défauts : mensuel le 1er ; bimensuel le 1er et le 16 ; hebdomadaire le lundi.
- Refusé par le value object (`DomainError`) : jour hors bornes, deux jours
  égaux en bimensuel.

### 2.2 Où il vit

- **Défaut** : sur `LegalEntity` (colonnes `billing_rhythm_kind`,
  `billing_rhythm_days int[]`), défaut en base = mensuel, `{1}`. Une CHECK
  tient la forme (1 jour pour mensuel et hebdomadaire, 2 pour bimensuel,
  bornes).
- **Par payeur** : table de la comptabilité `payer_billing_rhythm`
  (`legal_entity_id`, `payer_company_id`, mêmes colonnes, `effective_from`).
  Absente = défaut de l'entité. **Pas sur `companies`** : le rythme est une
  affaire de facturation, et le compte client n'a pas à le connaître. Le
  payeur est celui de `billedPayerOf` — pas le site qui commande.

### 2.3 Changer de rythme

Un changement **ne coupe jamais une période en cours**. Il prend effet à la
prochaine clôture de l'ANCIEN rythme (`effective_from` = cette clôture). La
période en cours se termine comme elle avait été annoncée ; la suivante
suit le nouveau rythme. Sans quoi un bon pourrait tomber dans deux périodes,
ou dans aucune — c'est l'argument qui a fait borner le cycle par la clôture
précédente (`billing-cycle.ts`).

## 3. Le calendrier

`billing-cycle.ts` gagne une fonction pure :
`nextClosureAfter(instant, rhythm): Date` et `periodAt(now, rhythm,
previousClosure)`. `cycleAt` en devient le cas mensuel-au-1er, et ses
appelants ne changent pas.

`collection-calendar.ts` ne change pas : il prend déjà une clôture.

| Rythme               | Période                               | Facture émise le        | Prélèvement (échéance)                     |
| -------------------- | ------------------------------------- | ----------------------- | ------------------------------------------ |
| Mensuel, jour J      | du J à 00h00 au J du mois suivant     | la veille de la clôture | clôture + N, jour ouvré TARGET2 (inchangé) |
| Bimensuel, J1 et J2  | J1 → J2, puis J2 → J1 du mois suivant | la veille de la clôture | clôture + N, jour ouvré TARGET2            |
| Hebdomadaire, jour S | S → S de la semaine suivante          | la veille de la clôture | clôture + N, jour ouvré TARGET2            |

N et le délai de pré-notification restent **des réglages de l'entité**, pas
du payeur.

## 4. La facture par période

- La passe ne se fait plus « pour un mois » mais **pour une clôture** : à
  chaque clôture, les payeurs dont le rythme clôt à cet instant sont
  facturés, et eux seuls.
- **Clé de période** : `period_closes_at` (instant) remplace `month` dans les
  clés de `invoice_monthly_outcome` et `invoice_autopilot_run`.
  Migration **additive** : colonne ajoutée, remplie pour les lignes
  existantes (`month` → 1er du mois suivant à 00h00 Paris), nouvelle clé
  posée ; `month` reste en base, morte, comme le veut le §0 du CLAUDE.md.
  🔴 Le remplissage convertit une valeur : `lecteur-de-migrations` le lit.
- La passe automatique (cron `55 21,22 * * *`) devient **quotidienne au sens
  propre** : chaque soir, elle facture les payeurs dont la clôture est à
  minuit. Le rattrapage horaire reste.
- Le bouton « Émettre les factures de … » prend une clôture au lieu d'un mois.

## 5. Le lot de prélèvement

- Le lot encaisse **déjà** « les factures émises non encore prélevées »,
  quel que soit leur mois. Il ne change pas de nature.
- L'automatisme est déjà clé par `cycle_closes_at` : il tente **à chaque
  clôture où au moins un payeur a été facturé**, une fois.
- Conséquence : jusqu'à ~5 lots par mois pour une entité qui a des payeurs
  hebdomadaires, donc autant de dépôts sur le portail de la banque.

## 6. Les écrans

- **Fiche de l'entité, carte « Prélèvement automatique »** : un choix à trois
  (mensuel / deux fois par mois / chaque semaine), puis les dates (jour du
  mois, deux jours, ou jour de la semaine). Les phrases « chaque mois » et
  « une seule tentative par mois » deviennent « à chaque clôture ».
- **Fiche du client (payeur), section facturation** : « Rythme de
  l'entité (mensuel, le 1er) » ou un rythme propre, et la date à laquelle un
  changement prendra effet.
- **« Prélèvement du mois »** : la liste des clôtures du mois, chacune avec
  ses factures et son lot. Le nom de l'écran reste (il couvre le mois).
- Le calendrier partagé (`collection-calendar/`) montre les prochaines
  clôtures, pas seulement la prochaine.

Droits : sous `b2b_accounting`, comme les réglages actuels. Aucune
ressource neuve.

## 7. Les lots de travail

| Lot | Contenu                                                                                      | Dépend de |
| --- | -------------------------------------------------------------------------------------------- | --------- |
| R1  | `BillingRhythm` + `nextClosureAfter` / `periodAt`, purs, testés (DST, février, fin d'année)  | —         |
| R2  | Migration : rythme sur l'entité, `payer_billing_rhythm`, `period_closes_at` rempli ; mappers | R1        |
| R3  | Facture par clôture : handler, passe automatique, bouton, rapports                           | R2        |
| R4  | Lot et automatisme par clôture ; avis et calendrier                                          | R3        |
| R5  | Écrans : carte de l'entité, fiche du payeur, « Prélèvement du mois »                         | R2 à R4   |

Chaque lot passe en `test` complet ; R2 passe par `lecteur-de-migrations`.

## 8. Questions ouvertes

1. **Le préavis contre l'hebdomadaire.** Le délai de pré-notification par
   défaut est de **14 jours** et N ≥ ce délai : un payeur hebdomadaire est
   donc prélevé au plus tôt deux semaines après sa clôture, et a toujours
   deux à trois factures en vol. C'est légal, mais est-ce voulu ? Le réduire
   (jusqu'à 2 jours ouvrés en SEPA B2B) demande la clause dans les CGV et le
   mandat — c'est déjà écrit au §2 de `prelevement-automatique.md`.
2. **Un avis par prélèvement.** Le règlement SEPA admet un avis unique pour
   un échéancier de montants connus, pas pour des montants variables : un
   avis par lot reste nécessaire. À confirmer au cabinet, avec la question 1.
3. **Le dépôt manuel à la banque, jusqu'à cinq fois par mois** en
   hebdomadaire. Acceptable tant que le dépôt n'est pas automatisé ?
4. **Le crédit `monthly`** (`DeferredTerm`) garde son nom de valeur ; à
   l'écran, « Au compte » suffit-il, ou le libellé doit-il suivre le rythme ?

## 9. Révision après `vitruve` (2026-10-12)

### Bloquants, et ce qu'ils changent

1. **Le remplissage de `period_closes_at` est refusé en base** : le
   déclencheur `invoice_monthly_outcome_final` (migration
   `20261008200000`, l.91-105) interdit tout `UPDATE` d'une ligne `issued`.
   → **On ne touche pas aux tables du mois.** Deux tables neuves,
   `invoice_period_outcome` et `invoice_period_run`, clés par
   `period_closes_at`, avec le même déclencheur. Les tables du mois restent
   lisibles, figées, et ne reçoivent plus de lignes. À vérifier avant R2 :
   combien de lignes `issued` en production (le plancher est le 1er novembre,
   on en attend zéro).
2. **L'automatisme du lot ne suit pas les clôtures** : `autopilotTurn`
   (`collection-autopilot.ts:25`) passe par `cycleToConstitute`, toujours le
   dernier 1er. → R4 réécrit `autopilotTurn` : tenter à chaque jour où des
   factures ont été émises et ne sont pas encore prélevées.
3. **Le lot lit des BONS, pas des factures** (`collection-constitution-support.ts:84`,
   `prisma-collection-candidates.reader.ts:42`). Avec des rythmes mêlés, un lot
   hebdomadaire ramasserait des bons de payeurs mensuels pas encore facturés.
   → **Après le plancher, le lot lit des FACTURES émises non prélevées, et
   plus aucun bon.** Les bons d'avant le plancher gardent l'ancien chemin
   (arrêté). C'est le plus gros lot du chantier.
4. **Une seule suite de clôtures par entité** (`lastClosure`,
   `cycle-draft-support.ts:63`, `isCalendarClosure`). → **La période est celle
   du payeur** : sa borne basse est la `period_closes_at` de sa dernière
   facture (ou le plancher), sa borne haute la prochaine clôture de son rythme.
   La clôture d'entité reste pour le seul cas mensuel d'avant le plancher.

### Sérieux, et ce qu'ils changent

- **Heure d'émission** : 23h55 la veille de la clôture, comme aujourd'hui
  (`MONTHLY_INVOICE_TIME`). `monthToInvoice` et `invoicingMomentOf` ont leur
  équivalent par clôture ; le rattrapage horaire rattrape **toutes** les
  clôtures manquées, pas une.
- **Le rythme ne prend effet qu'à partir du plancher** : avant, rien ne se
  règle par payeur (l'écran le dit).
- **Un agrégat `PayerBillingRhythm`** calcule `effective_from` et refuse un
  changement au milieu d'une période ; un deuxième changement avant le premier
  le **remplace**. Faits journalisés : `legal_entity.billing_rhythm_changed`,
  `payer.billing_rhythm_changed`. Mur : la table porte `payer_company_id`.
- **Le relevé client** (`list-statement-cycles`, `calendarCycle`) énumère
  les périodes du payeur, pas les mois civils.
- **Avoirs** : ils n'ont pas de période ; un avoir s'impute au prochain lot
  du payeur, comme aujourd'hui.
- **Factures carte** : hors rythme, réglées à la commande. Rien ne change.
- **e2e** obligatoires : passage à l'heure d'été, rythmes mêlés dans un
  même lot, mur du payeur.

### Ce qui reste à décider avant R4

- **Le préavis de 14 jours contre l'hebdomadaire** (ex-question 1) : il
  conditionne le calendrier des lots, ce n'est plus une question ouverte.
