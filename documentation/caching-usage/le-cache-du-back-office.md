# Le cache du back-office — un numéro par sujet, un veilleur par onglet

> ✅ **Doc d'état, relue dans le code le 2026-11-12.** En production depuis
> `adb9c41e3` : les numéros par sujet, l'objet des journées, l'écran
> Catalogue, les lectures du PIM, l'onglet Cache. Sur `dev` seulement :
> l'aiguillage des objets par le chemin (`91f6856c2`, § 3). Ce document
> remplace les cinq plans du chantier (veilleur unique, écran Catalogue,
> lectures du PIM, onglet Cache, objet des journées) ; leurs versions et
> leurs contradictions par `vitruve` sont dans l'historique git.

# Partie 1 — L'explication simple

## 1. Ce que fait le back-office pour ne pas relire la base

La base de production est facturée à l'opération. Un écran du back-office
ouvert toute la journée ne doit donc pas tout relire à chaque instant.

- **Chaque sujet a un numéro** : une journée (commandes, fournil, livraison,
  ma tournée), les comptes clients, toutes les commandes, l'écran Catalogue,
  le référentiel (PIM). Le numéro est écrit **par la base**, par des
  déclencheurs : une écriture ne peut pas l'oublier.
- **Un seul veilleur par onglet** demande toutes les 15 s, en une requête,
  les numéros des sujets que suivent les écrans ouverts. Un écran ne se
  relit que si l'un de SES numéros a changé. Un filet relit tout au bout de
  5 minutes.
