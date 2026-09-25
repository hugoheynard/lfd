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

## 10. Écarts à la maquette

> Ajouté le 2026-09-25 à la construction du lot 2 (front), à la demande de
> Hugo : « tu notes les différences mais tu fais exactement ça ». Le rendu a
> été confronté aux captures `02-poste-fixe.png` et `04-mobile.png` sur des
> données calquées sur la maquette. Chaque ligne donne l'élément, ce que dit la
> maquette, ce qu'on fait, et pourquoi.

### Les gestes retirés et les données absentes (§1, §7)

| Élément                                     | Maquette                                        | Ici                                                                                                             | Pourquoi                                                                                    |
| ------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Cases à cocher (préparation)                | carré 18 px (26 px mobile) devant chaque ligne  | absentes ; la quantité Mono et le produit restent à leur place                                                  | geste de la fournée (§1)                                                                    |
| « Ouvrir la fiche Viennoiseries → »         | lien vers la fiche du rayon                     | « Ouvrir la fournée → », même style, vers `/production/journee`                                                 | renvoi vers la liste ; aucun lien profond vers un rayon                                     |
| Rayon **Bloqué**                            | liséré rouge, cause, « Voir les 3 commandes »   | n'existe pas ; « Pas commencé » : `0 / 2 lignes · pas commencé`                                                 | aucune donnée de rupture (§7) ; l'état est dit en toutes lettres (SPEC §7)                  |
| Cases de colis, Étiquettes, Bon de commande | trois cases + deux boutons                      | « Ouvrir le colisage → » ; le nombre de bacs passe dans la ligne Mono                                           | gestes du poste (§1)                                                                        |
| Carte « prêt à coliser »                    | pastille verte « prêt à coliser »               | pastille verte « à coliser »                                                                                    | nom de l'état dans le plan (§5)                                                             |
| « Attend le four »                          | « Bloquée par **2 lignes viennoiserie** »       | « Bloquée par **Pain au chocolat, Brioche tressée** » ; pas de renvoi                                           | le plan demande de nommer les produits ; rien à ouvrir tant que le four n'a pas sorti       |
| Cartes « à venir » à 72 % d'opacité         | compactes, sous les cartes pleines              | toutes les commandes ouvertes ont une carte pleine ; les colisées sont repliées en bas dans un encart pointillé | le plan trie attend le four / en cours, puis à coliser, et replie les colisées (§5)         |
| Libellé du compte en trop                   | « + 13 commandes · triées par heure de remise » | « + 13 commandes · triées par heure de retrait »                                                                | « remise » ne désigne que la réduction de prix (CLAUDE.md §8)                               |
| Remettre                                    | bouton graphite plein                           | lien « Ouvrir le retrait → », sur les commandes prêtes ou en retard, en retrait seulement                       | renvoi, pas un geste ; aucune cible écrite pour la livraison (voir la note sous le tableau) |
| Appeler                                     | bouton contour sur le retard                    | absent                                                                                                          | §1                                                                                          |
| Scanner un QR, sélecteur « Le Labo »        | en-tête, à droite                               | absents                                                                                                         | §1 et §5                                                                                    |
| « Remis 7 h 04 · signé A. Meunier »         | ligne verte                                     | « Retirée à 7 h 04 » (« Livrée à … » en livraison)                                                              | pas de signature (§7) ; vocabulaire                                                         |
| « 3 colis · zone A2 »                       | colis et zone                                   | « 24 pièces · <point de retrait> »                                                                              | la file porte des pièces et le point de retrait, pas de colis ni de zone                    |
| « 4 colis · encore au colisage »            | ambre                                           | « 24 pièces · encore au colisage », ambre                                                                       | idem                                                                                        |
| Carte graphite de la tournée                | véhicule, départ, arrêts numérotés              | absente ; l'onglet Livraison liste les commandes par créneau                                                    | aucune donnée de tournée (§7)                                                               |
| Segmenté                                    | « Comptoir · 25 / Tournée · 4 »                 | « Retrait · N / Livraison · N »                                                                                 | vocabulaire du plan (§5)                                                                    |
| Onglet mobile « Remise »                    | « Remise »                                      | « Retrait »                                                                                                     | vocabulaire                                                                                 |
| Pastilles mobiles                           | Colisage 3 et Remise 1                          | Préparation (commandes qui attendent le four) et Retrait (créneaux dépassés)                                    | le plan pose la pastille sur l'onglet de la colonne **qui bloque** (§6)                     |

**La livraison n'a pas de renvoi.** Le plan (§1) ne renvoie « Remettre » que
vers `/comptoir/retrait`. Aucune ligne ne dit où envoyer pour une commande à
livrer : `/livraison` existe sous la même garde, mais ce plan ne la nomme
pas. Donc pas de lien. À trancher.

