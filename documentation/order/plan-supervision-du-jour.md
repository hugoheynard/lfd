# Plan — la Supervision du jour

> Ouvert le 2026-09-25, à la demande de Hugo : « il me manque un endroit pour
> superviser à la fois le suivi de prod, de packing, de retrait et de
> livraison », puis « supervision doit être orienté view, donc à part ».
>
> **Réécrit le même jour sur la maquette** `handoff-suivi` (Bureau de Hugo :
> sa spécification, sa maquette HTML et ses captures — hors du dépôt). Hugo : « on voit,
> on n'agit pas — un dashboard de suivi et d'alertes ; le manager qui regarde
> ça peut ensuite aller opérer sur comptoir ou colisage ».
>
> **Déjà bâti** (première version, avant la maquette) : la lecture
> `GET /admin/supervision/day` et le droit `b2b_supervision` (`af0b79fa5`),
> un écran de compteurs par étape (`afeae8cc2`). Ce plan **garde** le droit et
> la lecture — elle devient la source des retards de la colonne 3 — et
> **remplace** l'écran.

## 1. Le principe de la maquette, et ce qu'on en change

**L'unité change de colonne en colonne** — ce n'est pas un kanban. On prépare
des **produits**, on colise des **commandes**, on retire à des **gens dans un
créneau**.

| Colonne                 | Unité                   | Ce qu'on y voit                                                       |
| ----------------------- | ----------------------- | --------------------------------------------------------------------- |
| 1 · Préparation         | le **rayon** (produits) | `n / N lignes` par rayon ; rayons finis repliés en bas                |
| 2 · Colisage            | la **commande**         | références posées / total, bacs ; « attend le four »                  |
| 3 · Retrait / livraison | le **créneau**          | par tranche horaire : retirées, attendues, créneau dépassé, pas prête |

🔴 **Ce que la Supervision change à la maquette : elle n'agit pas.** La
maquette porte des gestes (cocher une ligne, Étiquettes, Bon de commande,
Remettre, Scanner un QR, Appeler). **Aucun n'est repris.** Chacun devient un
**renvoi** vers l'écran qui opère, et seulement si le lecteur y a droit :

| Geste de la maquette                        | Dans la Supervision                                                                                                                                                                                     |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| cocher une ligne, « Ouvrir la fiche »       | lien vers `/production/journee` (la fournée)                                                                                                                                                            |
| Étiquettes, Bon de commande, cases de colis | lien vers `/production/colisage`                                                                                                                                                                        |
| Remettre                                    | lien vers `/comptoir/retrait`                                                                                                                                                                           |
| Scanner un QR                               | **retiré** — c'est l'action principale d'un poste, pas d'une vue                                                                                                                                        |
| Appeler                                     | **retiré au premier lot** : le téléphone du client ne sort aujourd'hui sur aucun écran (bons PDF et gabarits de courriel seulement, vérifié le 2026-09-25). L'exposer est une décision d'accès, à part. |

Le renvoi prend le libellé de ce qu'on va y faire (« Ouvrir le colisage »),
jamais celui du geste, pour qu'on ne croie pas agir d'ici.

## 2. Ce qui existe (vérifié le 2026-09-25)

