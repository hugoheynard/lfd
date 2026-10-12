# Plan — le rythme de facturation et de prélèvement

> **Plan, doc-first**, écrit le 2026-10-12. Rien n'est bâti. Touche
> **l'argent** et porte une **migration de données** : contredit par
> `vitruve` avant Hugo. **Contredit le 2026-10-12 : quatre BLOQUANTS ; la
> révision est au §9 et l'emporte sur les §2 à §5 là où ils divergent.**
>
> 🔴🔴 **Re-révisé par Hugo le 2026-10-12 au soir : le rythme est PAR CLIENT**
> (« j'ai des clients au mois, d'autres à la semaine »), l'entité donnant le
> défaut. La décision du §10 venait d'un malentendu. **Le §16 fait foi** (le
> §15 le précède et en garde les leçons) ;
> R1–R5a restent bâtis et servent de socle (le rythme de l'entité devient le
> défaut).
>
> 🔴 **Révisé par Hugo le 2026-10-12 : « le rythme est défini par l'entité ».**
> Aucun rythme par payeur. Tout ce qui parle de `payer_billing_rhythm`, de
> période propre au payeur ou de rythmes mêlés est caduc (§10).

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

> ⚠️ Caduc pour le payeur (§10) : seul le défaut sur l'entité reste.

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

## 10. Le rythme est celui de l'entité (Hugo, 2026-10-12)

> « non le rythme est défini par l'entité »

Une seule suite de clôtures par entité, donc tous ses payeurs facturés et
prélevés ensemble. Ce que ça retire et ce qui reste :

| Objection de `vitruve`                         | Après cette décision                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| B1 — tables du mois non convertibles           | **Reste** : tables neuves `invoice_period_outcome` / `invoice_period_run` clés par `period_closes_at`                               |
| B2 — l'automatisme ne tente qu'au 1er          | **Reste** : `autopilotTurn` et `cycleToConstitute` suivent la dernière clôture du rythme de l'entité                                |
| B3 — un lot ramasserait des bons non facturés  | **Tombe** : tous les payeurs closent ensemble ; le lot garde sa lecture `[clôture précédente, clôture)`                             |
| B4 — une suite de clôtures par entité          | **Tombe** : c'est justement le modèle ; `cycleAt` / `lastClosure` / `isCalendarClosure` se généralisent au rythme au lieu du 1er    |
| Agrégat du rythme par payeur, `effective_from` | **Tombe** ; reste la règle sur `LegalEntity` : un changement prend effet à la prochaine clôture de l'ancien rythme, fait journalisé |
| Relevé client en mois civils                   | **Reste** : il énumère les périodes de l'entité                                                                                     |

Lots révisés :

| Lot | Contenu                                                                                                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `BillingRhythm` + `nextClosureAfter` / `periodAt`, purs (heure d'été, février, fin d'année)                                                                                                                                                                                               |
| R2  | ✅ 2026-10-12 — migration `20261012100000` (rythme et rythme programmé sur `legal_entities`), `LegalEntity.changeBillingRhythm`, `PUT …/billing-rhythm`, fait `legal_entity.billing_rhythm_changed`                                                                                       |
| R3  | ✅ 2026-10-12 (migration `20261012200000`) — Re-clé `invoice_monthly_outcome` / `invoice_autopilot_run` par `period_closes_at` (sorti de R2 : il part avec ses lecteurs) ; facture par clôture (23h55 la veille), passe automatique et rattrapage de toutes les clôtures manquées, bouton |
| R4  | Lot et automatisme par clôture, relevé client par période                                                                                                                                                                                                                                 |
| R5  | Carte de l'entité (choix du rythme et des dates), « Prélèvement du mois » par clôture                                                                                                                                                                                                     |

**Préavis (Hugo, 2026-10-12) : « on le réduira ».** Le délai de pré-notification
sera abaissé (jusqu'à 2 jours ouvrés en SEPA B2B) ; la clause CGV et mandat
est à écrire avec le cabinet AVANT d'abaisser le réglage. R4 n'en dépend
plus : le délai reste un réglage de l'entité.

## 11. Ce que R3 a laissé ouvert (2026-10-12)

- **La lecture des bons reste `[plancher, clôture)`**, pas `[clôture
précédente, clôture)` : un bon passé entre 23h55 et minuit la veille d'une
  clôture déjà facturée est repris par la suivante. La période sert à valider
  la clôture demandée, au libellé et au rapport.
- **L'historique des rythmes n'est pas conservé** : `BillingRhythmSetting`
  ne garde que le courant et le programmé. Un rattrapage qui chevaucherait
  deux bascules relirait une vieille clôture sous le mauvais rythme. À
  fermer avant d'ouvrir le réglage à l'écran (R5), par une table d'historique
  ou en refusant un second changement tant que le premier n'est pas facturé.
- **Le journal et `IssuedInvoiceSummaryView.period` disent encore `AAAA-MM`**
  (le mois où la période s'achève) : deux semaines du même mois portent la
  même étiquette. R4/R5.
- **Le simulateur de dossier** reste par mois (`StatementMonth`). R4/R5.
- **Déploiement** : entre `migrate deploy` et la bascule du code, une
  insertion de l'ancienne API dans ces tables échoue (`period_closes_at`
  NOT NULL). Ne pas pousser autour de 23h55.
- **Retour arrière** de la migration : restaurer aussi l'ancienne fonction
  `invoice_monthly_outcome_final` (message en `OLD."month"`).

## 12. Un seul changement de rythme à la fois (Hugo, 2026-10-12)

> « refus du deuxième changement, le spécifier avec un warning »

Remplace la règle « un second changement remplace le programmé » (R2).

- **Refusé** (`BusinessError`, 409) : tout nouveau rythme tant qu'un
  changement est **en attente**, c'est-à-dire tant que la clôture de prise
  d'effet n'a pas été **tentée par la facture** (`invoice_autopilot_run` à
  `period_closes_at = effective_at`). Le message nomme la date de prise
  d'effet et le geste de sortie.
- **Admis** : revenir au rythme courant tant que la prise d'effet n'est pas
  atteinte — c'est une annulation, pas un changement.
- **L'avertissement** est dit AVANT le geste, à l'écran (R5) : « un seul
  changement à la fois ; le suivant ne sera possible qu'après la facture du
  {date} ». Le refus serveur reste la garantie.
- Ce qui ferme : l'historique des rythmes n'est plus nécessaire (§11), puisque
  aucune clôture ne peut être relue sous un rythme qui l'a précédée de deux
  bascules.

## 13. Ce que R4 a laissé ouvert (2026-10-12)

Bâti : §12 (refus 409 `BillingRhythmChangePendingError`, lu par
`InvoicedClosuresReader` sur `invoice_autopilot_run`) ; le lot, son
automatisme, l'aperçu, le brouillon et le calendrier de la fiche au rythme de
l'entité (`apps/lfd-api/src/b2b/accounting/domain/services/entity-closures.ts`, mensuel au 1er prouvé égal sur
24 mois) ; la première clôture d'un lot est une clôture du rythme
(`FirstClosureOffRhythmError`, code inchangé). Pas de migration.

