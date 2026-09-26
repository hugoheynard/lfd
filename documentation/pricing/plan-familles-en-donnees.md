# Plan — les familles en données, plus de rayons codés en dur

> ⚠️ **Rectifié le 2026-09-26, même jour** : il n'y avait **pas** de doublon dans
> le PIM. La production a l'index `category_slug_fr_unique` et une seule
> « Viennoiseries », `01a031ff-…`, celle que Hugo a créée ; `cat_vien` n'existe
> plus que dans le miroir du commerce (`catalog_categories`), périmé. La panne
> vient de la table en dur qui désigne des familles que le PIM n'a plus.
>
> Ouvert le 2026-09-26, après une panne de production : un article rangé par
> le PIM dans une **seconde** famille « Viennoiseries » (id
> `01a031ff-146f-756f-a21b-4a2759a35e85`, même slug que `cat_vien`) n'avait
> pas de rayon ; `shelfOfCategory` a levé `catalog.shelf.unknown`, et tout ce
> qui lit le catalogue pro est tombé en 500 — Tarification B2B, tarif d'un
> client, Limites de prix, liste d'articles de la saisie de commande. Hugo :
> « on ne devrait pas avoir de familles hardcodées, tout devrait être data ».
> État : **doc-first**, contredit par vitruve le 2026-09-26 (trois objections
> bloquantes, corrigées : §1, §3 lots 1 et 2, §5).

## 1. Ce qui existe (inventaire du 2026-09-26)

- **Une union fermée** : `catalogCategorySchema` (`packages/contracts/src/catalog.ts`)
  — `viennoiserie | pain | patisserie | sale | chocolat` —, avec
  `CATALOG_CATEGORY_LABELS` et `CATALOG_CATEGORY_ORDER`. `CatalogItemView.category`
  la porte ; `production-worksheet.ts` aussi.
- **Une traduction en dur** : `SHELF_BY_PIM_CATEGORY`
  (`apps/lfd-api/src/b2b/catalog/domain/shelf-of-category.ts`), `cat_vien →
viennoiserie`, etc. Trois lecteurs l'appellent : le catalogue pro
  (`catalog-backed-product-catalog.ts`, **lève** — c'est la panne), la fiche
  d'atelier (`catalog-workshop-shelves.reader.ts`, rend `null`), la vitrine
  publique (`shop-catalogue-pricing.service.ts`, rend `null`).
- **Des littéraux de rayon PERSISTÉS** comme `scope_id` quand `scope_type =
'category'` : `price_rules`, `price_floors`, `volume_ladders`,
  `volume_commitments` (schéma `public`), `order_time_limit` (schéma `pim`).
  `pricing-context.ts` le dit : « `categoryId` est le code de rayon, pas
  l'identifiant PIM » — et que la bascule devra reprendre ces lignes.
- **Le miroir des familles existe déjà** : `catalog_categories` (`id` du PIM,
  `name`, `slug`, `parent_id`, `position`, `vat_rate_percent`), reçu du PIM à
  chaque livraison, jamais édité côté commerce.
- **La doc qui a fait ce choix** :
  `architecture-resolution-de-prix.md` (« une famille inédite exige un
  déploiement, pas une devinette ») et `journal-de-remediation.md`. Le choix
  protégeait d'un rayon **deviné** ; il ne protège pas d'un rayon **manquant**,
  qui met tout le catalogue en panne. Les données le règlent mieux : une
  famille reçue EST un rayon, il n'y a plus rien à deviner.
- **Aucune porte** ne tient les rayons.
- **Ce qui porte DÉJÀ l'id PIM** (vérifié par vitruve) : les heures limites
  (`pim.order_time_limit`, résolues par `prisma.category` dans
  `target-labels.ts`) — et elles suivent la **hiérarchie** : le commerce les lit
  par `categoryPathOf(snapshot.categories, product.categoryId)`
  (`snapshot-limits.ts`). La vitrine range ses objets par `line.categoryId`
  (`storefront_object_shelf.shelf_key`). Ce plan ne touche ni l'un ni l'autre :
  c'est le modèle qu'il rejoint.
- **Des clés de famille dans le journal et les instantanés** : un fait de
  plancher a pour sujet `floorScopeKey`, soit `category:viennoiserie` (et
  `public:category:…` pour la clientèle publique) ; les instantanés de prix des
  lignes de commande (`pricing_steps`, `pricing_floor`, `pricing_commitment`,
  `pricing_rejected`) peuvent porter des portées en code de rayon. Les deux
  sont immuables.
- **Les ids de production ne sont pas prouvés** : aucun semis ni aucune
  migration ne crée `cat_vien` ; on ne le trouve que dans des tests, des
  fixtures et un JSDoc. Le doublon a un UUIDv7 — l'id que le PIM attribue
  aujourd'hui. Les cinq familles de production peuvent s'appeler autrement.

## 2. La décision

**Le rayon est la famille du référentiel**, identifiée par son `id` PIM, avec
son `name` et sa `position` lus dans `catalog_categories`. Plus d'union, plus
de table de traduction, plus de libellés en dur. Une famille nouvelle dans le
PIM est un rayon nouveau dès sa livraison, sans déploiement.

- **La portée « famille »** d'une règle, d'une limite, d'un palier, d'un
  engagement ou d'une heure limite porte l'**id PIM** de la famille.
- **La famille d'un article suit son CHEMIN**, comme les heures limites le
  font déjà (`categoryPathOf`) : une décision posée sur une famille vaut pour
  ses sous-familles, et la plus proche l'emporte (article > famille la plus
  profonde > … > catalogue). Deux sémantiques de famille dans le même
  produit — avec chemin pour l'heure limite, sans pour le prix — seraient
  une incohérence qu'on paierait à la première sous-famille. Aujourd'hui les
  cinq sont à plat, donc rien ne change de prix.
