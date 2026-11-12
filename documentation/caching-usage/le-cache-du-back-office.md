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
  une ligne par clé, remplacée à chaque rangement, sous un numéro. Une
  réponse au-delà de 1 Mo (`CONTENT_MAX_BYTES`) n'est pas rangée, l'écart est
  journalisé. Une clé admet `[a-z0-9:-]{1,64}`.

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
  refus trop gros, la taille rangée (octets, entrées), le pic de requêtes en
  une seconde et les personnes distinctes servies. Table SQLite horaire
  gardée 30 jours (`container/cache-metrics-store.ts`,
  `hourly-cache-metrics.ts`, `METRICS_KEEP_DAYS`), lue par
  `GET <adresse de l'objet>/metrics`.
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
- **Le lot 2 de l'objet des journées, non bâti** : le contenu des écrans de
  journée (Supervision, atelier, colisage, comptoir, tournées) dans l'objet,
  clé (révision, écran, journée, numéro), la seule DERNIÈRE version par
  écran et par journée, une alarme de ménage qui oublie les journées de plus
  de 3 jours. À trancher avec Hugo.
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