- **Un objet partagé** (Durable Object `DayVersions`) garde les numéros et
  les contenus lourds (l'écran Catalogue, les listes et fiches du PIM) pour
  tous les postes et toutes les instances de l'API : une seule lecture de la
  base par changement, quel que soit le nombre d'onglets.
- **Si l'objet tombe, on lit la base** : la disponibilité ne dépend jamais
  de lui.
- **L'onglet Cache** de la page Santé montre, par cache, le taux de réussite
  et la taille rangée, heure par heure sur 30 jours.

```mermaid
flowchart LR
  E1["Supervision, atelier, colisage, comptoir"] --> W["Veilleur de l'onglet"]
  E2["Comptes clients, Commandes"] --> W
  E3["Catalogue, PIM"] --> W
  W -->|"toutes les 15 s, une requête"| P["GET admin/versions"]
  P --> O["Objet partagé DayVersions"]
  O -->|"numéro trop vieux ou absent"| B[("Base")]
  E3 -->|"numéro changé"| C["Contenu de l'écran"]
  C --> O
```

```mermaid
sequenceDiagram
  participant E as Onglet
  participant A as API
  participant O as Objet partagé
  participant B as Base
  E->>A: admin/versions, sujets suivis
  A->>O: carte des numéros
  alt carte fraîche
    O-->>A: tous les numéros de la portée
  else carte absente ou périmée
    A->>B: un numéro par sujet
    A->>O: range la carte complète
  end
  A-->>E: seulement les sujets permis
  E->>E: relit l'écran dont un numéro a changé
```

# Partie 2 — La technique

## 2. Les numéros

### 2.1 Des sujets, journaliers ou globaux

Le fil (`packages/contracts/src/versions.ts`) connaît deux portées :

- **journalière** — les journaux de journée `DAY_JOURNALS` (`orders`,
  `production`, `delivery`, `my-round`), dont le numéro dépend d'une journée
  de service, d'où la `date` ;
- **globale** — `GLOBAL_VERSION_SUBJECTS` : `companies`, `orders-all`,
  `catalog-admin`, `pim`.

Côté API, deux registres (`apps/lfd-api/src/platform/day-versions/`) :
`DayVersionRegistry` (ports `DayVersionSource`) et `VersionRegistry` (ports
`GlobalVersionSource`). Chaque source déclare son nom, ses lecteurs (les
droits qui l'ouvrent) et sa fenêtre de fraîcheur `freshMs`. Les sources
vivent dans leur bloc et sont reliées par
`appBootstrap/day-version-sources.module.ts` :

| Sujet            | Source                                                                                                        | Fenêtre                        | Droit                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------- |
| journaux du jour | `OrdersDayVersionSource`, `ProductionDayVersionSource`, `DeliveryDayVersionSource`, `MyRoundDayVersionSource` | 15 s (`DAY_VERSIONS_FRESH_MS`) | celui de chaque journal                                                               |
| `companies`      | `lafoliecoffee/account/application/services/companies-version.source.ts`                                      | 30 s                           | `b2b_companies:read`                                                                  |
| `orders-all`     | `lafoliecoffee/orders/application/services/all-orders-version.source.ts`                                      | 15 s                           | `b2b_orders:read` seul — pas les lecteurs du journal `orders` (comptoir, Supervision) |
| `catalog-admin`  | `lafoliecoffee/catalog/application/catalog-admin-version.source.ts`                                           | 15 s                           | `lfc_catalog:read`                                                                    |
| `pim`            | `pim/changes/application/pim-version.source.ts`                                                               | 30 s                           | `pim_catalog:read`, `pim_tax:read`, `pim_settings:read` ou `allergen_matrix:read`     |

### 2.2 Les journaux et leur numéro

Chaque numéro est lu sur **un journal en ajout seul**, alimenté par des
déclencheurs `FOR EACH STATEMENT` — jamais par un compteur d'une ligne, qui
verrouillerait toutes les écritures d'un sujet jusqu'au commit :

| Journal                                                           | Migration                                                  | Alimenté par                                                                                      |
| ----------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `public.day_change`, `production.day_change`, colisage, livraison | `20260928140000_la_version_par_journee` et suivantes       | les tables de la journée ([`version-par-journee.md`](version-par-journee.md))                     |
| `public.company_change`                                           | `20261112180000_les_journaux_des_comptes_et_des_commandes` | la société, ses membres, comptes bancaires, forme de prélèvement, adresses, procédures, contacts… |
| `public.order_change`                                             | même migration                                             | `orders`, `order_lines`, `order_handover`, **sans condition de date**                             |
| `public.catalog_admin_change`                                     | `20261112190000_le_journal_de_l_ecran_catalogue`           | § 4.3                                                                                             |
| `pim.pim_change`                                                  | `20261112210000_le_journal_du_referentiel`                 | § 5.2                                                                                             |

**Le numéro est `max(id)` + `count(*)`** sur le même périmètre, lus dans la
même requête et encodés en un nombre (`platform/day-versions/journal-version.ts`,
`journalVersion`). `max(id)` seul rate une validation tardive : A prend 100,
B prend 101 et valide d'abord ; quand A valide, le maximum reste 101. Le
compte, lui, monte. Un numéro se compare **par égalité**, jamais par ordre
(décidé par Hugo le 2026-11-12). Un identifiant au-delà de 2^32 lève
`JournalVersionOverflowError`.

**Purge à 7 jours**, comme `day_change` : chaque journal a son élagueur
(`prune-company-changes`, `prune-order-changes`, `prune-catalog-admin-changes`,
`prune-pim-changes`) sur la passe nocturne. Le PIM a sa propre route,
`admin/pim/changes/sweep`, appelée par le cron du Worker
(`container/worker.ts`). Une purge fait baisser le compte : une relecture de
trop, jamais un numéro qui ment.

### 2.3 La porte et l'objet

`GET admin/versions?date=AAAA-MM-JJ&subjects=orders,companies`
(`platform/day-versions/versions.controller.ts`, `@AdminSelfSurface`) →
`{ date, versions: { sujet: numéro } }`. `date` n'est exigée que si un sujet
journalier est demandé ; un sujet inconnu est un 400 qui le nomme. Le droit
se tranche **par sujet** dans `get-versions.handler.ts` : un sujet non permis
est absent, sans refuser les autres.

L'ancienne porte `GET admin/day-versions` (`day-versions.controller.ts`) est
encore servie pour un onglet resté sur un ancien bundle (§ 7).

L'objet garde deux sortes de cartes : (révision, journée) et (révision,
`global`). **La carte rangée contient tous les sujets de sa portée** ; le
droit filtre après la lecture, jamais avant (un poste limité ne fait pas
ranger une carte partielle qui laisserait un autre poste sans numéro).
Chaque sujet garde son instant de lecture : un sujet à 30 s n'oblige pas à
relire un sujet à 15 s. Une relecture à la fois par carte et par instance
(single-flight).

### 2.4 Le veilleur de l'écran

`VersionWatcher` (`apps/lfd-backoffice-frontend/src/app/shared/version/version-watcher.ts`) :

- un écran appelle `watch({ subjects, date?, reload })` — les sujets globaux
  passent par `watchGlobalSubjects` (`watch-global-subjects.ts`) ;
- toutes les 15 s, onglet visible, le veilleur rassemble les sujets de TOUS
  les écrans ouverts et fait une seule requête (une par journée affichée) ;
- il ne rappelle que les écrans dont un sujet a bougé ; filet de 5 min ; il
  s'arrête quand plus personne ne regarde.

Abonnés : les écrans de journée ; la liste et le détail des sociétés et le
compteur du menu (`comptes-clients/company-cache/`, `companies`) ; l'onglet
Commandes de la fiche et `/commandes` (`orders-all`) ; l'écran Catalogue
(§ 4.4) ; les stores du PIM (§ 5.4). Le store du détail des sociétés ne garde
que les 50 dernières fiches ouvertes (`COMPANY_DETAIL_MAX_ENTRIES`, décidé
par Hugo le 2026-11-12). La porte `day-version-door`
(`dev-toolbox/gates/day-version-door.mjs`) tient l'appel de la porte par le
seul veilleur.

## 3. L'objet partagé et son chemin

- **L'objet** `DayVersions` (`apps/lfd-api/container/day-versions.ts`,
  stockage SQLite `day-versions-store.ts` pour les numéros et
  `versioned-contents-store.ts` pour les contenus), lié dans `wrangler.jsonc`
  par la migration de classe `v3` (`new_sqlite_classes: ["DayVersions"]`).