### Ce qui vient de la coque et de la page

> Retouché le 2026-09-25 après l'avoir vu en vrai (Hugo) : l'écran s'intègre au
> design de l'app **sur le modèle de Retrait boutique**
> (`handover-shop/handover-shop-page`).

| Élément                                   | Maquette                                                     | Ici                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Pourquoi                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Barre graphite (« f », fil, date, avatar) | 52 px, `#0e1420`, en tête du cadre                           | **retirée**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | le header de l'app dit déjà « Supervision du jour » ; deux barres sombres superposées se lisaient comme un défaut                                                                                                                                                                                                                                                            |
| Bande de compteurs                        | 3 chiffres de 22 px sur `#131a28`, étiquettes Mono au-dessus | **masthead en cartes** (retouche du 2026-09-25) : `fold-page-section bleed stack foldSurface="chrome"`, une `fold-card radius="sm" padding="sm"` par colonne. Dans chaque carte : l'étiquette de colonne en Mono capitales, le chiffre en Mono tabulaire `--fold-text-2xl` (24 px), le libellé (« lignes ouvertes », « commandes à coliser », « attendues · dont N livraisons »), et une pastille `fold-badge` pour un blocage (« N commandes attendent le four » en `warning` sur Préparation, « N créneaux dépassés » en `alert` sur Retrait) | motif réutilisé tel quel : `shared/compte-chiffres` (en-tête d'un compte). Grille `auto-fit minmax(9rem, 1fr)`, cartes en `--fold-color-surface-card` avec bordure `--fold-color-border` sur le chrome. Hauteur de bande : celle du masthead du Commercial (`--fold-space-md` au-dessus, `--fold-space-lg` en dessous). Le chiffre fait 24 px au lieu de 22 et passe en Mono |
| Date et fraîcheur                         | dans la barre graphite, « jeudi 3 septembre · 6 h 40 »       | en tête du masthead, à droite, Mono : « jeudi 3 septembre · à jour à 6 h 40 »                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | l'heure est celle de la lecture du serveur (`asOf`)                                                                                                                                                                                                                                                                                                                          |
| Teinte du masthead                        | `#131a28`                                                    | `--fold-color-bg-rail-secondary` (`graphite-850`, `#1f2a40`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Hugo demande le bleu « secondary » de fold : **fold n'a aucun token de couleur `secondary`** ni d'entrée de masthead qui en porte (vérifié dans fold-ng 0.27.2 le 2026-09-25). Le fond du rail secondaire est le bleu que portent déjà les bandes du Commercial, de la Tarification et du Catalogue.                                                                         |
| Cadre                                     | 1440 px, bordure, rayon 8 px, ombre                          | **aucun** : colonnes bord à bord, sans gouttière, séparées par un filet `--fold-color-border`                                                                                                                                                                                                                                                                                                                                                                                                                                                   | intégration à l'app (Hugo)                                                                                                                                                                                                                                                                                                                                                   |
| Hauteur                                   | cadre de hauteur libre                                       | les colonnes prennent toute la hauteur restante ; **la page ne défile pas**, chaque colonne défile seule                                                                                                                                                                                                                                                                                                                                                                                                                                        | Hugo. Même geste que le mur du Prévisionnel : l'hôte est `position: absolute; inset: 0` dans la boîte de contenu de la coque, car `.content-flow` de fold (`flex: 1 0 auto`) ne descend jamais sous son contenu                                                                                                                                                              |
| En-tête de colonne                        | défile avec la colonne (maquette statique)                   | **fixe** : « 1 · Préparation », l'unité et le texte restent ; en colonne 3, le segmenté Retrait/Livraison aussi                                                                                                                                                                                                                                                                                                                                                                                                                                 | Hugo ; seul le corps défile (`overflow-y: auto`, `min-height: 0` sur toute la chaîne, éprouvé par les specs)                                                                                                                                                                                                                                                                 |
| Compteur 3                                | « 29 dont 4 en tournée »                                     | « N attendues · dont N livraisons »                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | attendues = ni retirées ni annulées ; aucune tournée (§7)                                                                                                                                                                                                                                                                                                                    |
| Mobile                                    | barre « Suivi du jour » + unité, onglets sur graphite        | masthead, puis les onglets **sous** lui, sur la même teinte ; l'en-tête de colonne (avec son unité) reste affiché                                                                                                                                                                                                                                                                                                                                                                                                                               | la barre d'écran n'existe plus ; l'unité est dite par la colonne                                                                                                                                                                                                                                                                                                             |
| Pli mobile                                | téléphone de 390 px                                          | une colonne à la fois en dessous de 900 px                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | trois colonnes de cartes ne tiennent pas sur une tablette en portrait                                                                                                                                                                                                                                                                                                        |

### Ce que fold dessine autrement (composants)

| Élément                         | Maquette                                                                                         | Ici                                                                                                                                                | Pourquoi                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Barre de progression            | 5 px, sans libellé, la phrase (« 6 références sur 9 posées ») **sous** la barre                  | `fold-meter` : piste de 4 px, libellé obligatoire **au-dessus** (« 6 références sur 9 posées », « 188 pièces restantes »)                          | fold d'abord ; le libellé est requis par `fold-meter`. Les teintes sont celles de la maquette (voir « Couleurs ») |
| « Unités restantes »            | absente                                                                                          | libellé du mètre : « N pièces restantes » / « Rayon terminé · N pièces sorties »                                                                   | le plan la demande (§5) ; le libellé du mètre la porte                                                            |
| Pastille d'état                 | 22 px de haut, rayon 3 px, sans bordure, Mono 10 px gras, capitales, +0,1 em                     | `fold-badge radius="square"` : bordure d'1 px de la teinte, rayon 4 px, Mono `--fold-text-2xs` gras, capitales, `--fold-tracking-caps`             | fold d'abord ; la bordure et la hauteur viennent du badge                                                         |
| Segmenté                        | deux boutons séparés de 28 px, actif graphite plein, inactif blanc bordé                         | `fold-view-toggle activeStyle="solid"` : un seul contour, segment actif **bleu** (`--fold-color-primary`)                                          | fold d'abord ; aucun style « graphite » dans `FoldViewToggleActiveStyle` (`solid`, `accent`, `raised`)            |
| Onglets mobiles                 | tuiles de 48 px : libellé, compte Mono bleu sous le libellé, actif blanc, pastille rouge en coin | `fold-view-nav activeStyle="fill"` : « Préparation 5 » sur une ligne, pastille `fold-badge` **neutre** à côté du libellé, actif en fond bleu clair | fold n'a pas d'onglet avec un compte sous le libellé et une pastille d'alerte en coin — manque à signaler à fold  |
| Pastille rouge d'onglet         | fond `#b33a2a`, blanc, bord graphite, en coin                                                    | `fold-badge` neutre (ou accent sur l'onglet actif), inline                                                                                         | idem : le badge de `fold-view-nav` n'a pas de ton                                                                 |
| « Ouvrir la fiche » mobile      | bouton de 36 px, fond `#f1f3f7`, texte bleu                                                      | `foldButton emphasis="soft" intent="neutral"` (texte neutre, hauteur fold)                                                                         | fold d'abord                                                                                                      |
| « Déplier ▾ »                   | texte graphite 12 px semi-gras                                                                   | `fold-link` (texte bleu `--fold-text-xs`)                                                                                                          | fold d'abord ; `fold-link` sans `href` rend un bouton                                                             |
| Cartes                          | rayon 5 px (7 px mobile), padding 12 × 14 px (13 × 15 mobile)                                    | `fold-card radius="sm"` (4 px en navi), padding `--fold-space-md` (12 px) ; mobile 12 × 16 px                                                      | tokens de rayon et d'espace les plus proches                                                                      |
| Liseré                          | 3 px à gauche, coin gauche droit                                                                 | identique, posé sur l'hôte de `fold-card`                                                                                                          | —                                                                                                                 |
| Retard en mobile                | fond `#fbeeec` sur toute la carte                                                                | `--fold-color-alert-surface`                                                                                                                       | pas de token exact                                                                                                |
| Encadré mobile « Bloquée par… » | fond `#fbf2dc`, texte `#8a6508`                                                                  | `--fold-color-warning-surface` / `--fold-color-warning-text`                                                                                       | pas de token exact                                                                                                |
| Espacement dans une carte       | 9 / 10 / 11 px entre titre, barre, lignes, lien                                                  | `--fold-space-sm` (8 px) partout                                                                                                                   | un seul écart de la grille fold                                                                                   |