- **Le PIM refuse une famille dont le slug existe déjà** (et le nom, à la
  casse et aux accents près) : **index unique** sur le slug des familles non
  archivées, en base, et refus par l'agrégat de famille pour le nom normalisé,
  avec un message qui nomme la famille existante. Il est au **lot 0**. Le doublon du 2026-09-26 n'aurait pas pu être
  créé. Avec les familles en données, un doublon ne casse plus rien — il
  devient une vraie seconde famille, tarifable à part, ce qui est pire en
  silence : c'est pour ça que le refus est à la source.

  > **Révisé le 2026-09-26 (Hugo) — pas d'index pour l'instant.** Hugo
  > n'archive aucune des familles qu'il a créées en production : le doublon
  > `viennoiseries` y reste actif, et tout index unique échouerait au
  > déploiement. Le refus est donc **applicatif seul**, à la création et au
  > renommage (quand le slug change), et nomme la famille existante. Les
  > doublons existants restent tels quels. Un index est la bonne garantie —
  > une lecture ne ferme pas la course entre deux créations —, il viendra
  > quand la production n'aura plus de doublon.
  >
  > ⚠️ Constaté au lot 0 : la migration `20260826090000_unicite_slug_rang_emplacement`
  > pose **déjà** `category_slug_fr_unique` (sur `slug->>'fr'`, archivées
  > comprises), et la base de dev l'a. Un doublon de slug actif en production
  > veut dire que la production n'a pas cet index — dérive à vérifier
  > (`SELECT indexname FROM pg_indexes WHERE schemaname = 'pim' AND tablename = 'category'`).

## 3. Les lots — trois temps, parce que des contrats sont servis

### Lot 0 — la panne ne se reproduit pas (immédiat, indépendant)

1. **Un article d'une famille sans rayon n'est plus refusé : il se tarife sans
   décision de famille.** Écarter l'article aurait cassé autre chose —
   `CatalogBackedProductCatalog` est l'autorité de prix du checkout, et ses
   consommateurs (repricing d'un brouillon, occurrence d'abonnement, devis,
   mercuriale) échoueraient à leur tour sur ce SKU. Tarifé sans famille, il
   reçoit les décisions **d'article et de catalogue** — la limite du
   catalogue comprise — et aucune règle de famille : ce n'est pas un rayon
   **faux** (le risque que la levée voulait éviter), c'est un rayon
   **absent**, visible.
2. **Visible** : un compteur « N articles sans famille connue » en tête de la
   Réception du catalogue et de la Tarification, lu à la volée. C'est un
   **log** côté serveur (niveau avertissement, avec SKU et id de famille),
   pas un fait du journal : une lecture n'écrit rien (`CLAUDE.md` §4).
3. **Le refus du doublon dans le PIM** (§2).

Ce lot vit tant que le lot 3 n'a pas supprimé la traduction.

### L'état réel de la production (lu par Hugo le 2026-09-26)

- **Le PIM** a cinq familles, toutes à id généré : `01a031ff-146f-…`
  (viennoiseries), `01a031fe-c498-…` (pains), `01a031ff-fab7-…` (patisseries),
  `01a03200-7180-…` (sale-traiteur), `01a03200-cca9-…` (chocolat-confiserie).
  Aucune ne s'appelle `cat_*` — et l'index `category_slug_fr_unique` y est.