- **La clé porte la révision du code** : une carte se remplace par la plus
  récemment LUE (instant pris au début de la lecture en base), jamais par
  comparaison de numéros — une formule qui change au déploiement ne fige
  aucun écran.
- **Le chemin** : l'API appelle `http://objets.interne/journees/…` ; le
  Worker intercepte ce seul hôte (`Backend.outboundByHost`) et choisit
  l'objet par le **préfixe du chemin** (`container/internal-objects.ts` :
  `/rayons/…` → `ProShelves`, `/journees/…` → `DayVersions`, préfixe retiré,
  404 sinon). Deux hôtes fictifs distincts livraient en production les appels
  des journées à `ProShelves` (constaté dans l'onglet Cache le 2026-11-12) :
  l'objet répondait 400, l'API relisait la base, rien de faux n'était servi
  mais rien n'était gardé. La cause exacte côté runtime n'est pas prouvée
  (non reproduite sous `wrangler dev`) ; le préfixe ne dépend d'aucun choix
  d'hôte. Les anciens hôtes `rayons.interne` et `journees.interne` restent
  aiguillés par l'hôte, pour un conteneur démarré avant la bascule.
- **Les briques de l'appel** (`apps/lfd-api/src/platform/cache-calls/`) :
  garde borné (`bounded-call-guard.ts`), disjoncteur (`call-breaker.ts`),
  mesure par cache nommé (`cache-call-timings.ts`), partagées avec le rayon.
  Lecture bornée à 400 ms, rangement à 2 s, disjoncteur ouvert 30 s
  (`resilient-day-versions-cache.ts`). Objet injoignable, lent ou disjoncteur
  ouvert → `null`, et le handler lit la base.
- **Les e2e** tournent sans URL d'objet (adaptateurs `NoDayVersionsCache`,
  `NoVersionedContentCache`) : la porte est éprouvée en base, le cache par
  les tests des adaptateurs et des handlers, et par
  `container/__tests__/internal-objects.spec.ts`, qui fait passer les vrais
  adaptateurs par l'aiguillage du Worker.
- **Les contenus** (`versioned-contents.ts`, port `VersionedContentCache`) :
  une ligne par clé, remplacée à chaque rangement, sous un numéro. Une clé
  admet `[a-z0-9:-]{1,64}`.
- **La charge est compressée** (décidé par Hugo le 2026-11-13) : l'API la
  compresse en gzip avant l'envoi et la décompresse à la lecture
  (`apps/lfd-api/src/platform/day-versions/content-compression.ts`, `CompressionStream` du standard Web, global sous
  Node 22). L'objet range des **octets opaques** (`contents.body`, un BLOB) et
  la taille en clair que l'API annonce (en-tête `x-content-raw-bytes`,
  colonne `contents.raw_bytes`). Le plafond de 1 Mo (`CONTENT_MAX_BYTES`,
  `VERSIONED_CONTENT_MAX_BYTES`) se mesure **compressé** ; au-delà, la
  réponse n'est pas rangée et l'écart est journalisé avec ses deux tailles.