### Couleurs — une valeur de la maquette sans token exact

Les trois teintes d'état **sont** des tokens et sont reprises telles quelles :
`#146b48` = `--fold-ref-green-700`, `#d4a017` = `--fold-ref-amber-500`,
`#b33a2a` = `--fold-ref-red-600`. Le fond de piste `#e6e9ef` =
`--fold-ref-paper-200`. Pour avoir exactement ces couleurs de barre,
`fold-meter` reçoit localement `--fold-color-success`, `--fold-color-warning`
et `--fold-color-surface-raised`. Sur la surface `chrome`, `#f2f5fb` et
`#b9c4da` sont exacts (`--fold-ref-navyink-50` / `-200`, via les rôles de
texte).

| Maquette                                        | Token retenu                                                | Valeur du token       |
| ----------------------------------------------- | ----------------------------------------------------------- | --------------------- |
| graphite de la barre `#0e1420`                  | — (barre retirée, voir plus haut)                           | —                     |
| bande de compteurs `#131a28`                    | `--fold-color-bg-rail-secondary` (`graphite-850`), masthead | `#1f2a40`             |
| accent `#2b4fc9` (liens, barre en cours)        | `--fold-color-primary` (`signal-600`)                       | `#3357d4`             |
| accent au survol `#1f3fa8`                      | `--fold-color-primary-strong` (`signal-700`)                | `#2643aa`             |
| texte « en cours » `#2b4fc9`                    | `--fold-color-primary-text` (badge accent)                  | `#2643aa`             |
| fond « en cours » `#eaeef8`                     | `--fold-color-primary-surface`                              | mélange 8 %           |
| texte « attend » `#8a6508`                      | `--fold-color-warning-text` (`amber-700`)                   | `#8f6508`             |
| fond « attend » `#fbf2dc`                       | `--fold-color-warning-surface`                              | mélange 8 %           |
| fond « fait » `#e8f0e9`                         | `--fold-color-success-surface`                              | mélange 10 %          |
| texte « bloqué / dépassé » `#8f2c1f`            | `--fold-color-alert-text` (`red-600`)                       | `#b33a2a`             |
| page `#eef0f4`                                  | `--fold-color-bg-page` (`paper-100`)                        | `#f3f5f8`             |
| en-tête de colonne `#dde2ea`                    | `--fold-color-surface-band` (`paper-200`)                   | `#e6e9ef`             |
| bordure `#c8cedb`                               | `--fold-color-border` (`paper-300`)                         | `#d3d8e2`             |
| encart replié `#e6e9ef`, pointillé `#b9c1d0`    | `--fold-color-surface-band` / `--fold-color-border`         | `#e6e9ef` / `#d3d8e2` |
| filet entre lignes mobiles `#f0f2f6`            | `--fold-color-border-subtle` (`paper-200`)                  | `#e6e9ef`             |
| texte `#0f1523`                                 | `--fold-color-text` (`slate-900`)                           | `#1a1d23`             |
| texte secondaire `#41506b`                      | `--fold-color-text-secondary` (`slate-650`)                 | `#4a5468`             |
| texte discret `#5c6a80`                         | `--fold-color-text-muted` (`slate-600`)                     | `#5f6b7a`             |
| texte discret sur graphite `#8290ae`            | `--fold-color-text-muted` en `chrome` (`navyink-300`)       | `#9aa7c2`             |
| séparateur sur graphite `rgba(242,245,251,.14)` | `--fold-color-border` en `chrome` (mélange 10 %)            | —                     |
| ombre des cartes `0 1px 2px rgba(14,20,32,.05)` | `--fold-shadow-sm` (navi, 8 %)                              | —                     |