- **Le relevé de cycle reste en mois civils** : la route `statements/cycles`
  et `?month=` ne nomment aucune entité, une commande non plus — quel rythme
  lire n'est pas décidé ; et l'identité `AAAA-MM` est partagée avec le
  dossier de facturation (§11).
- **`GET /admin/accounting/billing-cycle`** (cycle courant, sans entité) reste
  au 1er, pour la même raison.
- **Pas de rattrapage clôture par clôture du lot** : la constitution prend la
  dernière clôture et lit les bons depuis le plancher ; une période manquée
  entre dans le lot suivant.
- **Les prochaines clôtures** ne sont pas exposées dans la vue de l'entité
  (`upcomingClosures` existe, pur) : contrat et neuf fixtures du back-office.
- **Les libellés de lot** (`Lot B2B 202611`, `cycleTagOf`) ne distinguent pas
  deux semaines d'un même mois ; les noms de fichiers, si (identifiant du lot).

## 14. Décisions de Hugo sur le §13 (2026-10-12)

- **Le relevé de cycle passe par période en R5** (avec `billing-cycle`).
- **Un lot manqué se signale et se refait à la main** — il n'est PAS absorbé
  en silence par le lot suivant. Lot R4b :
  - l'automatisme ne constitue pas tout seul quand une clôture antérieure de
    l'entité n'a jamais été tentée (processus mort, panne) : il range une
    tentative `missed` pour chaque clôture manquée, la journalise
    (`collection.autopilot_ran`, issue `missed`) et la dit à l'écran ;
  - la reprise est le bouton « Préparer le lot » existant, geste humain ;
  - l'automatisme reprend seul dès que plus aucune clôture n'est manquée
    (le lot manuel a été préparé).