- **Une charge illisible est un raté** : des octets que gzip refuse sont
  journalisés (`versioned_contents.unreadable`) et l'API relit la base,
  jamais une erreur servie. Une ligne rangée en JSON clair (sans l'en-tête
  gzip) se lit telle quelle, et le prochain rangement la remplace.

### 3.1 Les contenus des écrans de journée

Cinq écrans y sont branchés : la fiche du fournil (§ 3.2), le colisage
(§ 3.3), les deux files de retrait (§ 3.4) et les tournées (§ 3.5). Chacun lit
les numéros de son étiquette par le registre — `DayVersionRegistry.versionsOf`
pour des journaux de journée, `VersionRegistry.versionsOf` quand un sujet
global (`companies`) s'y ajoute —, en base, avant ses données.

- **La table** `day_contents(key, screen, day, tag, body, raw_bytes)` de
  l'objet (`container/day-contents.ts`, décisions dans
  `container/day-contents-store.ts`) : une ligne par (révision, écran,
  journée), `key = r:<révision>/<écran>/<AAAA-MM-JJ>`.
- **L'étiquette** est la liste des numéros en clair, sujets triés
  (`orders:12.production:4`), sans hachage : une collision servirait un
  mauvais contenu en silence. L'API la construit (`day-content-tag.ts`) à
  partir des numéros lus en base avant les données ; l'objet refuse une
  étiquette non canonique.
- **Servie à étiquette ÉGALE** seulement ; une autre est un raté (404).
- **Un rangement ne remplace la ligne que si chaque numéro de son étiquette
  est ≥ celui gardé** : les numéros ne font que monter, aucune horloge
  n'entre dans la décision. Une étiquette plus ancienne ou **incomparable**
  (plus haute sur un sujet, plus basse sur un autre) laisse la ligne en
  place, réponse 202 : la lecture suivante lit des numéros ≥ aux deux et la
  remplace.
- **Le ménage se fait au rangement** : les journées de plus de 3 jours
  (`FORGET_AFTER_DAYS`) avant celle rangée s'oublient, toutes révisions
  comprises, et une autre révision du même écran et de la même journée est
  retirée.
- **La route** : `GET` / `PUT /journees/day-contents/<écran>/<AAAA-MM-JJ>?revision=…&tag=…`,
  sous le même hôte interne ; plafond de 1 Mo compressé, 413 au-delà.
- **Côté API**, `DayContents.contentOf({ screen, day, versions }, load, { accepts, storable })`
  (`apps/lfd-api/src/platform/day-versions/day-contents.ts`, port
  `DayContentsCache`, adaptateurs `DurableObjectDayContentsCache` et
  `NoDayContentsCache`) : mêmes garde, disjoncteur et gzip que les contenus
  versionnés, une relecture à la fois par (écran, journée, étiquette) et par
  instance ; un contenu dégradé (`storable` faux) est servi, jamais rangé.
  Mesures sous `day_contents.*`.
- **L'onglet Cache** compte chaque écran sous `day-<écran>`.
- **L'hôte interne n'est pas joignable du dehors** (vérifié le 2026-11-13) :
  la passerelle n'atteint `lfd-api` que par sa liaison de service, qui
  aboutit au `fetch` par défaut du Worker ; celui-ci ne transmet qu'au
  conteneur. L'aiguillage vers les objets n'est inscrit que comme
  interception des appels SORTANTS du conteneur (`Backend.outboundByHost`),
  et refuse un autre conteneur (403) ; `workers_dev` est coupé.

### 3.2 La fiche du fournil

Les trois routes de la fiche — `GET admin/production/worksheet?date=`,
`GET admin/supervision/preparation?date=` et
`GET admin/production/worksheet/current` — passent par
`WorksheetContents` (`apps/lfd-api/src/production/application/services/worksheet-contents.service.ts`)
et partagent **une clé, l'écran `worksheet`** : les deux premières envoient
la même requête et rendent les mêmes octets (mesuré au lot 0, tenu par
`apps/lfd-api/test/production-worksheet-contents.e2e-spec.ts`). La fiche en cours résout
sa journée hors de l'objet (l'heure, l'arrêt du plan de demain), puis lit
le contenu de cette journée par la même clé.