- **Le miroir du commerce** (`catalog_categories`, `catalog_items`) range
  encore la plupart des articles sous les `cat_*` d'une livraison ancienne ;
  seuls les articles republiés depuis portent l'id réel (deux, au
  2026-09-26).
- 🔴 **Conséquence pour les deux lots** : une même famille existe, dans le
  miroir, sous **deux ids** — `cat_vien` pour les articles pas encore
  republiés, `01a031ff-146f-…` pour les autres —, avec **le même slug**. Le
  lien stable entre l'ancien code de rayon, `cat_*` et l'id réel est le
  **slug** : `viennoiserie ↔ viennoiseries`, `pain ↔ pains`, `patisserie ↔
patisseries`, `sale ↔ sale-traiteur`, `chocolat ↔ chocolat-confiserie`.

### Lot 1 — étendre : la famille voyage à côté du rayon

- Contrats : `CatalogItemView` gagne `family: { id, name, position }` **à côté
  de** `category` (déprécié, pas retiré : les deux fronts en ligne le lisent).
  Idem `production-worksheet`.
- Lecteurs : le catalogue pro, la fiche d'atelier, la vitrine lisent la
  famille dans `catalog_categories`.
- Tarification : `PricingContext.categoryId` devient l'id PIM ; la résolution
  compare les portées « famille » à cet id **et**, le temps de la transition,
  au code de rayon de la famille — **retrouvé par son slug**, pas par son id,
  pour qu'un article resté sous `cat_vien` et un article republié sous
  `01a031ff-…` reçoivent tous deux les règles posées sur `viennoiserie`. La
  table de transition est `slug → code` (cinq lignes, datée, supprimée au lot 3) ; elle remplace `SHELF_BY_PIM_CATEGORY`, qui visait des ids que le PIM n'a
  plus. Un article dont le slug n'y est pas reste « sans famille connue »
  (lot 0).
- **À l'écran, une famille = un slug** tant que le miroir porte deux ids pour
  la même : regrouper par id ferait deux rayons « Viennoiseries ». Le rayon
  affiché prend le nom et la position de l'id réel (non `cat_*`) quand il
  existe.
- Écriture — 🔴 **sans jamais deux clés pour la même famille** : pour une des
  cinq familles connues, on écrit **toujours l'ancien code** jusqu'au lot 2 ;
  seule une famille sans code (nouvelle) s'écrit par son id PIM. Sinon, une
  règle posée sur `cat_vien` coexisterait avec une règle active sur
  `viennoiserie` — les contraintes d'exclusion comparent `scope_id` et ne
  verraient pas le doublon, la résolution ferait mordre les deux, et
  l'`UPDATE` du lot 2 créerait le chevauchement et échouerait en production.
- **L'ordre de déploiement** : les fronts d'abord (ils lisent `family` s'il
  est là, sinon `category`), le serveur ensuite. Pour un article d'une famille
  hors union, `category` n'a pas de valeur honnête : tant que le serveur la
  sert, ces articles portent `family` seul et `category` est **absent** — ce
  que les fronts du lot 1 savent lire, et qu'aucun front plus ancien ne verra,
  puisqu'ils sont déployés avant.
- Fronts : regroupement, libellés et ordre lus dans `family`.

### Lot 2 — basculer : les portées persistées changent de clé

