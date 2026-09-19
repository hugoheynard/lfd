# La journalisation — comment un geste devient une trace

> **La porte d'entrée.** Ce document dit comment la journalisation marche dans
> tout le backend, telle qu'elle tourne en production au **2026-09-18**, vérifiée
> contre le code ce jour-là. Chaque projet garde le détail de ses faits :
>
> - le journal d'activité, son modèle et sa lecture —
>   [`../b2b/architecture-journal-activite.md`](../b2b/architecture-journal-activite.md) ;
> - la mécanique bloquante, née au référentiel —
>   [`../pim/journalisation-et-tracabilite.md`](../pim/journalisation-et-tracabilite.md) ;
> - l'annuaire staff —
>   [`../staff/journalisation-staff/architecture-journal-de-l-annuaire.md`](../staff/journalisation-staff/architecture-journal-de-l-annuaire.md) ;
> - l'auteur d'un acte — au [§12](#s12) de ce document.
>
> Ce qui reste à faire est dans [`todo-journal-activite.md`](todo-journal-activite.md),
> et nulle part ailleurs.

## Table des matières

1. [En une phrase](#s1)
2. [Une table, deux garanties](#s2)
3. [Les trois chemins d'écriture](#s3)
4. [Ce qu'une ligne contient](#s4)
5. [L'auteur](#s5)
6. [L'idempotence](#s6)
7. [Le journal tarifaire, et pourquoi il a sa table](#s7)
8. [La lecture : l'écran Journal](#s8)
9. [Ce qui empêche d'oublier](#s9)
10. [Ce qui s'appelle « journal » sans en être un](#s10)
11. [Où est le code](#s11)
12. [L'auteur est la fiche, jamais le `sub`](#s12)
13. [Le catalogue des faits](#s13)

---

<a id="s1"></a>

## 1. En une phrase

Un geste qui change ce qui est vendu, facturé, ou ce que quelqu'un a le droit
de voir écrit **un fait** dans `growth.activity_events` — dans la **même
transaction** que le geste quand on doit pouvoir en répondre —, avec son auteur
**figé** au moment où il agit, et l'écran Journal du back-office le rend en
phrase.

---

<a id="s2"></a>

## 2. Une table, deux garanties

Il n'y a qu'**un** journal d'activité : « que s'est-il passé avant que ça
casse ? » traverse les modules, et deux journaux seraient deux vérités. Un
module n'est pas un emplacement, c'est un **filtre** dérivé du préfixe du type
de fait (§8).

Mais tous les faits ne coûtent pas la même chose s'ils se perdent. Le port
`ActivityRecorder` (`b2b/growth/domain/ports/activity-recorder.ts`) offre donc
**deux garanties**, et c'est l'émetteur qui choisit :

|               | `record` — **analytique**                                                        | `recordOrFail` — **opposable**                                 |
| ------------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Une panne     | journalisée puis **avalée** : le geste réussit quand même                        | **remonte** : la transaction du geste est annulée              |
| Pour          | une étape franchie, une commande prête, un lead capté                            | une fiche modifiée, un droit accordé, un prix posé             |
| Pourquoi      | perdre la trace dégrade une statistique ; casser le geste dégraderait le service | une trace manquée en silence laisse croire que rien n'a changé |
| Qui l'emploie | les abonnés de `b2b/growth/application/handlers/` et commandes de croissance     | tout ce qui passe par le port `Journal` (§3)                   |

**Pourquoi la table vit dans le schéma `growth`.** Le journal est né comme un
journal d'événements **analytiques** de la croissance (lead capté, commande
passée, étape franchie) : le cockpit commercial, le score des leads et les
indicateurs d'acquisition le lisent encore. Il est devenu ensuite la trace de
« qui a fait quoi ». Les deux usages lisent **les mêmes faits** — `order.placed`
est une statistique et une trace — et c'est pourquoi ils partagent une table.
Le nom du schéma est historique. **Décidé par Hugo le 2026-09-19** : on ne
déplace ni la table ni le code qui l'écrit. Le port `Journal`, lui, est en
`platform/` depuis le 2026-08-25 : les blocs métier ne dépendent pas de la
croissance pour écrire. Déplacer l'implémentation ferait de `platform` le
propriétaire de la table (`lint:prisma-model-ownership`) — six lecteurs de la
croissance en deviendraient des intrus — et y ferait entrer le vocabulaire
métier des modules.

Les deux passent par le **même** append (`prisma-activity-recorder.ts`) : seul
le `catch` diffère. Deux chemins d'écriture auraient divergé, et c'est le
rare — celui qui doit être fiable — qui aurait pourri en silence.

---

<a id="s3"></a>

## 3. Les trois chemins d'écriture

Les blocs métier ne voient pas `growth` (matrice des frontières, CLAUDE.md §3).
Ils écrivent au port **`Journal`** de la plateforme
(`platform/journal/journal.ts`, promu là le 2026-08-25), et c'est la racine de
composition (`appBootstrap/journal.module.ts`) qui le branche sur
`ActivityRecorder.recordOrFail`. `Journal.append` est donc **toujours
bloquant**.

```mermaid
flowchart LR
    subgraph Émetteurs
      PIM["Référentiel<br/>handler + PimJournal.trace()<br/>→ laissez-passer"]
      ACC["Comptes, zones, retraits…<br/>publishTraced(événement)"]
      STAFF["Annuaire staff<br/>journal.append(fait)"]
      PRICE["Tarification<br/>PricingActWriter"]
      GROW["Croissance<br/>abonnés d'événements"]
    end
    J["Journal (platform)<br/>append — bloquant"]
    R["ActivityRecorder<br/>(b2b/growth)"]
    T[("growth.activity_events")]
    PE[("public.pricing_events")]

    PIM --> J
    ACC --> J
    STAFF --> J
    PRICE --> J
    PRICE --> PE
    J -->|recordOrFail| R
    GROW -->|record — best-effort| R
    R --> T
```

**1. Le référentiel (`pim/`)** — le handler appelle `PimJournal.trace()` dans
une `UnitOfWork`, et reçoit un **laissez-passer** (`WriteTicket`) sans lequel
son dépôt refuse d'écrire : oublier la trace ne compile pas. Ses faits portent
des diffs et une **portée** (`blast`) que seul le handler sait calculer.
Détail : [`../pim/journalisation-et-tracabilite.md`](../pim/journalisation-et-tracabilite.md).

**2. Les actes nommés (`b2b/account`, zones, points de retrait, heures limites,
mandats…)** — l'événement de domaine **est** le fait : il implémente
`JournaledEvent.journalFact()` (`platform/journal/journal-fact.ts`), et
`publishTraced(event)` écrit au journal **puis** publie sur le bus
(`platform/events/cqrs-domain-event-publisher.ts`). Une seule description pour
le bus et pour le journal : l'écrire deux fois était la vraie source de dérive.

**3. L'annuaire staff (`staff/`)** — chaque handler appelle `journal.append`
dans sa `UnitOfWork`, avec l'avant et l'après de ce qui a changé.
Détail : [`../staff/journalisation-staff/architecture-journal-de-l-annuaire.md`](../staff/journalisation-staff/architecture-journal-de-l-annuaire.md).

**Et la croissance** écrit en direct à l'`ActivityRecorder`, en **best-effort**
(`record`) : ses abonnés tournent hors de la requête, et leurs faits
(`order.placed`, `order.ready`, `lead.*`…) servent le cockpit commercial, pas la
preuve.

La tarification est au §7.

---

<a id="s4"></a>

## 4. Ce qu'une ligne contient

L'émetteur ne fournit que **ce qui s'est passé** (`JournalFact`) : un `type` en
vocabulaire métier (`company.payment_terms_granted`), un sujet
(`subjectType` + `subjectId`), une charge utile petite, et un instant métier
s'il en connaît un autre que maintenant. **Tout le reste est dérivé** par
l'adaptateur, parce qu'un émetteur qui devrait le fournir finirait par se
tromper :

| Colonne                    | D'où                                                               |
| -------------------------- | ------------------------------------------------------------------ |
| `id`                       | ULID (`IdGenerator`) — trie par le temps, pagine l'écran           |
| `occurred_at`              | l'émetteur, sinon le `Clock` (l'instant gelé de la requête)        |
| `recorded_at`              | `now()` en base — l'écart avec `occurred_at` trahit un fait rejoué |
| `trace_id`                 | le `traceparent` de la requête, sinon une trace neuve (cron)       |
| `actor_type`, `actor_id`   | l'acteur du contexte de requête (§5)                               |
| `actor_name`, `actor_role` | **figés** à l'écriture (§5)                                        |
| `idempotency_key`          | dérivée (§6)                                                       |

La charge utile reste **petite et lisible sans rouvrir la base** : des libellés
figés, pas des clés. Une fiche renommée, un rôle supprimé : la ligne se relit
toujours.

---

<a id="s5"></a>

## 5. L'auteur

L'**acteur** d'une requête est posé une fois, dans le contexte de requête
(`platform/context/`), par le garde qui sait qui agit :

| Qui agit        | Posé par                                         | `actor_id`                                  |
| --------------- | ------------------------------------------------ | ------------------------------------------- |
| un client       | `AuthGuard` (garde global)                       | l'id de `users` — jamais le `sub`           |
| un membre staff | `StaffAccessGuard`, après résolution de la fiche | l'id de la **fiche** — jamais le `sub`      |
| une tâche       | `RecomputeGuard`, ou rien (hors requête)         | `null` / un marqueur, `actor_type = system` |

Le **nom et la fonction** sont résolus par `ActorNamer`
(`b2b/growth/infrastructure/prisma-actor-namer.ts`) **au moment de l'acte**, et
figés dans `actor_name` / `actor_role` : le journal dit qui a agi ce jour-là et
à quel titre, pas qui porte ce nom aujourd'hui. Une panne de résolution n'empêche
pas d'écrire — un fait anonyme vaut mieux qu'un fait perdu. Un client sans nom
saisi reste **sans nom** (`actor_name` nul, l'écran dit « un client ») : son
e-mail en tenait lieu jusqu'au 2026-09-19, et une coordonnée n'entre pas au
journal ([§13](#s13)).

**Le `sub` Auth0 n'est plus un auteur nulle part** depuis le 2026-09-18 : il est
sorti du type après l'authentification, l'historique a été converti, et deux
portes (`lint:subject-readers`, `lint:auth0-id-readers`) tiennent la liste de
ceux qui le lisent encore — pour l'identité seulement. Les faits écrits sous un
`sub` que la base n'a jamais relié à une fiche restent tels quels, et se
nomment quand même par leur `actor_name` figé. Tout le mécanisme, règle par
règle : [§12](#s12).

---

<a id="s6"></a>

## 6. L'idempotence

La clé est `type:subjectId:traceId`, dérivée par
`b2b/growth/domain/activity-event.ts`, unique en base. Un fait rejoué **par la
même requête** (même `traceparent`) retombe sur la même clé, et l'`INSERT`
**n'écrit rien, sans erreur** : `createMany({ skipDuplicates: true })`, soit
`INSERT … ON CONFLICT DO NOTHING`.

La clé est la **trace**, pas l'horloge : deux gestes identiques à la même
seconde, venus de deux requêtes, sont deux faits.

> **Pourquoi pas d'erreur, et pas un `catch`** : jusqu'au 2026-09-18, le
> recorder attrapait la violation d'unicité (`P2002`) après coup. C'était juste
> hors transaction ; **dans** une `UnitOfWork`, l'`INSERT` refusé mettait la
> transaction Postgres en échec, et le geste que le `catch` devait épargner
> était annulé au commit. Le test qui le prouve :
> `test/activity-events.e2e-spec.ts` (« un fait rejoué DANS une transaction
> n'annule pas le geste qui suit »).

---

<a id="s7"></a>

## 7. Le journal tarifaire, et pourquoi il a sa table

Un acte tarifaire (poser, suspendre, reprendre, archiver une règle, un plancher,
un barème, un engagement, une mercuriale) s'écrit **deux fois, dans la même
transaction que l'état**, par `PricingActWriter`
(`b2b/pricing/infrastructure/pricing-act.writer.ts`) :

- dans **`public.pricing_events`**, le journal **du domaine** : append-only,
  aucune colonne mutable, aucun port qui mette à jour ou efface — sur un prix
  négocié, la question de six mois plus tard est « qui a décidé ça, et qui l'a
  arrêté », et un journal réinscriptible ne le prouverait pas ;
- dans **`growth.activity_events`**, son **miroir général**, par `Journal.append`
  — pour que la tarification apparaisse au journal commun (module
  « commercial »).

Ce n'est donc pas un second journal qui concurrence le premier : c'est la
tarification qui garde sa propre preuve, lue par son écran (`GET
/admin/pricing/journal`), **et** alimente la chronique commune.

**Une exception, une seule, datée** : la migration
`20260918190000_conversion_des_auteurs_staff` a traduit l'auteur de
`pricing_events` du `sub` vers l'id de fiche (accordé par Hugo le 2026-09-18).
Elle est écrite dans le JSDoc du modèle, et ne vaut pas précédent.

---

<a id="s8"></a>

## 8. La lecture : l'écran Journal

`GET /admin/activity` (`b2b/growth/http/admin-activity.controller.ts`), sous la
permission `activity:read` — réservée à `admin` : le journal traverse tous les
modules, et le ranger sous l'un d'eux donnerait à son audience l'activité des
autres par la bande.

- **Module** — dérivé du préfixe du `type` (`b2b/growth/domain/activity-module.ts`),
  pas stocké : `pim`, `commercial` (dont les prix négociés), `commandes`,
  `comptes`, `equipe`, `production`, `comptabilite`. Un type qui ne se range
  plus sous un préfixe se renomme. Depuis le 2026-09-19, les règles comptables
  (`accounting_rules.`) et les points de vente (`point_of_sale.`) se rangent
  sous `pim` ; **`comptabilite`** (Hugo, 2026-09-19) porte notre entité
  émettrice (`legal_entity.`, sans module jusque-là) et les mandats SEPA
  (`payment_mandate.`, sous `comptes` jusque-là) — le travail de
  `b2b_accounting` et `b2b_payments`. Le RIB d'une société cliente
  (`company.bank_account_changed`) reste sous `comptes` par son préfixe ; les
  règles comptables restent sous `pim`, à côté des taux.
- **Filtres** — `module`, `type`, `subjectType`, `subjectId`, `actorId`,
  période ; un seul constructeur SQL (`activity-journal.where.ts`). Le filtre par
  acteur suit une personne sous **tous** ses identifiants (id de fiche et `sub`
  successifs, table `staff_subject_aliases`).
- **Recherche** `q` — 2 à 100 caractères, sur le nom de l'auteur, les
  **valeurs** de la charge utile (jamais ses clés), ou l'identifiant exact du
  sujet ; **sans casse ni accents**, par une même expression
  `lower(translate(…))` des deux côtés — sans extension, et sans dépendre de la
  locale de la base. Rien n'est stocké pour la servir. Les montants, en
  centimes, ne se trouvent pas en tapant « 12,50 » ; les ligatures (œ, æ) ne
  se déplient pas.
- **Pagination** par pages numérotées (`fold-paginator`), sur une **vue
  figée** : la page 1 fixe une ancre (`asOf`, le fait le plus récent qui répond
  aux filtres) et pages comme total se comptent jusqu'à elle — sans quoi, les
  faits arrivant en tête, une page 2 changerait entre deux clics. Un fait
  arrivé depuis apparaît en revenant en page 1. Le curseur `before` reste
  servi pour les lecteurs d'avant. Le journal tarifaire se lit de la même
  façon (`…/pages`).
- **Le rendu** en phrases françaises vit au front, dans le moteur de phrases
  (`lfc-B2B-admin-frontend/src/app/shared/journal/`, lot C du plan des
  phrases, 2026-09-19) : `render-fact.ts` pour tous les faits, une phrase par
  type dans le dossier `phrases` (celles de l'équipe dans `team-phrases.ts`),
  le détail de ce que la phrase ne dit pas dans `detail-rows.ts`.
  `journal-line.ts` en fait une ligne de l'écran Journal.

### La tranche fiscale

`GET /admin/activity/tax` (`b2b/growth/http/admin-tax-activity.controller.ts`,
2026-09-19) : la même page que le journal — mêmes filtres **sauf `module`**,
même recherche, mêmes pages figées —, bornée **au serveur** à une liste fermée
de types (`TAX_JOURNAL_SLICE`, `b2b/growth/domain/activity-slice.ts`). Hugo,
2026-09-19 : « la compta doit voir tout ce qui touche au taux ».

| Dans la tranche                                       | Pourquoi                                                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `vat_rate.*`                                          | les taux eux-mêmes                                                                                                                                                                                                                                                                                                                                                 |
| `product_category.vat_changed`, `product.vat_changed` | le taux d'une famille, ou la dérogation d'une fiche, **par contexte de vente** — la charge est indexée par la clé du contexte : c'est là que vit « un taux par contexte ». Fermer un canal écrit **aussi** ce fait quand la fermeture efface un taux (`{ contexte: { from, to: null } }`, dans la même transaction que `*.channels_changed`, depuis le 2026-09-19) |
| `product.reclassified`                                | la fiche change de famille (`{ from, to }`, deux identifiants), donc des taux dont elle hérite. Fait dédié du 2026-09-19, écrit à côté de `product.identity_saved` seulement quand la famille change : le diff d'identité entier inonderait la tranche de chaque nom retouché                                                                                      |
| `accounting_rules.*`                                  | le rapport et la méthode du prix pro, sous le même droit que les taux                                                                                                                                                                                                                                                                                              |
| `sales_context.*` — le type entier                    | le contexte ne porte aucun taux, mais il est l'axe du traitement fiscal : l'ouvrir en crée un, le mettre hors service le retire du réglable et de Shopify, le supprimer efface en cascade les lignes de taux restées sur lui. `updated` mêle cette bascule au libellé et au rang, sans fait dédié : un réglage du seul libellé remonte aussi                       |
| `order_late_fee.*` — le type entier                   | la surtaxe est une ligne facturée avec son propre taux, et chaque fait le porte avant et après. Un fait dédié au taux en ferait deux pour un geste que le lot 1 a voulu unique                                                                                                                                                                                     |

**Hors de la tranche alors qu'il peut toucher un taux** — un fait mêlé, dont
le fait dédié reste une décision (inventaire du 2026-09-19) :

- `catalog_revision.pushed`, `catalog_delivery.accepted` : la publication porte
  les taux jusqu'au canal, sans en porter un dans sa charge.

Les deux autres trous de cet inventaire sont **fermés le 2026-09-19** (Hugo
l'a validé le jour même) : la fermeture d'un canal écrit le fait de TVA du taux
qu'elle efface, et le reclassement d'une fiche écrit `product.reclassified`.
`*.channels_changed` et `product.identity_saved` restent **hors** de la
tranche — leur part fiscale est désormais dite par ces deux faits-là.

N'y entrent pas, parce qu'ils ne touchent aucun taux : `product.created` (la
fiche hérite du taux de sa famille, elle n'en change pas), `product_category.created`
(une famille naît sans taux), `product_category.moved` (une famille ne tient pas
son taux de son parent — `effectiveVat` ne lit que la famille directe), les
prix et les déclinaisons, le numéro de TVA intracommunautaire d'une société
(`company.identity_edited`) ou de notre entité (`legal_entity.*`), et le reste
de `b2b/` — aucun autre fait ne porte de taux.

- **La permission est `pim_tax:write`, exigée explicitement**
  (`@RequirePermission`) — décision de Hugo, 2026-09-19 : « qui écrit les taux
  relit leur histoire ». Déduite du verbe, un `GET` demanderait `pim_tax:read`,
  que portent `commercial` et `dev`. Au 2026-09-19, elle appartient à `admin`
  et `comptabilite` ; la comptabilité n'a toujours **pas** `activity:read`, et
  le journal entier lui reste fermé.
- **Une liste de types, pas un module** : le module `pim` ouvrirait tout le
  référentiel — fiches, familles, points de vente. Les familles et les fiches
  n'y entrent que par leur fait de TVA.
- **La tranche n'est pas un filtre, c'est un bord.** Elle est posée par le
  handler et jointe par `AND` en tête du `WHERE` (`activity-journal.where.ts`,
  le même constructeur que le journal) : ancre, total et pages se calculent
  dedans, et aucun paramètre ne l'élargit. `module` est retiré du contrat
  (`taxActivityQuerySchema`) ; envoyé quand même, le schéma l'écarte comme tout
  paramètre inconnu. Une tranche vide ne rend rien (`FALSE`), elle n'ouvre pas
  le journal.
- **Lire n'est pas écrire** : les contextes de vente s'écrivent sous
  `pim_settings` et la surtaxe sous les droits du commerce, que la comptabilité
  n'a pas ; elle en relit l'histoire sans pouvoir les régler.

Ailleurs, des lecteurs ciblés : l'attribution d'un diff de révision PIM
(`PimJournalReader`, qui lit le journal d'un produit sur un intervalle), le
journal tarifaire, le cockpit commercial, et l'**historique d'une fiche
produit** (`GET /pim/catalogue/products/:id/history`, port
`ProductHistoryJournal`) qui tresse ses trois cercles — la fiche et ses
déclinaisons, ce dont elle hérite (familles, taux appliqués, ingrédients,
appellations), les révisions qui l'ont emportée — rattachés par ce que la fiche
porte **aujourd'hui**.

---

<a id="s9"></a>

## 9. Ce qui empêche d'oublier

La journalisation repose sur une discipline, et une discipline se perd sans
bruit — la faute ne se voit que le jour où l'on demande « qui a changé ça ».
Ce qui la tient, du plus fort au plus faible :

| Garde-fou                                       | Ce qu'il tient                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Le laissez-passer `WriteTicket`                 | un dépôt du référentiel n'écrit pas sans trace — **le compilateur** refuse                                                                                                                                                                                                                                                                                                                                                                |
| `lint:journal-tracked`                          | tout handler de commande du PIM, de `staff/` et — depuis le 2026-09-19 — de `b2b/account/` (gestes du client compris, sans coordonnées), `b2b/subscriptions/`, `b2b/order-waivers/`, `b2b/payments/` (client compris), `b2b/catalog/` et `production/` (les gestes d'atelier et le colisage déclarent `@sans-journal`) journalise sous `UnitOfWork` — ou déclare `@sans-journal <raison>` / `@hors-transaction <raison>`, qui se greppent |
| `lint:events-tracked`                           | un abonné d'événement s'inscrit au travail de fond : sans ça, son écriture au journal échappe à `drain()` et à la gestion d'erreur                                                                                                                                                                                                                                                                                                        |
| `lint:subject-readers`, `lint:auth0-id-readers` | le `sub` Auth0 ne redevient pas un auteur, ni ne s'écrit dans un message                                                                                                                                                                                                                                                                                                                                                                  |
| La transaction du geste                         | un fait opposable et son geste tombent ensemble ou tiennent ensemble                                                                                                                                                                                                                                                                                                                                                                      |
| Le catalogue des faits (§13)                    | un type hors catalogue ne compile pas ; une charge qui ne suit pas son schéma lève sous les harnais de test                                                                                                                                                                                                                                                                                                                               |

**La règle pour ajouter un émetteur** : un fait mérite le journal quand il
change ce qui est vendu, facturé, ou ce que quelqu'un a le droit de voir. Le
reste est du bruit qu'il faudra filtrer plus tard.

---

<a id="s10"></a>

## 10. Ce qui s'appelle « journal » sans en être un

Pour ne pas les confondre :

- **`MailJournal`** (`platform/mailer/`) — ce qui est parti par e-mail, pour le
  délivrable ; pas un acte métier.
- **`StatusJournal`** (`ops/`) — l'état de santé de la plateforme.
- **Les « journaux de chantier »** de `documentation/production/` et
  `documentation/pricing/journal-de-remediation.md` — des carnets de travail,
  pas du code.

---

<a id="s11"></a>

## 11. Où est le code

| Quoi                             | Où                                                                                                                                       |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Le port des blocs métier         | `apps/lfd-api/src/platform/journal/journal.ts`, `journal-fact.ts`                                                                        |
| Le branchement                   | `apps/lfd-api/src/appBootstrap/journal.module.ts`                                                                                        |
| Le recorder, ses deux garanties  | `apps/lfd-api/src/b2b/growth/domain/ports/activity-recorder.ts`, `infrastructure/prisma-activity-recorder.ts`                            |
| La ligne et sa clé d'idempotence | `apps/lfd-api/src/b2b/growth/domain/activity-event.ts`                                                                                   |
| L'auteur figé                    | `apps/lfd-api/src/b2b/growth/infrastructure/prisma-actor-namer.ts`                                                                       |
| `publishTraced`                  | `apps/lfd-api/src/platform/events/cqrs-domain-event-publisher.ts`                                                                        |
| Le référentiel                   | `apps/lfd-api/src/pim/journal/`                                                                                                          |
| La tarification                  | `apps/lfd-api/src/b2b/pricing/infrastructure/pricing-act.writer.ts`                                                                      |
| La lecture                       | `apps/lfd-api/src/b2b/growth/http/admin-activity.controller.ts`, `infrastructure/activity-journal.where.ts`, `domain/activity-module.ts` |
| La tranche fiscale               | `apps/lfd-api/src/b2b/growth/http/admin-tax-activity.controller.ts`, `domain/activity-slice.ts`                                          |
| Le contrat                       | `packages/contracts/src/activity-journal.ts`                                                                                             |
| Le catalogue des faits (§13)     | `packages/contracts/src/journal-facts/`, `apps/lfd-api/src/platform/journal/journal-fact-check.ts`                                       |
| La table                         | `apps/lfd-api/prisma/schema/growth.prisma` (`ActivityEvent`)                                                                             |

---

<a id="s12"></a>

## 12. L'auteur est la fiche, jamais le `sub`

L'auteur de tout acte staff — colonne d'auteur, journal, charge utile — est
l'**id de la fiche** (`staff_users.id`). Le `sub` Auth0 est un identifiant
**chez un tiers** : il ne vit plus qu'à côté de chaque compte, pour la
connexion. Livré le 2026-09-18 en six déploiements ; le plan qui l'a conduit,
supprimé une fois livré, reste lisible dans l'historique git. Le code cite ces règles par leur étiquette — **D1** à **D9**,
**§8** — gardée ici telle quelle.

**D1 — Une seule porte pose l'auteur : `StaffAccessGuard`.** Il résout la fiche
et attache `{ type: "staff", id: access.staffUserId }` au contexte de requête ;
une requête refusée n'attache rien. `AdminAuthGuard` n'attache aucun acteur.
`@AdminSurface` monte toujours les deux gardes : aucune route staff n'y échappe.
Le contournement de développement se lie à la fiche racine et reçoit son id.

**D2 — Le `sub` est sorti du type.** `AdminAuthGuard` vérifie le jeton et remet
l'identité à `StaffAccessGuard` par un canal interne à `platform/auth/`
(`verified-staff-identity.ts`) ; après la résolution, la requête ne porte plus
que `access`. `@StaffSub()` n'existe plus : `@StaffUserId()` est le seul moyen
de nommer l'auteur. Côté client, `lint:subject-readers` tient la liste des deux
seuls lecteurs du `sub` du jeton.

**D3 — Le front et les exports reçoivent un nom.** Chaque vue qui sert un auteur
sert aussi `…ByName`, résolu au serveur. Le champ d'identifiant reste servi : il
porte l'id de la fiche ou un **marqueur** qui ne désigne personne (`system`,
`seed-pim`, `sonde`…), et l'écran l'affiche quand le nom manque
(`lfc-B2B-admin-frontend/src/app/shared/staff-author.ts`). L'export CSV des
mercuriales écrit le nom. `actorId` du journal reste servi : le filtre par
personne en a besoin.

**D4 — Les lecteurs acceptent toutes les formes.** Le port `StaffAuthorDirectory`
(`staff/directory/domain/staff-author-directory.ts`) nomme un auteur écrit par
id de fiche, par `sub` actuel, ou par un `sub` ancien de la table des `sub` ; le
port `StaffAuthorReferences` rend tous les identifiants d'une personne, et le
filtre par acteur du journal devient `actor_id IN (…)` — l'histoire d'une
personne ne se coupe pas. `b2b` n'y lit pas `staff_users` : il passe par ces
ports (`b2b/account/infrastructure/staff-block-directory.ts`, `ActorNamer`).

**D5 — La table des `sub`.** `staff_subject_aliases (sub, staff_user_id, source,
recorded_at)` garde **chaque** `sub` qu'une fiche a porté : semée des
`auth0_id` actuels (`source = 'current'`), puis écrite par toute liaison
(`markInvited`, le rapprochement du résolveur, `source = 'linked'`) dans la même
écriture. L'historique a été converti en joignant sur elle, et seulement sur
elle (`20260918190000_conversion_des_auteurs_staff`) ; ce qu'elle ne connaissait
pas est resté tel quel. Elle ne contient que des liens que la base a établis
elle-même.

**D6 — La signature d'une fiche produit reste dans la photo du catalogue.**
`readyBy` fait partie du contenu figé d'une révision : il dit qui avait validé
l'article **au moment de la publication**. Il porte l'id de fiche depuis la
conversion ; les contenus figés **avant** gardent leur `sub` — on ne réécrit pas
une ancre adressée par son empreinte —, et le diff de révision les nomme par D4
(`nameSignatories`, `revision-diff-support.ts`). La révision qui a suivi la
conversion a vu chaque article signé changer d'empreinte une fois.

**D7 — Les journaux ont été traduits, une fois.** `activity_events.actor_id`
(faits staff), les clés `readyBy` / `handedOverBy` des charges utiles, et
`pricing_events.actor` : un identifiant de la même personne en a remplacé un
autre — ni le fait, ni son sujet, ni son instant n'ont bougé. Exception accordée
par Hugo pour le journal tarifaire, écrite dans le JSDoc du modèle, et qui ne
vaut pas précédent (§7).

**D8 — Les noms ne mentent plus.** Les colonnes `*_by_sub` et `staff_sub` sont
devenues `*_by_staff_id` et `staff_user_id`, en trois déploiements (étendre,
basculer, resserrer : 5A, 5B, 5C) ; `StaffTrace.sub` et les champs `sub` des
contrats ont disparu.

**D9 — Un abonnement push appartient à une fiche** (`staff_user_id`). Il reste
une trace, pas un ciblage : toute notification part à tous les abonnements —
point repris par le plan de départ d'un membre.

**Une fiche ne se supprime plus** (étape 0) : `DELETE /admin/staff-users/:id`
répond `409` ; la fiche porte l'auteur de tout ce que la personne a fait.

**§8 — Les clients.** L'acteur d'une requête client est l'id de `users`, jamais
le `sub` (`AuthGuard`, depuis le 2026-08-07) ; le seul `sub` client en base est
`users.auth0_sub`. `ProfileView.subject` a été retiré ; ni les logs ni les
messages d'erreur (`IdentitySubjectUnknownError`) ne portent de `sub`.

**Ce qui le tient** : le type (D2), et deux portes — `lint:subject-readers` (le
`sub` du jeton) et `lint:auth0-id-readers` (le même identifiant rangé en base :
seize lecteurs admis, chacun avec sa raison, et jamais interpolé dans un
message). La requête de contrôle, en lecture seule, compte ce qui reste écrit
sous un `sub` : [`../staff/requetes/inventaire-des-auteurs-staff.sql`](../staff/requetes/inventaire-des-auteurs-staff.sql).

---

<a id="s13"></a>

## 13. Le catalogue des faits

> Livré le 2026-09-19 — lot A du plan
> [`plan-phrases-du-journal.md`](plan-phrases-du-journal.md) (D1, D2).

**Où.** `@lfd/contracts/journal-facts` (`packages/contracts/src/journal-facts/`),
une entrée du paquet **à part du baril** : elle embarque zod et tous les
schémas, et le front de la plateforme n'a pas à les porter. Un fichier par
famille (référentiel, commerce, comptes, commandes et production, tarification,
comptabilité, équipe), réunis dans `JOURNAL_FACTS` : chaque type écrit dans
`growth.activity_events`, avec le schéma zod **fermé** de sa charge. Les
montants, taux et dates y portent leur unité (`.meta({ unit })` : centimes,
millicentimes, points de base, pourcentage, instant, jour…), les identifiants
nus ce qu'ils désignent (`.meta({ ref })`). Les types **retirés** — encore en
base, plus écrits — y restent, marqués `retired`, avec la charge de leur époque.

**Ce que le code en tire.** `JournalFact.type`, `PimJournalEntry.type` et
`RecordActivityInput.type` sont typés `JournalFactType` : les constantes des
contextes (`PIM_EVENTS`, `ACCOUNT_FACTS`, `ACTIVITY_TYPES`, `STAFF_FACTS`…)
s'y confrontent par `satisfies`, et la tarification lit ses types dans une
table sujet × geste typée par le catalogue (`pricing-act.ts`). Un type hors
catalogue **ne compile pas**.

**Ce que vérifie l'écriture.** `PrismaActivityRecorder`, le seul écrivain de
la table — tous les chemins du §3 y passent, best-effort compris —, confronte
chaque fait par `JournalFactCheck` (`platform/journal/`) : type inconnu, type
retiré, charge qui ne suit pas son schéma (clé en trop comprise).

| Mode                   | Où                                                                                   | Un écart                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **strict**             | sous les harnais de test (`JOURNAL_STRICT_FACTS=true`, posé par `test/setup-env.ts`) | **lève** — le fait n'est pas écrit, et le test le voit              |
| **indulgent** (défaut) | partout ailleurs, et **toujours** en production (la variable y est ignorée)          | une **erreur** au journal applicatif, et le fait s'écrit quand même |

Indulgent en production par décision de Hugo (2026-09-19) : le journal est dans
la transaction du geste, et une charge mal décrite ne doit jamais annuler une
commande réelle. Les doubles partagés des tests unitaires (`RecordingJournal`,
`RecordingPublisher`, `RecordingActivityRecorder`…) appliquent la même
vérification stricte.

⚠️ **Sur le chemin best-effort des abonnés** (croissance), un écart en mode
strict lève dans le travail de fond, que `BackgroundWork` journalise et avale :
le test ne le voit que s'il attend le fait.

### Les noms figés (lot B, 2026-09-19)

> Lot B du plan [`plan-phrases-du-journal.md`](plan-phrases-du-journal.md)
> (D5, D6, D7), 2026-09-19.

**Un fait cite ce dont il parle avec son nom du moment.** Un objet cité l'est
en `{ id, name }` (`named` dans `fact.ts`) : l'id pour les liens et les
filtres, le nom pour la lecture. Une famille renommée depuis se lit, sur les
lignes d'avant, sous son ancien nom — le journal dit ce qui était vrai quand
c'est arrivé, comme il le fait déjà pour l'auteur. La résolution à la lecture
est écartée : elle mentirait sur le passé et traverserait les frontières.

- **Une personne** se cite `{ id, name? }` : le nom est facultatif dans le
  domaine, et l'e-mail n'en tient jamais lieu.
- **Une adresse de livraison** se cite `{ id, ville, codePostal }` — par son
  lieu, comme le staff la journalise (décision de Hugo du 2026-09-19,
  `a151ccee`) —, jamais par son libellé, texte libre du client.
- **Un objet que l'annuaire ne nomme pas** (une fiche staff illisible, un
  point de retrait disparu, une société qu'aucune clé étrangère n'exige) se
  cite par son seul id (`namedOrBare`) : le fait ne se perd pas pour un nom
  manquant, et il n'en invente pas.

**Le sujet de la ligne a un nom**, dans la clé conventionnelle `subjectLabel`
de la charge (D6) — pas de colonne : la recherche lit déjà la charge. Il est
**facultatif** là où le sujet peut ne pas en avoir (une personne sans nom
saisi, une inscription), et absent par construction de quelques types, chacun
avec sa raison écrite (un panier récurrent, une règle d'heure limite, un
réglage unique, une arrivée de catalogue, les ingrédients d'une fiche — le
contexte des ingrédients ne lit pas les fiches, et ne doit pas les lire).

**Les formes anciennes restent lisibles.** Le journal ne se réécrit pas : une
charge qui gagne un nom ou perd une coordonnée garde sa forme d'avant dans
`history` (`fact(payload, [formes anciennes])`). L'écriture ne vérifie que la
forme courante ; le lecteur les essaie toutes (`journalPayloadShapes`). Une
ligne d'avant qui ne porte qu'un id se dit « une famille (identifiant …) »,
jamais par un nom résolu aujourd'hui (§6.2 du plan).

🔴 **Jamais de coordonnées au journal.** Aucune forme courante ne porte de clé
`email`, à aucune profondeur. Trois chemins en écrivaient une jusqu'au
2026-09-19 et n'en écrivent plus :

| Chemin                                                 | Avant                                                 | Depuis                                                                                        |
| ------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `user.registered` (`OnUserRegistered`)                 | `{ email }`                                           | `{ subjectLabel? }` — le nom de la fiche s'il y en a un                                       |
| `reco.shown` (`GetCockpitHandler`)                     | sans libellé, parce que celui du cockpit EST l'e-mail | `subjectLabel` : le nom de la fiche d'une personne, l'enseigne d'une société ou d'un prospect |
| `actor_name` d'un client sans nom (`PrismaActorNamer`) | son e-mail                                            | `null`                                                                                        |

La file des prospects, qui lisait l'e-mail dans la charge de
`user.registered`, le lit désormais sur la fiche de la personne
(`CustomerEmailReader`) ; la charge d'une ligne ancienne n'est plus qu'un
repli pour une personne que la fiche ne connaît plus.

⚠️ **La seule exception** : `feature_access.exemption_added` / `_removed`
portent encore l'adresse exemptée — mise de côté par Hugo le 2026-09-19,
[`todo-derogations-d-acces.md`](todo-derogations-d-acces.md).

**Ce qui le tient.** `packages/contracts/src/journal-facts/__tests__/closure.spec.ts`, sur le
catalogue entier : chaque type actif porte `subjectLabel` (obligatoire ou
facultatif), aucune clé ne cite un objet par son seul id, aucune forme
courante ne porte d'`email` — chaque règle avec sa liste d'exemptions, **et
la raison de chacune**. Un type neuf qui n'y satisfait pas échoue ; l'exempter
demande d'écrire pourquoi. Les listes se vident, elles ne grandissent pas.