- **L'étiquette** : les numéros `production` (fournil + colisage) et
  `orders` de la journée, lus **en base** par les `DayVersionSource` du
  registre (`DayVersionRegistry`, déclaré dans `platform`), **avant** les
  données. La fiche ne porte aucun nom de société ni de client : le sujet
  `companies` n'en est pas.
- **Lu hors journal, accepté vieux jusqu'au prochain numéro** (Hugo,
  2026-11-13) : les contenants, le réglage d'affichage, les rayons du
  catalogue, le réglage des tranches (paliers d'échéance), les contrôles
  qualité.
- **Jamais rangée** : une fiche dont les rayons, les paliers ou l'attente du
  four sont en panne (`WorksheetContent.complete` faux) — servie, relue au
  prochain appel.
- **Recalculé à chaque réponse** : `relativeDay` (`servedWorksheet`) ; la
  lecture (`ProductionWorksheetReading.contentOf`) ne lit pas l'horloge.
- **Gain** : un appel servi depuis l'objet coûte les deux lectures de
  numéros (3 opérations Prisma) au lieu de la fiche entière (23 opérations
  sur la journée la plus chargée de la base de dev, mesure du lot 0).
- **L'atelier** suit `production` et `orders` dans son veilleur
  (`fiche-atelier.ts`) : une commande du jour fait relire la fiche.

### 3.3 Le colisage

`GET admin/packing/:date/board` (`production_packing:read` ou
`b2b_supervision:read`) rend la même réponse au poste et à la Supervision :
une clé `packing`. Les numéros `production`, `orders` et `delivery` sont lus
en base avant les tables ; pas de `companies` (le nom du client est
l'instantané rangé par le colisage). Lu hors journal et accepté vieux jusqu'au
prochain numéro : les noms du personnel (qui a fermé un bac, qui a décidé un
départ incomplet). Aucun repli dégradé : une panne d'un canal fait échouer la
réponse, et rien n'est rangé. `relativeDay` est recalculé à chaque réponse
(`servedPackingBoard`). Un appel servi par l'objet épargne les huit lectures
des ports (environ 18 requêtes sur une journée colisée) pour 4 lectures de
numéros. Code : `packing/application/board/get-packing-board.handler.ts`,
`packing-board-reading.service.ts`, `packing-board-content.ts`.

### 3.4 La file du retrait

Deux routes, deux périmètres posés par la route, **deux clés** (leurs octets
diffèrent) :

| Route                                  | Droit              | Périmètre   | Clé                |
| -------------------------------------- | ------------------ | ----------- | ------------------ |
| `GET admin/handover/file?jour=`        | `handover_counter` | `counter`   | `handover-counter` |
| `GET admin/supervision/handover?jour=` | `b2b_supervision`  | `whole_day` | `handover-day`     |

Le comptoir ne reçoit ni livraison ni tournée : la lecture retire les
livraisons avant de lire les tournées, et sa clé ne se partage jamais avec
celle de la journée entière. Les chiffres du cockpit
(`admin/cockpit/handovers`) ne passent pas par l'objet.

- **L'étiquette** : `orders` (la commande, son règlement et son retrait,
  écrits dans la même transaction), `production` (retenues qualité, prêt du
  colisage), `delivery` (transferts, réassort, place en tournée) et le sujet
  **global** `companies` : la ligne porte la raison sociale, l'enseigne et le
  nom de qui a commandé (`handover-order.query.ts`), que le journal des
  comptes suit (`companies`, `users`). Lus en base par
  `VersionRegistry.versionsOf`, avant les tables ; l'étiquette s'écrit
  `companies:…delivery:…orders:…production:…`. Les veilleurs du comptoir et
  de la Supervision suivent aussi `companies`, ouvert à `handover_counter` et
  `b2b_supervision` (décidé par Hugo le 2026-11-13) : un nom changé se relit
  dans les 30 s.
- **Aucune heure** : la vue rangée est servie telle quelle.
- **Lu hors journal, accepté vieux jusqu'au prochain numéro** : le libellé du
  site d'un transfert.
- **Aucun repli dégradé** : une panne d'une lecture fait échouer la réponse,
  rien n'est rangé.
- **Gain** : un appel servi par l'objet coûte quatre lectures de numéros au
  lieu de la file (environ 11 requêtes sur la journée la plus chargée de la
  base de dev, mesure du lot 0 : file, attestations, retenues, transferts,
  réassort, tournées).

Code : `handover/application/queries/get-handover-queue.handler.ts`,
`apps/lfd-api/src/handover/application/queries/handover-queue-content.ts`, `apps/lfd-api/src/handover/application/services/handover-queue-reading.service.ts`.

### 3.5 Les tournées

`GET admin/delivery/rounds?day=` (`delivery_rounds`), clé `rounds`. « Ma
tournée » n'y passe pas : sa réponse dépend de la personne.

- **L'étiquette** : `delivery` et `orders`, lus en base avant les tables. Pas
  de `companies` : l'écran ne sert que la référence et la clientèle d'une
  commande, jamais un nom.
- **Ce qui est rangé** (`RoundsDayComposition`,
  `apps/lfd-api/src/delivery/application/rounds-day-composition.ts`) :
  ce que les numéros de CETTE journée suivent — les tournées et la place de
  leurs arrêts, les livraisons attendues du jour non annulées, les
  signalements.
- **Ce qui est lu à CHAQUE appel** (`RoundsDayLiveReading`) et posé sur le
  contenu par `servedRoundsDay` :
  - les livreurs, leurs droits et leur nom (Hugo, 2026-11-13) : un droit
    retiré se voit au prochain appel ;
  - la flotte (Hugo, 2026-11-13) : zones autorisées (« hors zone ») et
    véhicule retiré ;
  - la place au dépôt : elle se tire de la charge des véhicules — la flotte —
    et des réglages de tournée ; rangée, elle avertirait sur une flotte qui
    n'est plus ;
  - les commandes rapportées à replacer et la date de chaque retour : elles
    viennent de n'importe quel jour, qu'aucun numéro de CETTE journée ne suit ;
  - ce que le commerce dit des commandes composées (annulée, jour, retrait
    au comptoir, zone, clientèle, référence), et les attendues déjà placées
    dans une tournée vivante : une commande d'un autre jour annulée, ou
    placée dans une tournée d'un autre jour, fait monter le numéro de CET
    autre jour, jamais celui de l'écran.
- **Aucun repli dégradé** dans ce qui est rangé.
- **Gain** : un appel servi par l'objet épargne les tournées, les attendues
  et les signalements (trois lectures de ports) pour deux lectures de
  numéros ; tout le reste est lu à chaque appel.

Code : `delivery/application/queries/get-delivery-rounds-day.handler.ts`,
`apps/lfd-api/src/delivery/application/rounds-day-reading.service.ts`, `apps/lfd-api/src/delivery/application/rounds-day-live.service.ts`,
`apps/lfd-api/src/delivery/application/rounds-day-composition.ts`, `delivery-rounds-view.ts`.

## 4. L'écran Catalogue

### 4.1 Une route pour l'écran

`GET admin/catalog/screen`
(`lafoliecoffee/catalog/http/admin-catalog-screen.controller.ts`, sous
`lfc_catalog`) rend en une fois la vue publiée, les lignes de paramétrage et
le numéro `catalog-admin`, lu **avant** les données. Les marqueurs du sur
mesure n'y entrent que si l'appelant a `lfc_made_to_order:read` : le handler
(`get-catalog-screen.handler.ts`) reçoit les permissions et tranche. La
route ne résout pas les auteurs des décisions et ne compte pas les
réservations : l'écran ne les affiche pas. Les routes `admin/catalog`,
`admin/catalog/published` et les marqueurs restent servies pour Mise en
avant, Promotions, la fiche client et l'offre pro.

### 4.2 Un geste relit ses lignes

Masquer et valider relisent **les lignes touchées** par
`GET admin/catalog/screen/rows?sku=…`, sous le même droit, avec le numéro
lu avant les lignes. Les comptes par rayon et la liste en attente se
calculent sur tout le catalogue : le calcul vit dans `@lfd/contracts`
(`published-catalog-counts.ts`), lu par le serveur et par l'écran après un
geste — une seule arithmétique.

### 4.3 Le numéro `catalog-admin`

`public.catalog_admin_change`, déclencheurs sur `catalog_entries`,
`catalog_items`, `catalog_categories`, `catalog_item_overrides` et
`catalog_item_reservations`. Une instruction **n'écrit une ligne que si une
ligne a vraiment changé** (`old_table` et `new_table` comparées par
`EXCEPT ALL`) : le projecteur du référentiel réécrit les articles à
l'identique à chaque rejeu, et chaque rejeu relirait sinon tous les onglets.
`context_versions('catalog')` est un autre numéro, celui de l'instantané du
rayon ([`le-catalogue-en-memoire.md`](le-catalogue-en-memoire.md)).

### 4.4 Le store

`CatalogueScreenStore`
(`apps/lfd-backoffice-frontend/src/app/b2b/catalogue/catalogue-screen.store.ts`)
charge à la première ouverture de l'onglet, garde la copie tant que l'onglet
du navigateur vit, **retient le numéro rendu avec la copie** (l'écho du
propre geste de l'onglet ne relit rien), relit tout quand le numéro diffère,
filet de 5 min.

### 4.5 Le contenu partagé

La réponse de l'écran **sans les marqueurs du sur mesure** est la même pour
tout porteur de `lfc_catalog` : elle est rangée dans l'objet sous
(révision, `catalog-admin`, numéro), décidé par Hugo le 2026-11-12. Une
seule relecture pour tous les postes quand le numéro bouge. Les marqueurs
sont lus à chaque appel, sous leur droit ; les lignes relues après un geste
ne passent pas par l'objet.

## 5. Le PIM

### 5.1 Les gains directs

- `GET catalogue/products` rend aussi les alertes de conformité calculées
  sur la même lecture ; la fiche lit les alertes de son seul produit par
  `catalogue/products/compliance-warnings?productId=…`.
- `vatPercents` reçoit les familles déjà chargées par la liste et les
  alertes, qui lisent toutes les familles, archivées comprises ; une famille
  absente lève toujours `CategoryNotFoundError`.
- Un store de session du référentiel des allergènes (`eu`, `world`),
  `pim/catalogue/allergen-reference-store.ts`.
- La source de la matrice des allergènes lit un type allégé ; le filtre
  reste au serveur, partagé avec les exports CSV et PDF.
- Les ancêtres d'une famille en une requête (`WITH RECURSIVE`,
  `pim/catalogue/history/infrastructure/prisma-product-lineage.reader.ts`).
- La vue d'ensemble compte par une requête d'agrégat.

### 5.2 Le numéro `pim`

`pim.pim_change`, une ligne **par instruction qui touche au moins une
ligne** (pas de filtre « vrai changement » : les `@updatedAt` et le
`deleteMany` + `create` des `save` le rendraient vain). Les tables suivies
sont dans `PIM_VERSIONED_TABLES`
(`apps/lfd-api/src/pim/changes/domain/pim-versioned-tables.ts`) ; un test
(`infrastructure/__tests__/pim-versioned-tables.spec.ts`) la compare aux
tables connues, et l'e2e `pim-changes.e2e-spec.ts` vérifie un déclencheur
par table. Hors numéro : les révisions et la réémission, les opérations, la
liaison des canaux. `nutrition_declaration` n'y est pas : plus aucun code ne
la lit, et elle n'existe plus en production (incident du 2026-11-12,
[`../ops/runbook.md`](../ops/runbook.md)).