**Préalable, tenu par la migration elle-même** : le miroir ne doit plus porter
aucun article sous une famille `cat_*` — Hugo republie tout le catalogue
depuis le PIM avant le déploiement. Sinon les articles restés sous `cat_vien`
perdraient leurs règles, réécrites vers l'id réel. La migration **s'arrête**
s'il en reste un (`SELECT count(*) FROM catalog_items WHERE category_id LIKE
'cat\_%'`).

Migration de données, **par table**. 🔴 **La correspondance code → id PIM
n'est pas écrite de mémoire** : elle se calcule dans la migration, code → slug
(la table de transition) → l'unique id **non `cat_*`** de `catalog_categories`
qui porte ce slug — conforme à l'état des lieux ci-dessus —, et la migration
**s'arrête** si une des cinq cibles manque ou est ambiguë dans
`catalog_categories` — sinon chaque règle serait réécrite vers un id mort et
cesserait de mordre sans que rien ne le dise.

- `price_rules`, `price_floors`, `volume_ladders`, `volume_commitments` :
  `scope_id` réécrit là où `scope_type = 'category'`. **Pas**
  `pim.order_time_limit`, qui porte déjà l'id PIM — et qu'une migration du
  commerce n'a pas à toucher (frontière `b2b → pim`).
- **Les contraintes d'exclusion** portent sur `scope_id` : la réécriture est
  un `UPDATE` d'une clé vers une autre, sans chevauchement nouveau possible
  (correspondance injective).
- **Le journal tarifaire** (`pricing_events.subject_id`) est immuable : les
  faits passés gardent leur clé, dans ses **formes réelles** —
  `category:viennoiserie`, `public:category:viennoiserie`. La lecture de
  l'historique d'une famille cherche les deux formes (id PIM et ancien code),
  la correspondance étant écrite une fois, dans un seul fichier daté, qui ne
  grandira plus.
- **Les instantanés de prix des lignes de commande** gardent leurs portées en
  code ; leurs lecteurs de libellés (`scope-names.ts`,
  `pricing-act-summary.ts`) lisent les anciens codes par ce même fichier
  daté après le lot 3.
- **Retour arrière** : l'`UPDATE` inverse, possible tant qu'aucune décision
  n'a été posée sur une famille nouvelle ; au-delà, il n'a plus de sens.
  Écrit en tête de la migration.
- **Avant de lancer** : un état des lieux de production (lecture, par Hugo) —
  combien de lignes de portée famille par table, et aucune valeur hors des
  cinq codes. Requête au §5.

### Lot 3 — resserrer : l'union disparaît

Un déploiement après le lot 2 (27 fichiers hors tests lisent l'union, compte
de vitruve du 2026-09-26) : `catalogCategorySchema`, ses libellés, son
ordre, `SHELF_BY_PIM_CATEGORY`, `shelfOfCategory`, `UnknownCatalogShelfError`,
le champ `category` déprécié et la double comparaison du lot 1 sont retirés.
Une porte (`lint:no-shelf-literals`) refuse le retour d'un littéral de rayon
dans `apps/lfd-api/src` et les contrats.

## 4. Tests

- Lot 0 : un article d'une famille inconnue n'empêche pas la liste de se
  charger (régression nommée d'après la panne) ; il se tarife sans décision
  de famille, la limite du catalogue le relève ; un brouillon, une
  occurrence d'abonnement et un devis qui le contiennent passent ; il est
  compté.
- Lot 1 : une famille livrée par le PIM et absente de l'union apparaît comme
  rayon, se tarife, se limite ; une règle posée sur l'ancien code mord
  toujours ; poser une règle sur une des cinq familles écrit l'ancien code
  (jamais deux clés) ; une décision sur une famille parente vaut pour sa
  sous-famille, la plus proche l'emporte.
- Lot 2 : la migration rejouée sur une base semée des cinq codes réécrit
  chaque ligne, et seulement celles de portée famille ; le prix d'un article
  est identique avant et après (e2e sur le tableau de la Tarification) ;
  l'historique d'une famille montre les faits d'avant et d'après.
- PIM : créer une famille au slug ou au nom déjà pris → refusé, avec un
  message qui nomme la famille existante.

## 5. L'état des lieux à lancer en production avant le lot 2

Lecture seule, par Hugo.

```sql
-- 1. les familles réelles : la correspondance du lot 2 en sort
SELECT id, name, slug, parent_id, position FROM public.catalog_categories ORDER BY position;

-- 2. les décisions de portée famille, vivantes, par clé
SELECT 'price_rules' AS t, scope_id, count(*) FROM public.price_rules
  WHERE scope_type = 'category' AND archived_at IS NULL GROUP BY scope_id
UNION ALL
SELECT 'price_floors', scope_id || ' · ' || clientele, count(*) FROM public.price_floors
  WHERE scope_type = 'category' AND archived_at IS NULL GROUP BY scope_id, clientele
UNION ALL
SELECT 'volume_ladders', scope_id, count(*) FROM public.volume_ladders
  WHERE scope_type = 'category' GROUP BY scope_id
UNION ALL
SELECT 'volume_commitments', scope_id, count(*) FROM public.volume_commitments
  WHERE scope_type = 'category' GROUP BY scope_id;
```

Toute clé de la requête 2 qui n'est ni un des cinq codes ni un id de la
requête 1 est à comprendre avant de lancer : c'est une collision possible.

## 6. Hors périmètre

- L'héritage entre familles imbriquées.
- ~~Le nettoyage du doublon de production~~ : il n'y avait pas de doublon
  (bandeau en tête). Rien à nettoyer dans le PIM.