### Typographie et espacement

Plex Sans et Plex Mono sont celles de la maquette (`--fold-font-sans` /
`--fold-font-mono`, surchargées par `styles.scss`). Les tailles, graisses et
approches passent par les tokens ; règle retenue : le token le plus proche,
**le plus petit en cas d'égalité**, pour garder la densité.

| Maquette                                      | Token                                                            | Écart                  |
| --------------------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| 10 px, 10,5 px (capitales Mono)               | `--fold-text-2xs` (10 px)                                        | 0 à −0,5 px            |
| 11,5 px (méta, lien, compteur de rayon)       | `--fold-text-xs` (11 px)                                         | −0,5 px                |
| 12,5 px (produit, carte compacte)             | `--fold-text-sm` (12 px)                                         | −0,5 px                |
| 13,5 px (nom du client en colisage)           | `--fold-text-md` (13 px)                                         | −0,5 px                |
| 15 px (titre de carte mobile)                 | `--fold-text-base` (14 px)                                       | −1 px                  |
| 18 px (quantité mobile)                       | `--fold-text-lg` (16 px)                                         | −2 px                  |
| 22 px (compteurs)                             | `--fold-text-xl` (20 px)                                         | −2 px                  |
| approche des capitales .1 à .18 em            | `--fold-tracking-caps` (.07 em)                                  | plus serré             |
| « créneau dépassé » +.06 em                   | `--fold-tracking-wide` (.04 em)                                  | −.02 em                |
| −.012 em, −.028 em                            | `--fold-tracking-tight` (−.01), `--fold-tracking-tighter` (−.02) | ≤ .008 em              |
| espaces 7, 9, 10, 11 px                       | `--fold-space-sm` (8 px)                                         | ±3 px au plus          |
| espaces 13, 14 px                             | `--fold-space-md` (12 px)                                        | −1 à −2 px             |
| espaces 18, 22 px                             | `--fold-space-lg` (16), `--fold-space-xl` (20)                   | −2 px                  |
| colonne des heures 44 px, des quantités 34 px | `4ch`                                                            | ≈ ±4 px selon la fonte |