Le numéro ne dit qu'« un changement a eu lieu » : il s'ouvre aux quatre
droits du § 2.1, et chaque contenu reste servi sous la garde de sa route.

### 5.3 Le contenu partagé

Par le port des contenus versionnés, sous le numéro `pim`
(`pim/changes/application/pim-contents.ts`, clés dans `pim-content-keys.ts`) :
la liste des produits avec ses alertes (`pim-products`), chaque référentiel
(familles, taux de TVA avec leur usage, contextes de vente, appellations,
ingrédients, allergènes par portée et langue), et le détail d'une fiche sous
`pim-product:<id>` — une ligne par fiche, remplacée à chaque rangement. Le
numéro est global : pendant une séance d'édition le détail se relit à chaque
geste, et ne sert l'objet que pour une fiche rouverte sans écriture
entre-temps.

**Accepté** : le détail lit aussi hors du schéma `pim` — la péremption de la
signature (`growth.activity_events`), le nom de celui qui l'a posée
(annuaire `staff`), la description d'un visuel (médiathèque). Un fait de
contenu accompagne toujours une écriture dans `pim` ; un nom de staff
renommé ou un visuel redécrit reste ancien dans l'objet jusqu'au prochain
changement du PIM (`get-product-detail.ts`).

### 5.4 Les écrans