| Besoin                | Donnée                                                                                                                                        | Lecture existante                                                                                                             |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Rayons, `n / N`       | `production.production_count` (`doneAt` par sku et par jour) ; rayon d'un sku par le port `WorkshopShelvesReader`, implémenté par le commerce | `GET /admin/production/worksheet` → `worksheetGroupsOf` : `lineCount`, `doneCount`, `totalUnits`, `remainingUnits` par groupe |
| Colisage par commande | `production_order_line.packedAt`, `production_order.packedAt`, `containerCount` (bacs d'expédition)                                           | `GET /admin/production/packing` → `ProductionPackingView`                                                                     |
| Retrait par créneau   | `HandoverQueueEntry` : client, enseigne, clientèle, point de retrait, acheminement, créneau **avec sa source**, unités, statut, `readyAt`     | `GET /admin/handover/file`                                                                                                    |
| Retards               | règles pures `latenessOf` (créneaux promis seulement)                                                                                         | `GET /admin/supervision/day` (`b2b_supervision`)                                                                              |

Les trois premières sont en `@AdminSurface("b2b_orders")`.

## 3. Où vit la composition — décision

**Chaque bloc sert sa propre colonne, sous `b2b_supervision` ; le front
juxtapose.** Aucun bloc ne lit l'intérieur d'un autre :

| Colonne         | Route                                | Bloc         | Ce qu'elle rejoue                                   |
| --------------- | ------------------------------------ | ------------ | --------------------------------------------------- |
| 1 · Préparation | `GET /admin/supervision/preparation` | `production` | la même query que `GET /admin/production/worksheet` |
| 2 · Colisage    | `GET /admin/supervision/packing`     | `production` | la même query que `GET /admin/production/packing`   |
| 3 · Retrait     | `GET /admin/supervision/handover`    | `handover`   | la même query que `GET /admin/handover/file`        |
| retards         | `GET /admin/supervision/day`         | `b2b`        | déjà bâtie                                          |

Un **second contrôleur** par bloc, en `@AdminSurface("b2b_supervision")`,
qui n'injecte que le `QueryBus` et envoie la **même** query que le poste :
une seule lecture nommée, deux portes, chacune avec son droit. Rien de neuf
dans la matrice, aucun handler dupliqué.

Pourquoi pas ailleurs :

- _un agrégat serveur unique_ : les canaux `production/channels/commerce/` et
  `handover/channels/commerce/` sont DÉCLARÉS par ces blocs et IMPLÉMENTÉS par
  `b2b` — ce sont des besoins, pas des surfaces de lecture ; un agrégat dans
  `b2b` devrait lire les tables du fournil en Prisma direct. (`b2b` sait bien,
  par `OrderPacked` / `ProductionDayClosed`, si une commande est colisée —
  c'est ce que `supervision/day` lit —, mais pas le détail par ligne ni
  l'avancement par rayon.)
- _les routes des postes telles quelles, sous garde double_ : `b2b_orders`
  ouvre la Production et le Comptoir en entier, **en écriture** pour qui
  l'a en `write`. Le droit `b2b_supervision` n'ouvrirait plus rien seul, alors
  que c'est sa raison d'être (`app.routes.spec.ts` : « elle se donne à qui
  supervise sans ouvrir les commandes »).
- _un neuvième bloc « supervision »_ : disproportionné pour juxtaposer.

**Le coût** : quatre requêtes par rafraîchissement, à 15 s — seize par minute
et par écran ouvert, sur des lectures qui recalculent (la balance du
colisage, la demande d'une journée ouverte). Le rafraîchissement réutilise
`shared/periodic-refresh.ts` (déménagé de `production/` dans `afeae8cc2`),
qui **suspend quand l'onglet est caché et ne chevauche jamais deux cycles**
(vérifié le 2026-09-25 ; vitruve le croyait inexistant). Les quatre lectures
n'ont pas d'instant commun : un écran qui les juxtapose peut montrer une
commande « colisée » en colonne 2 et « pas prête » en colonne 3 le temps d'un
cycle. Assumé pour une vue ; c'est précisément pourquoi elle n'agit pas.

## 4. L'accès

- La page `/supervision` exige **`b2b_supervision:read` seul**, comme
  aujourd'hui : ses quatre lectures sont sous ce droit.
- Ce que le droit montre, écrit : l'avancement du fournil par rayon, les
  commandes du jour avec le nom du client, leurs lignes et leurs bacs, la
  file de retrait. **Aucun montant, aucun contact.** C'est plus que la
  première version (qui ne rendait que des compteurs et des noms) : les
  lignes de commande entrent. Seul `admin` le porte ; un rôle « manager » se
  compose à l'écran des rôles. **Aucune migration de droits.**
- **Les renvois** (§1) : affichés seulement si le lecteur a `b2b_orders:read`
  — la garde **héritée de la coquille** des trois routes cibles
  (`production`, `comptoir`), les routes enfants déclarant `null`. Un test
  confronte chaque renvoi à la garde effective de sa cible (enfant, sinon
  parent) dans la table de routes, pour qu'un droit propre à la Production
  (TODO `todo-comptoir-statuts-et-droit-production.md`) ne laisse pas un
  renvoi pointer vers un refus. Les renvois visent les **listes**
  (`/production/colisage`), jamais `colisage/:reference`, qui est en `write`.

## 5. Les trois colonnes, dans le détail

**En-tête** : « Supervision · Avancement du jour », date, « à jour à 9 h 42 »
(`asOf`). Le jour par défaut est celui du **serveur** — `supervision/day`
sans date rend le jour courant de son `Clock` —, jamais l'horloge du poste. Bande de
compteurs, un par colonne : lignes ouvertes · commandes à coliser · attendues
au retrait (dont N livraisons). Ni sélecteur de site, ni bouton Scanner.

**Colonne 1 · Préparation** — une carte par groupe du worksheet, barre
`doneCount / lineCount`, unités restantes ; état **Terminé** / **En cours** /
**Pas commencé**. Les lignes non faites sont listées (quantité en chiffres
tabulaires + produit), **sans case à cocher**. Rayons terminés repliés en bas
dans un encart. L'état **Bloqué** de la maquette n'a pas de donnée (§7).

**Colonne 2 · Colisage** — une carte par commande de la vue de colisage :

- **Colisée** : bac fermé (`packedAt`), N bacs ;
- **En cours** : `k références sur N posées`, barre ;
- **Attend le four** (liseré d'avertissement) : au moins une ligne porte
  `awaitingProduction` — **lu tel quel** dans la vue de colisage, jamais
  recalculé : le fournil le calcule (`production-packing.ts`), et il compte
  aussi en attente un article absent du compte à produire. La carte nomme
  les produits attendus ;
- **À coliser** : tout est sorti, rien n'est posé.

Tri : attend le four et en cours d'abord, puis par heure de retrait — le
créneau vient de la file de retrait, jointe par `reference` (la vue de
colisage ne porte ni créneau ni `orderId`) ; une commande sans créneau va en
fin. Au-delà de dix, « + N commandes ». Colisées repliées en bas.

**Journée pas encore arrêtée** : le colisage ne commence qu'après la clôture,
et sa vue rend alors `closedAt: null` et aucune feuille. La colonne le dit —
« La journée n'est pas encore arrêtée : le colisage commence à la clôture »
— au lieu d'une colonne vide.

**Colonne 3 · Retrait / livraison** — segmenté **Retrait · N / Livraison ·
N**, groupé par tranche horaire du créneau (`7 h – 8 h · 6 attendues · 4
retirées`). Par commande : heure, client, unités, et l'état :

- **Retirée** : barrée, « Retirée à 7 h 04 » ;
- **Créneau dépassé** (liseré d'alerte) : « créneau dépassé de 55 min ». Le
  **verdict** vient de `GET /admin/supervision/day`, jamais recalculé ; la
  **durée** affichée, elle, se calcule côté front (`asOf − fin du créneau`),
  `LateOrder` n'en portant pas ;
- **Annulée** : barrée dans sa tranche, hors des comptes ;
- **Pas prête** : « encore au colisage » ;
- **Heure d'ouverture** / **sans créneau** : dit tel quel, jamais en retard.

La tournée (véhicule, arrêts) n'a pas de donnée (§7) : l'onglet Livraison
liste les commandes à livrer par créneau, sans ordre de route.

**Le design est celui de la maquette** (Hugo, 2026-09-25 : « je veux le même
design que la maquette ») : disposition, barre graphite, bande de compteurs,
typographie Plex Sans / Plex Mono, cartes, lisérés, pastilles Mono, densité.
Seuls changent les gestes retirés (§1). La maquette est fold-native — le
back-office porte déjà IBM Plex, et ses couleurs d'état SONT des tokens de
référence fold (vérifié le 2026-09-25 dans fold-ng 0.27.2 : `#146b48` =
`--fold-ref-green-700`, `#d4a017` = `--fold-ref-amber-500`, `#b33a2a` =
`--fold-ref-red-600`). Elle se reproduit donc **par les tokens**, jamais en
hexadécimal ; une valeur de la maquette qui n'aurait pas de token est
signalée, pas écrite en dur. L'état est toujours porté **aussi** par un
libellé — jamais la couleur seule (SPEC §7).

## 6. Mobile

Une colonne à la fois, trois onglets (Préparation N · Colisage N · Retrait
N). **Le rôle choisit l'onglet d'arrivée** : une table `rôle → colonne` dans
le front, défaut Préparation ; le dernier onglet ouvert ne l'emporte pas
(SPEC §6). Un blocage de la colonne voisine revient en pastille sur son
onglet (commandes qui attendent le four → pastille sur Préparation ;
créneaux dépassés → pastille sur Retrait).

## 7. Hors périmètre — ce que la maquette montre et que la base ne sait pas

- **Rayon bloqué · rupture matière** : rien ne l'enregistre. Il faudrait que
  le fournil déclare une rupture (qui, quoi, commandes impactées) — un geste
  et une table, plan à part.
- **Tournée** (véhicule, départ, arrêts dans l'ordre, estimés) : attend le
  module Livraison.
- **« Signé A. Meunier »** : on sait qui a retiré et quand, pas de signature
  client.
- **Appeler** : voir §1.

## 8. Lots

1. **Serveur** : les trois contrôleurs `admin/supervision/*` (deux dans
   `production/http/`, un dans `handover/http/`), chacun rejouant la query du
   poste ; `supervision/day` accepte l'absence de date (jour du `Clock`) ;
   e2e : 403 sans `b2b_supervision`, 200 avec lui seul — sans `b2b_orders` —,
   et les routes des postes toujours 403 à ce rôle.
2. **Front** : services des quatre lectures, les trois colonnes, le mobile
   par rôle, les renvois selon la garde effective. Remplace
   `supervision/supervision-page/`.

## 9. Tests

- État d'une carte de colisage : colisée, en cours, attend le four (une ligne
  `awaitingProduction`), à coliser ; jointure du créneau par `reference`,
  commande absente de la file en fin de tri.
- Regroupement par tranche horaire : créneau sans `start`, sans créneau,
  heure d'ouverture.
- Page : une lecture qui échoue n'efface pas les autres (chaque colonne a son
  propre état d'erreur) ; renvois selon la permission ; onglet d'arrivée
  selon le rôle ; **aucun bouton d'action**.
- Renvois : chacun confronté à la garde effective de sa cible dans la table
  de routes ; masqués sans `b2b_orders:read`.
- Journée non arrêtée : la colonne 2 le dit.