**R4b bâti (2026-10-12, non commité à l'écriture).** Écart assumé avec la
liste ci-dessus : une seule tentative `missed` est rangée, sur la clôture
**tentée** (clé inchangée), et non une par clôture manquée — ranger une
tentative sur la clôture manquée la ferait passer pour « tentée », et le trou
disparaîtrait en silence au passage suivant. Le message nomme TOUTES les
clôtures manquées.

- **Manquée** : une clôture de l'entité strictement entre la borne et la
  clôture tentée, sans tentative dans `collection_autopilot_run`.
- **Borne** : la plus récente de la **première tentative** de l'entité, du
  **plancher** (`collection_floor`) et de la clôture du **dernier lot vivant**
  (non annulé, manuel compris, clos au plus tard à la clôture tentée). Sans
  aucune tentative passée, rien n'est manqué : le déploiement ne signale pas
  l'historique. Un lot couvre toutes les clôtures jusqu'à la sienne (il lit
  les bons depuis le plancher) : c'est ce qui fait reprendre l'automatisme.
- Pur : `apps/lfd-api/src/b2b/accounting/domain/services/missed-closures.ts` ; lu par le port
  `AutopilotCoverageReader` ; migration `20261012300000_la_tentative_manquee`
  (CHECK de l'issue élargi à `missed`).
- Un lot manuel annulé ne couvre plus : ses clôtures redeviennent manquées.

- **Un lot manuel annulé ne couvre plus rien** : ses clôtures redeviennent
  manquées (Hugo, 2026-10-12, « oui d'accord ») — l'argent n'a pas été
  prélevé.

## 15. Le rythme par client (Hugo, 2026-10-12 au soir) — plan de refonte

> « ah mince mais j'ai mal compris, j'ai des clients au mois, d'autres à la
> semaine »

Le §10 retirait le rythme par payeur sur un malentendu. Il revient, et avec
lui les objections B3 et B4 de `vitruve` (§9), que le §10 avait fait tomber.

### 15.1 Ce qui est déjà bâti et reste vrai

- `BillingRhythm`, `periodAt`, `nextClosureAfter`, `closureAfter`,
  `previousClosureOf`, `closuresToAttempt` (R1, R3) : purs, ne savent pas à
  qui appartient le rythme.
- `BillingRhythmSetting` (courant + programmé, §12) : réutilisé tel quel pour
  le payeur.
- Le rythme de l'entité (R2) : devient **le défaut**.
- `invoice_monthly_outcome` est déjà clé par (entité, `period_closes_at`,
  payeur, mandat) : une issue par payeur et par SA clôture tient sans
  changement.

### 15.2 Le modèle

- **Table `payer_billing_rhythm`** (comptabilité, schéma `public`) :
  `legal_entity_id`, `payer_company_id` (le payeur de `billedPayerOf`, jamais
  le site), mêmes colonnes que `legal_entities` pour le courant et le
  programmé (même fonction CHECK `billing_rhythm_is_well_formed`). **Absente =
  le payeur suit l'entité.** Clé (`legal_entity_id`, `payer_company_id`).
  Migration additive.
- **Le rythme d'un payeur à un instant** = son propre `rhythmAt(instant)` s'il
  en a un, sinon celui de l'entité. Un seul port de lecture
  (`PayerRhythmsReader.timelinesOf(entité, payeurs)`), qui rend une timeline
  par payeur.
- **Changer le défaut de l'entité** ne touche que les payeurs qui le suivent ;
  la règle §12 (un seul changement à la fois) reste sur l'entité. **Poser ou
  retirer un rythme propre** à un payeur est un changement de SON rythme :
  même règle §12, sur lui (prise d'effet à la prochaine clôture de son
  rythme actuel, refus tant qu'elle n'est pas facturée pour lui).
- Faits : `payer.billing_rhythm_changed` (sujet : le payeur, l'entité en
  charge).

### 15.3 La facture

- Le passage du soir (23h55) facture, pour chaque entité, **les payeurs dont
  la clôture tombe à minuit**, et eux seuls. Une tentative par (entité,
  clôture) reste la clé de `invoice_autopilot_run` ; une clôture = l'union
  des clôtures des rythmes en service (défaut + rythmes propres).
- Bornes d'un payeur : `[sa clôture précédente réelle, sa clôture)` pour la
  période ; lecture des bons `[plancher, clôture)` **restreinte à ce payeur**
  (R3 lisait tous les payeurs). Un bon d'un payeur mensuel n'est jamais lu
  par une clôture hebdomadaire d'un autre.
- Le bouton manuel prend une clôture ET facture les payeurs qui y closent.
- Rattrapage : `closuresToAttempt` sur l'union, payeur par payeur.

### 15.4 Le lot (le gros morceau — B3 revient)

R4 lit des **bons** `[clôture précédente, clôture)` puis remonte aux
factures : faux dès que les rythmes se mêlent (un lot de lundi ramasserait
les bons d'un mensuel pas encore facturé).

- **Après le plancher, le lot ne lit plus aucun bon : il lit les FACTURES
  émises non encore prélevées** (`invoice` 380 avec `payment_means` SEPA,
  sans ligne de lot vivante), par payeur et par mandat, quelle que soit leur
  période. Un bon non facturé n'est simplement pas encore prélevable.
- Les bons d'avant le plancher gardent l'arrêté (chemin inchangé).
- **Quand** : un lot à chaque clôture où au moins une facture a été émise
  (l'union), une tentative par (entité, clôture) — clé existante. Les
  factures d'un mensuel émises la veille du 1er partent dans le lot du 1er ;
  celles d'un hebdomadaire, dans le lot de son lundi.
- Échéance, préavis, avis, D4, `frozenCollectionDay` : inchangés (clôture du
  lot + N).
- Lot manqué (§14) : la couverture se lit par factures restées sans lot, pas
  par clôtures.

### 15.5 Le relevé et les écrans

- Relevé et dossier d'un payeur : SES périodes (`?periodClosesAt=` déjà là ;
  `/cycles` prend le payeur).
- Fiche du client, section facturation : « Suit l'entité (mensuel, le 1er) »
  ou son rythme propre, le programmé, l'avertissement §12, ses 3 prochaines
  clôtures.
- Fiche de l'entité (R5b) : la carte devient « Rythme par défaut » et
  compte les payeurs qui ont un rythme propre.
- « Prélèvement du mois » : par clôture, avec les payeurs facturés à chacune.

### 15.6 Lots

| Lot | Contenu                                                                                       |
| --- | --------------------------------------------------------------------------------------------- |
| P1  | `payer_billing_rhythm` (migration), agrégat/VO réutilisé, route + fait, timelines par payeur  |
| P2  | Facture par payeur à sa clôture (passage, bouton, rattrapage, lecture des bons par payeur)    |
| P3  | Le lot lit les factures émises non prélevées ; automatisme et lot manqué sur l'union          |
| P4  | Relevé / dossier par payeur ; écrans : fiche client, carte entité « par défaut », prélèvement |

### 15.7 Ouvert

- Un payeur et ses **sites** : le rythme est celui du payeur ; un site qui
  commande pour lui suit son rythme. Vérifier qu'aucun écran ne laisse
  croire qu'un site a le sien.
- **Changer le rythme d'un payeur** pendant qu'il a des bons non facturés :
  la règle « prise d'effet à la prochaine clôture de l'ancien » suffit-elle ?
- Le nombre de lots par mois (jusqu'à ~5 dépôts) : c'est déjà accepté.

### 15.8 Révision après `vitruve` (2026-10-12) — l'emporte sur 15.2 à 15.6

**Ce que `vitruve` a corrigé dans la prémisse.** Le lot lit déjà les bons
`[plancher, clôture)` et ne prélève que les bons **déjà facturés** (un bon
sans facture « attend la sienne », `collection-assembly.ts`). Le mélange des
rythmes ne fait donc PAS ramasser un mensuel non facturé par un lot du
lundi. **P3 ne réécrit pas la lecture du lot** : elle garde bons → factures,
`unbillable`, `invoice_split`, mandats des sites, re-présentation, arrêté.

**Les décisions qui remplacent 15.2–15.4 :**

1. **Le rythme d'un payeur est un HISTORIQUE, pas un courant + programmé.**
   Table `payer_billing_rhythm_segment` (append-only) : `legal_entity_id`,
   `payer_company_id`, `effective_from` (une clôture), `kind`/`days` ou NULL
   (= suit l'entité). Idem pour l'entité : son réglage R2 est relu comme
   l'historique à deux segments qu'il est. La **timeline d'un payeur** se
   compose de ses segments et, là où il suit l'entité, des segments de
   l'entité. `previousClosureOf` sur cette timeline composée rend la clôture
   précédente réelle — aucun trou, aucun chevauchement, quel que soit le
   nombre de bascules. Cela remplace la nécessité du §12 pour la
   **justesse** ; le §12 reste pour la **lisibilité** (cf. 4).
2. **Un calendrier d'entité = l'union des timelines** de ses payeurs en
   service et de son défaut : type `ClosureCalendar` (next/previous sur
   l'union). `CollectionBatch.constitute` accepte une clôture du calendrier ;
   `readCycle`, `closuresToAttempt`, `missedClosures` le prennent à la place
   d'une timeline unique.
3. **L'automatisme tente à chaque clôture du calendrier**, même sans facture
   (`nothing_to_collect`) : sinon R4b la signalerait `missed`.
4. **§12 par payeur, sur le temps et pas sur la facture** : un nouveau rythme
   est refusé tant que la prise d'effet du précédent est dans le futur
   (`effective_from > now`). Plus de dépendance à `invoice_autopilot_run`
   (faux dans un sens, bloquant pour un payeur sans commande). Annuler le
   programmé reste admis avant la prise d'effet. Même règle pour l'entité.
5. **La facture** : passage par clôture du calendrier ; payeurs facturés =
   ceux dont la timeline clôt à cet instant. La lecture SQL reste
   `[plancher, clôture)` pour tous ; le filtre par payeur se fait en mémoire
   par `billedPayerOf` (jamais un `where` sur la société : on perdrait les
   sites).
6. **`priorOrderCount`** se calcule sur la période DU PAYEUR, pas sur celle du
   lot.
7. **Échéance** : le lot garde `frozenCollectionDay` ; une facture rattrapée
   dont `dueOn` serait antérieure à l'échéance du lot est prélevée à
   l'échéance du lot (jamais plus tôt que l'avis) — la facture ne se réécrit
   pas, comme aujourd'hui (D4).
8. **Droit** : le réglage du payeur est sous `b2b_accounting` comme les
   autres réglages de facturation ; aucune ressource neuve.
9. **Irréversible** : la table et le fait `payer.billing_rhythm_changed`
   restent dès le premier merge (pré-release : acceptable, Hugo le sait).
10. Avoirs et factures carte : inchangés (le lot ne lit que les 380 ;
    l'avoir n'a pas de période).

Lots révisés : **P1** historique + timelines composées + calendrier d'union
(pur, puis migration) · **P2** facture par payeur · **P3** automatisme et lot
sur le calendrier (tentative à chaque clôture, `priorOrderCount`, échéance)
· **P4** relevé et écrans.

## 16. Les dates par MODE, le mode par client (Hugo, 2026-10-12) — fait foi

> « dans la comptabilité on ne fait que fixer les dates (identiques pour tous
> ceux d'une période) » · « mensuel par défaut, et oui pour les dates »

C'était la demande du §0 : **l'entité fixe les dates de chacun des trois
modes ; chaque client choisit un mode.** Plus aucune date propre à un client.

### 16.1 Le modèle

- **Sur l'entité, trois définitions**, chacune avec son courant et son
  programmé (le `BillingRhythmSetting` de R2, réutilisé trois fois) :
  - mensuel : un jour (défaut le 1er) ;
  - deux fois par mois : deux jours (défaut 1 et 16) ;
  - hebdomadaire : un jour de semaine (défaut lundi).
    Migration additive : trois jeux de colonnes (courant, programmé, prise
    d'effet) sur `legal_entities`. Les colonnes R2 `billing_rhythm_*` (un seul
    rythme) deviennent mortes ; leur valeur, si elle n'est pas le défaut,
    initialise la définition de son mode.
- **Sur le client (payeur de `billedPayerOf`), un mode** — historique
  append-only `payer_billing_mode` (`legal_entity_id`, `payer_company_id`,
  `effective_from` = une clôture, `mode`). Aucune ligne = **mensuel** (Hugo).
- **Changer les dates d'un mode** (entité) : prend effet pour tous les
  clients de ce mode à la prochaine clôture de ce mode ; **un seul changement
  à la fois par mode** (§12), refusé tant que la prise d'effet est future
  (règle de temps, §15.8-4 : plus de lecture de `invoice_autopilot_run`).
- **Changer le mode d'un client** : prend effet à la prochaine clôture de son
  mode ACTUEL ; même règle d'un seul changement à la fois, pour lui. Fait
  `payer.billing_mode_changed`.

### 16.2 La timeline d'un client, le calendrier de l'entité

- **Timeline d'un client** = ses segments de mode, chacun lu sur la timeline
  de dates de ce mode. `previousClosureOf` sur cette composition rend la
  clôture précédente réelle (bascule de mode ou de dates comprise).
- **Calendrier de l'entité** = l'union des trois timelines de modes
  (`ClosureCalendar`). Au plus trois suites de dates connues.

### 16.3 Facture, lot, relevé — ce que reprend le §15.8

- Facture : passage à chaque clôture du calendrier ; clients facturés = ceux
  dont la timeline clôt à cet instant ; lecture SQL `[plancher, clôture)`
  inchangée, filtre par payeur en mémoire (`billedPayerOf`, sites compris).
- Lot : lecture inchangée (bons depuis le plancher → factures émises) ;
  tentative à chaque clôture du calendrier, `nothing_to_collect` comprise ;
  `CollectionBatch.constitute` accepte une clôture du calendrier ;
  `priorOrderCount` sur la période du client ; échéance du lot (D4).
- Lot manqué (R4b) : sur le calendrier.
- Relevé et dossier : les périodes DU client.
- La vue de l'entité porte `lastClosure` (clôture du lot à préparer), signalé
  par R5b.

### 16.4 Écrans

- **Fiche de l'entité** : la carte « Rythme de facturation » (R5b) devient
  « Dates des modes » — trois lignes, chacune avec ses dates, son programmé,
  son avertissement §12 et ses prochaines clôtures ; le nombre de clients
  par mode.
- **Fiche du client, section facturation** : le mode (Mensuel par défaut),
  le programmé et sa prise d'effet, l'avertissement §12, ses prochaines
  clôtures.
- Restes « mois » : tableau de bord, journal (« Mois pas encore
  prélevable »), message du refus de préparation.

### 16.5 Lots

| Lot | Contenu                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | Trois définitions sur l'entité + mode du client (migration, agrégats, routes, faits, timelines, calendrier d'union, règle §12 au temps) — **bâti le 2026-10-12, non commité** (§16.7) |
| M2  | Facture par client à sa clôture (passage, bouton, rattrapage)                                                                                                                         |
| M3  | Lot et automatisme sur le calendrier (`constitute`, tentative à chaque clôture, `priorOrderCount`, lot manqué, `lastClosure`)                                                         |
| M4  | Relevé/dossier par client ; écrans : dates des modes, mode du client, restes « mois »                                                                                                 |

### 16.6 Révision après `vitruve` (2026-10-12) — l'emporte sur 16.1–16.5

1. **Les dates d'un mode sont un HISTORIQUE, comme le mode d'un client.**
   Table append-only `billing_mode_dates` (`legal_entity_id`, `mode`,
   `effective_from`, `days`, `cancelled_at`). La timeline d'un mode est la
   suite de ses segments non annulés. Rien ne s'efface : une clôture passée,
   un relevé ou un dossier ancien se relisent toujours sous les dates qui
   étaient en vigueur. C'est ce qui rend sûre la règle « au temps ».
   `BillingRhythmSetting` (courant + programmé) n'est plus la source ; il
   reste une vue.
2. **Un seul changement à la fois, au temps** : un nouveau segment est
   refusé tant qu'un segment non annulé a `effective_from` ≥ maintenant (par
   mode ; par client pour son mode). **Annuler** un segment programmé reste
   admis avant sa prise d'effet (`cancelled_at`), par mode comme par client.
   Le passé ne bouge pas, quel que soit l'écart entre la clôture et le
   passage de la facture.
3. **Prise d'effet** : la prochaine clôture de la TIMELINE actuelle (segment
   programmé compris), jamais des seules dates courantes. Un client qui
   change de mode à la clôture T de son ancien mode commence son premier
   segment du nouveau mode à T, jusqu'à la prochaine clôture du nouveau.
4. **Pas de reprise des colonnes R2.** R2 n'a jamais servi en production ;
   les valeurs de dev sont des essais. Les colonnes `billing_rhythm_*` et
   `next_billing_rhythm_*` (migration `20261012100000`) sont mortes à leur
   naissance. **Décision de Hugo demandée** : les garder à vie (colonnes
   vides) ou les supprimer dans une migration du même déploiement (elles ne
   portent aucune donnée de production ; la suppression demande son ordre,
   CLAUDE.md §0).
5. **Le mode ne se pose que sur un PAYEUR** (celui de `billedPayerOf`) : la
   route refuse un site qui facture chez un autre, en le nommant. Un bon est
   rattaché à son payeur **à sa date** (`billedPayerOf` est daté) et entre
   dans la facture de ce payeur à sa clôture ; un site qui change de payeur
   ne fait donc ni doublon ni trou (un bon n'est facturé qu'une fois,
   garantie existante).
6. **Le calendrier de l'entité** = l'union des modes qui ont au moins un
   client en service, plus le mensuel (défaut). Pas de tentative ni d'alerte
   `missed` un lundi pour une entité sans client hebdomadaire.
7. **Faits** : `legal_entity.billing_mode_dates_changed` (mode, dates avant/
   après, prise d'effet, ou annulation) et `payer.billing_mode_changed`.
   **Droit** : `b2b_accounting`, aucune ressource neuve.
8. **Irréversible dès le merge** : les deux tables et les deux faits.

**Décision de Hugo (2026-10-12) : « supprime-les ».** M1 supprime, dans une
migration NEUVE du même déploiement, les cinq colonnes R2 de
`legal_entities` et leurs deux CHECK ; la fonction
`billing_rhythm_is_well_formed` reste si M1 la réutilise, sinon elle part
aussi. Elles n'ont jamais porté de donnée de production.

### 16.7 M1 bâti (2026-10-12) — ce qui existe, ce que M2–M4 reprennent

**Migration** `20261012400000_les_dates_des_modes_et_le_mode_du_client` :
`billing_mode_dates` et `payer_billing_mode`, append-only (déclencheur : ni
DELETE, ni UPDATE sauf la pose unique de `cancelled_at` + son auteur), CHECK de
forme par `billing_rhythm_is_well_formed` (gardée), index unique partiel sur les
segments vivants (`legal_entity_id`, mode ou payeur, `effective_from`). Aucune
ligne semée. Les cinq colonnes R2 et leurs deux CHECK sont supprimées (ordre
ci-dessus). `payer_company_id` est opaque, sans clé étrangère vers `companies`
(comme `invoice_monthly_outcome`). Auteurs au registre RGPD.

**Domaine** : `ModeDatesTimeline` (segments vivants d'un mode, défauts sans
ligne), `PayerTimeline` (composition par `rhythmAt` : `closureAfter` et
`previousClosureOf` de R3 rendent la suite réelle), `ClosureCalendar` (union
des modes suivis + mensuel), agrégats `BillingModeDatesHistory` et
`PayerBillingModeHistory` (règle au temps : refus tant qu'un segment vivant a
`effective_from` ≥ maintenant, annulation strictement avant), garde
`requireBillingPayer` (même lecture datée que `billedPayerOf`).
`BillingRhythmSetting` reste une vue sans `change`.

**Routes** (`b2b_accounting`) : `PUT|DELETE …/billing-modes/:mode[/scheduled]`,
`GET|PUT|DELETE …/payers/:companyId/billing-mode[/scheduled]`. `PUT
…/billing-rhythm` est retiré, `legal_entity.billing_rhythm_changed` est
**retiré du catalogue** (`retired`, lignes de dev encore lisibles), les deux
faits neufs y sont.

**Vue** : `LegalEntityView.billingModes[3]` + `lastClosure` (dernière clôture
du calendrier d'union) ; `PayerBillingModeView`. Back-office : carte en lecture
seule « Dates des modes de facturation » (l'écran de réglage est M4).

**🔴 L'adaptateur de transition** — `BillingRhythmReader.timelineOf(entité)`
rend la timeline du **mode mensuel**. Le lisent encore, et sont à reprendre :

| Lot                  | Appelants                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M2 (facture)         | ~~`issue-monthly-invoices.handler`, `run-invoice-autopilot.handler`, `get-monthly-invoices.handler`~~ — **quittés en M2** (§16.8)                                                                                                                                                                                              |
| M3 (lot)             | ~~`collection-constitution-support` (donc `constitute-collection-batches.handler`, `get-collection-preview.handler`), `run-collection-autopilot.handler`, `cycle-draft-support` (`export-cycle-draft`, `export-cycle-audit`), `legal-entity-view-support` (le seul `nextCollection` de la fiche)~~ — **quittés en M3** (§16.9) |
| M4 (relevé, dossier) | `statement-period-support` (`get-current-billing-cycle`, `list-statement-cycles`, `get-cycle-statement`, `export-cycle-statement`, `get-invoice-dossier`, `export-invoice-dossier`), et `PrismaInvoicePeriodsReader`, qui lit le mensuel en jointure SANS passer par le port                                                   |

Les écrans de prélèvement du back-office (`month-schedule`, `month-preview`,
`prelevement-du-mois-page`) ont perdu leur branche « autre rythme » : en M1 le
lot suit le mensuel. M4 la rend, par période.

**Deux e2e retirés, à rétablir** (`test/monthly-invoices.e2e-spec.ts`) : ils
réglaient le rythme unique (`PUT …/billing-rhythm`, supprimé) et ne peuvent
pas passer tant que facture et lot suivent l'adaptateur mensuel :
« la facture par clôture d'un rythme hebdomadaire (R3) » — **rétabli en
M2** sur un payeur hebdomadaire ; « le lot par clôture d'un rythme
hebdomadaire (R4) » — **rétabli en M3** (§16.9).

**Ce que M1 n'a pas tranché** : « payeur en service » (§16.6-6) n'est pas
défini — le calendrier d'union compte tout payeur qui a un segment vivant
dont le mode est en vigueur ou programmé, sans regarder si le compte est
actif ; et `payerCount` du mensuel ne compte que ceux qui l'ont CHOISI, la
comptabilité ne tenant pas la liste des payeurs mensuels par défaut.

### 16.8 M2 bâti (2026-10-12, non commité) — la facture par payeur à sa clôture

**Calendrier de la facture** — `InvoicingCalendar` (domaine, pur) : l'union
de la timeline de chaque payeur qui a choisi un mode (`PayerTimeline`) et du
mensuel de l'entité (tout payeur sans ligne). Il porte `isClosure`,
`closesFor(payeur, C)`, `payerPeriodOf(payeur, C)`, `periodOf(C)`,
`closureToInvoice` et `closuresToAttempt` (ceux de R3, sur le calendrier ;
même plafond `MAX_CLOSURES_PER_PASS`). Lu une fois par passage
(`readInvoicingCalendar` : dates des modes + segments des payeurs).

⚠️ **Écart assumé avec `ClosureCalendar`** : celui de M1 réunit des MODES
(statiques), celui-ci des SUITES (datées). Ils coïncident tant que personne ne
change de mode ; dans le passé, `ClosureCalendar` ferait tenter les lundis de
septembre pour un payeur devenu hebdomadaire au 1er octobre — ce que §16.6-6
refuse. La fiche (`lastClosure`, M1) lit encore `ClosureCalendar` ; M3 devra
choisir lequel fait foi pour le lot (même question) — **tranché en M3 :
`InvoicingCalendar`, `ClosureCalendar` retiré** (§16.9).

- **Passage automatique** : une tentative par (entité, clôture du calendrier)
  dans `invoice_autopilot_run`, rattrapage dans l'ordre depuis la dernière
  tentée ou le plancher. Aucun lundi tenté sans payeur hebdomadaire à ce
  moment-là.
- **Facture à une clôture C** : lecture SQL inchangée `[plancher, C)` pour
  tous ; filtre en mémoire `calendar.closesFor(billedPayerOf, C)` — un site suit
  la suite de son payeur. Un payeur qui ne clôt pas à C n'est ni facturé ni
  signalé ; ses bons attendent sa clôture. `issuedOn` = veille de C au plus
  tôt (jamais antidaté), `dueOn` = `collectionDayOf(C)` — inchangés.
- **Bouton** `POST …/monthly-invoices` : refuse un instant qui n'est pas une
  clôture du calendrier (`NotABillingClosureError`, avant toute lecture des
  bons) ; facture les payeurs qui y closent.
- **Vue** `GET …/monthly-invoices` : la dernière clôture du calendrier dont
  l'heure d'émission est passée ; 404 par `LegalEntityReader.byId`.
- **Période affichée d'une clôture** (rapport, vue, refus « pas encore
  facturable ») : la PLUS LONGUE de celles qui s'y closent (`periodOf`) — le
  mois quand un lundi tombe le 1er. Le signalement d'un payeur nomme SA
  période (`payerPeriodLabelOf`). Le contrat ne porte qu'une période par
  clôture : la période par payeur à l'écran est M4.
- **Mensuel au 1er strictement identique** : prouvé par égalité avec les
  fonctions de R3 sur trois sondes par jour de 2026
  (spec domaine du calendrier de la facture) ; les tests E4 du handler passent inchangés.
- **e2e** (`test/monthly-invoices.e2e-spec.ts`) : « la facture par clôture d'un
  rythme hebdomadaire (R3, rétabli en M2) » sur `PUT …/billing-modes/weekly` +
  `PUT …/payers/:id/billing-mode`, et « rythmes mêlés » (un mensuel, un
  hebdomadaire ; chaque bon dans exactement une facture). Écrits, **non
  lancés** par le bâtisseur.
- Ni migration, ni contrat, ni back-office touché.

**Reste par l'adaptateur `BillingRhythmReader`** : M3 et M4 du tableau
ci-dessus, inchangés (M3 l'a quitté depuis, §16.9). Le journal (`invoice.autopilot_ran`, `invoice.signalled`)
dit encore le MOIS de la clôture (`periodMonthOf`).

### 16.9 M4 préparé (2026-10-12, pendant M3) — le relevé et les écrans

État au départ de M4 (relu ce jour) : routes de M1 en place
(`admin-billing-modes.controller.ts` : dates d'un mode, annulation, mode
d'un payeur en lecture/écriture/annulation) ; contrats `billingModes`,
`lastClosure`, `PayerBillingModeView` ; côté écran, seule une carte en
LECTURE des trois modes (`billing-modes-card`) ; la fiche du client
(`fiche-client/facturation/`) ne dit rien du mode. Lecteurs encore sur
l'adaptateur mensuel après M3 : `statement-period-support` (cycle courant,
relevé, dossier et leurs CSV) et `PrismaInvoicePeriodsReader` (en SQL).

**M4a — serveur (`batisseur`)**

1. **Relevé et dossier par payeur** : `statement-period-support` lit la
   `PayerTimeline` DU payeur demandé (relevé, dossier, CSV) ; `/cycles` prend
   le payeur (`?companyId=`) et rend SES périodes ; sans payeur (cycle courant
   de l'entité), le calendrier de M2/M3.
2. **La période d'une facture émise, rangée** : colonne
   `period_starts_at` sur l'issue de facture (migration additive), écrite à
   l'émission ; `PrismaInvoicePeriodsReader` la lit au lieu de recalculer sous
   le mensuel. Les issues d'avant restent lisibles par le calcul (aucune ligne
   en production). _(Proposé le 2026-10-12 après R5a ; décision de Hugo
   attendue — cf. ci-dessous.)_
3. **L'e-mail « Votre facture » dit la période** (« commandes du 5 au 11
   octobre 2026 ») au lieu du mois (`invoice-notice-sender.ts`,
   `periodMonthOf`). _(Même attente.)_
4. **Le journal dit la période** : `invoice.signalled` et
   `invoice.autopilot_ran` gagnent `periodClosesAt` + libellé à côté de
   `month` (gardé, compat) ; phrases du back-office à suivre.
5. **Les restes « mois » côté serveur** : message du refus de préparation
   (« Le premier mois prélevable »), `cycleTagOf` déjà fait (R5a).
6. **`payerCount`** du mensuel : compter aussi les payeurs mensuels par
   défaut ? (M1 ne compte que ceux qui l'ont choisi.) — à trancher, défaut
   proposé : « N clients ont choisi ce mode », sans prétendre compter les
   autres.

**M4b — écrans (`pablo`), après M4a**

1. **Fiche de l'entité — « Dates des modes »** : la carte en lecture devient
   l'éditeur des trois modes : pour chacun, dates en vigueur (jour du mois,
   deux jours, jour de semaine), programmé et prise d'effet, « Annuler ce
   changement », avertissement permanent « un seul changement à la fois » et
   formulaire bloqué jusqu'à `changeLockedUntil`, confirmation qui dit la
   date de prise d'effet, 3 prochaines clôtures, nombre de clients. Réutilise
   ce que R5b avait bâti (confirmation, avertissement, clôtures).
2. **Fiche du client — section facturation** : « Mode de facturation :
   Mensuel (par défaut) / Deux fois par mois / Chaque semaine », le programmé
   et son annulation, l'avertissement, ses 3 prochaines clôtures ; un SITE
   facturé chez un autre affiche « Suit le mode de {payeur} » sans
   formulaire (le serveur refuse de toute façon).
3. **Relevé et dossier** : le sélecteur de période du client montre SES
   périodes.
4. **« Prélèvement du mois »** : organisé par clôture du calendrier, avec
   pour chacune les clients facturés et le lot ; la période affichée est
   celle de chaque client (plus « la plus longue », §16.8).
5. **Restes « mois »** : tableau de bord (« le premier mois prélevable »),
   journal (« Mois pas encore prélevable »).

**e2e** : relevé d'un payeur hebdomadaire (ses semaines), période rangée sur
l'issue, e-mail de période ; specs des écrans.

**Décisions de Hugo à demander avant M4a** : la colonne `period_starts_at`
(2), l'e-mail par période (3), le compte de `payerCount` (6).

**Décisions de Hugo (2026-10-12) : « oui aux trois »** — `period_starts_at`
rangée sur l'issue de facture ; l'e-mail dit la période ; la carte dit « N
clients ont choisi ce mode » (le mensuel par défaut n'est pas compté).

### 16.10 M3 bâti (2026-10-12) — le lot et son automatisme sur le calendrier de la facture

**Un seul calendrier fait foi : `InvoicingCalendar`** — pour la facture (M2),
le lot, son automatisme, le brouillon du cycle et la fiche de l'entité.
`ClosureCalendar` (union des MODES suivis, M1) est **retiré** avec sa spec :
son seul lecteur était `lastClosure` de la fiche, et le garder aurait laissé
deux suites de clôtures diverger dans le passé (un payeur devenu hebdomadaire
au 1er octobre ferait tenter, à tort, les lundis de septembre — ce que
§16.6-6 refuse). Une facture et le lot qui l'encaisse se closent ainsi
toujours au même instant.

- **Domaine** : `ClosureSequence` (à côté de `calendarCycleAt`) — ce que le lot
  demande au calendrier (`closureAfter`, `closureBefore`,
  `lastClosureAtOrBefore`, `isClosure`) ; `InvoicingCalendar` l'implémente.
  `calendarCycleAt` / `calendarCycleToConstitute` remplacent `entityCycleAt` /
  `entityCycleToConstitute` pour le lot (ceux-ci restent pour le relevé, M4).
  `CollectionBatch.constitute` prend `calendar` (au lieu de `rhythm`) : la
  première clôture doit être une clôture du calendrier, celle d'au moins un
  payeur. `autopilotTurn` et `missedClosures` (R4b) raisonnent sur le
  calendrier. `InvoicingCalendar.following(timeline)` : le calendrier d'une
  entité où personne n'a choisi de mode (= `of(modes, [])`).
- **Le cycle d'un lot** = `]clôture précédente du calendrier (ou dernière
enregistrée), dernière clôture du calendrier ≤ maintenant]`. Avec un payeur
  hebdomadaire, le lot du lundi 5 octobre va du 1er (clôture du mensuel) au
  lundi : les cycles des lots suivent l'union, pas la période d'un payeur.
- **Lecture du lot inchangée** (`assembleCollection`, `collectableOrders(floor,
clôture)`, factures émises, `unbillable`, `invoice_split`, mandats des sites,
  re-présentation, arrêté d'avant le plancher). Seul `cycleStartsAt` a quitté
  l'assemblage, remplacé par `payerPeriodStartsAt(payeur)`.
- **`priorOrderCount`** : sur la période DU PAYEUR —
  `InvoicingCalendar.payerPeriodStartAt(payeur, clôture du lot)`, le début de
  la période que ferme sa dernière clôture ≤ celle du lot. Au mensuel au 1er,
  identique à avant quand le lot précédent est au 1er précédent ; s'il manque
  un mois, les bons du mois manqué ne sont plus comptés « repris » par rapport
  à la borne du lot mais à la période du payeur (c'est la règle §15.8-6).
- **Automatisme** : une tentative par (entité, clôture du calendrier) —
  `nothing_to_collect` comprise, mécanique inchangée — ; R4b sur le même
  calendrier : pas de lundi manqué tant qu'aucun payeur n'est hebdomadaire,
  y compris dans le passé d'un payeur qui l'est devenu.
- **Échéance** : le lot garde `frozenCollectionDay` (D4), calculée sur SA
  clôture. Rien dans le chemin du lot ne lit `invoice.dueOn` (vérifié le
  2026-10-12 : seuls la facture, son PDF, Factur-X et l'avis de facture la
  lisent). Une facture rattrapée dont `dueOn` est antérieure est donc prélevée
  à l'échéance du lot, et ne se réécrit pas. ⚠️ Le courriel de la facture
  (`invoice-notice-wording`) a annoncé, lui, `dueOn` : pour une facture
  rattrapée, la date annoncée par la facture et celle du lot diffèrent ;
  l'avis de prélèvement suit le lot (non vérifié au-delà de
  `frozenCollectionDay` → XML → lot → avis, D4).
- **Fiche** : `nextCollection` (`calendarCycleAt`) et `lastClosure` lisent le
  même `InvoicingCalendar`, lu une fois par fiche.
- **Aperçu** (`get-collection-preview`) : il vérifiait l'existence de l'entité
  par l'adaptateur ; il lit désormais `LegalEntityReader.byId` (404 avant
  toute lecture du lot), comme la vue de la facture en M2.
- **Mensuel au 1er strictement identique** : la spec domaine des cycles du
  lot sur le calendrier compare,
  sur trois sondes par jour de 2026 et trois bornes enregistrées, cycle en
  cours, cycle à constituer, clôture, tour de l'automatisme, clôture
  précédente et début de période du payeur à `entity-closures` de R4 ; les
  tests d'avant passent en enveloppant leur réglage dans
  `InvoicingCalendar.following`, assertions inchangées.
- **Tests retouchés** : le test d'application « une entité hebdomadaire
  constitue la semaine close au dernier lundi » est devenu un payeur
  hebdomadaire, et son cycle s'ouvre au 1er (clôture du mensuel des autres) au
  lieu du lundi d'avant — c'est le calendrier d'union, pas une régression.
  « Une entité disparue entre deux lectures n'est pas tentée » est **retiré** :
  il éprouvait le `null` de l'adaptateur, et les dates des modes rendent les
  défauts pour toute entité (une entité ne se supprime pas).
- **e2e** (`test/monthly-invoices.e2e-spec.ts`) : « le lot par clôture d'un
  rythme hebdomadaire (R4, rétabli en M3) » sur les routes de M1 ; « rythmes
  mêlés » étendu jusqu'au lot — le lot du premier lundi ne prélève que la
  facture de l'hebdomadaire, chaque clôture du calendrier est préparée (aucune
  `missed`), le lot du 1er prélève celle du mensuel, chaque facture est dans
  exactement une ligne de lot. Écrits, **non lancés** par le bâtisseur.
- Ni migration, ni contrat, ni back-office touché.

**Reste par l'adaptateur `BillingRhythmReader`** : M4 seul —
`statement-period-support` (relevé, dossier, cycles) et
`PrismaInvoicePeriodsReader`. Le journal `invoice.autopilot_ran` dit encore
le MOIS de la clôture (§16.8).