- `ProductListStore` (`pim/catalogue/product-list-store.ts`), lu par
  `GET catalogue/products/screen` (`{ version, items }`) : première
  ouverture seulement, numéro retenu, l'écho du propre geste ignoré.
- Les stores des familles, de la TVA, des contextes de vente, de la
  provenance et des allergènes s'abonnent à `pim` (`pim/data/watch-pim.ts`)
  et se relisent en fond quand le numéro diffère ; la fiche les lit sans
  forcer de relecture. Un store dont la route n'est pas permise à la
  personne (TVA sans `pim_tax`) garde sa relecture à l'ouverture.
- La fiche relit son détail après une section (servi par l'objet si rien
  n'a changé) ; la péremption de la signature reste celle du serveur.

## 6. L'onglet Cache

- **Les compteurs vivent dans les objets** (`ProShelves` et `DayVersions`),
  seul endroit commun à tous les conteneurs : par cache et par heure, les
  lectures servies (réussites), les relectures (ratés), les rangements, les
  refus trop gros, la taille rangée (octets **compressés** pour les contenus,
  tels que l'objet les garde ; entrées), le pic de requêtes en
  une seconde et les personnes distinctes servies. Table SQLite horaire
  gardée 30 jours (`container/cache-metrics-store.ts`,
  `hourly-cache-metrics.ts`, `METRICS_KEEP_DAYS`), lue par
  `GET <adresse de l'objet>/metrics`.
- **La taille en clair** des contenus est gardée par ligne
  (`contents.raw_bytes`) mais pas encore relevée dans la table horaire ni
  montrée à l'écran.
- **Les personnes** : l'API joint à chaque appel l'empreinte
  `sha256(sel, type, identifiant interne)` dans l'en-tête `x-cache-person`
  (`platform/cache-calls/served-person.ts`) — jamais d'e-mail, de nom ni de
  `sub` ; un appel sans personne (cron, visiteur) n'est pas compté. L'objet
  ne garde que le compte de l'heure.
- **La route** `GET admin/ops/caches?days=30`
  (`apps/lfd-api/src/ops/caches/admin-caches.controller.ts`, `ops_health`) :
  la tête (dernière heure, 24 h) et les séries horaires par cache, avec les
  replis et durées d'appel mesurés par l'API.
- **L'écran** : onglet Cache de Santé
  (`apps/lfd-backoffice-frontend/src/app/ops/cache-board/`), chiffres clés en
  tête, courbes de taille et de taux de réussite par cache. Relu à
  l'ouverture.
- Un compteur ne fait jamais échouer ni ralentir une lecture : il s'écrit en
  fin de réponse, et une erreur de comptage est avalée et journalisée une
  fois.

## 7. Reste à faire

- **Prouver l'aiguillage en production** après le déploiement de
  `91f6856c2` : l'onglet Cache doit montrer `day-versions` d'un côté et
  `pro-shelves` de l'autre. Tant que ce n'est pas vu, les numéros et les
  contenus du catalogue et du PIM vont en base à chaque lecture (rien de
  faux n'est servi).
- **Retirer au déploiement suivant** les anciens hôtes `rayons.interne` et
  `journees.interne` (`LEGACY_OBJECT_HOSTS`), et l'ancienne porte
  `GET admin/day-versions`.
- **Les écrans de journée sont branchés** (§ 3.2 à 3.5). Reste à lire, sur
  l'environnement déployé, les appels par jour de chaque route (onglet Ops)
  pour chiffrer le gain, et à écrire le seuil sous lequel il ne vaut pas
  l'objet. Plan bâti :
  [`plan-lot-2-ecrans-de-journee.md`](plan-lot-2-ecrans-de-journee.md).
- **La taille en clair dans l'onglet Cache** : la colonne `contents.raw_bytes`
  existe ; la relever dans `metrics_hourly` et la servir à l'écran reste à
  faire.
- **La mesure avant / après** des requêtes de l'écran Catalogue, de la liste
  et d'une fiche du PIM, d'un filtre de la matrice (journal des requêtes
  Prisma) : pas faite. Elle dira si un numéro par fiche du PIM vaut son prix.
- La page `/commandes` relève de `orders-all` ; ce qui dépend de l'heure
  seule (échéance d'une invitation, historique) ne fait monter aucun numéro :
  le filet de 5 min reste.
- **Retirer l'objet** demanderait une migration `deleted_classes:
["DayVersions"]` dans un nouveau tag de `wrangler.jsonc`, après avoir
  retiré la liaison et le code qui l'appelle : un revert ne défait pas la
  migration de classe ([`../ops/runbook.md`](../ops/runbook.md)).
