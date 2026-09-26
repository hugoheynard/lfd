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
  (le fichier `shelf-of-category` du catalogue, retiré par la livraison), `cat_vien →
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
- **Le miroir du commerce** : **aucun article vivant** n'est rangé sous un
  `cat_*` (requête de Hugo, 0). Les lignes `cat_*` de `catalog_categories`
  restent pourtant — la projection fait des `upsert` et ne supprime jamais —,
  familles orphelines sans article vivant. ⚠️ Une version antérieure de ce
  paragraphe disait « la plupart des articles sous `cat_*` » : c'était une
  déduction, démentie par la mesure.
- 🔴 **Conséquence pour les deux lots** : une même famille existe, dans le
  miroir, sous **deux ids** — `cat_vien` pour les articles pas encore
  republiés, `01a031ff-146f-…` pour les autres —, avec **le même slug**. Le
  lien stable entre l'ancien code de rayon, `cat_*` et l'id réel est le
  **slug** : `viennoiserie ↔ viennoiseries`, `pain ↔ pains`, `patisserie ↔
patisseries`, `sale ↔ sale-traiteur`, `chocolat ↔ chocolat-confiserie`.

### Lots 1 à 3 réunis — la famille est l'id PIM, en une livraison

**Pourquoi réunis** (état des lieux de production lu par Hugo le
2026-09-26) : **aucune** décision de portée famille n'existe en production —
ni règle, ni limite, ni palier, ni engagement vivants — et **aucun** article
vivant n'est rangé sous un `cat_*`. La transition en trois temps (double clé,
pont par slug, réécriture pendant le déploiement) protégeait des données qui
n'existent pas ; ses trois objections bloquantes (vitruve, 2026-09-26)
tombaient toutes sur cette fenêtre. Sans données à migrer, pas de fenêtre.

1. **La famille d'un article est son `category_id`**, id PIM, avec `name` et
   `position` lus dans `catalog_categories`. **Une liste de familles ne montre
   que celles qui portent au moins un article vivant** : les `cat_*`
   orphelins du miroir n'apparaissent nulle part (sélecteur de portée,
   rayons, compteurs). Contrats : `CatalogItemView`,
   `production-worksheet` et les vues de la Tarification portent
   `family: { id, name, position } | null` (`null` = article sans famille
   reçue, cas du lot 0 qui ne peut plus se produire que par une livraison
   incomplète).
2. **La tarification compare l'id PIM**, et lui seul : `PricingContext.categoryId`,
   `scope-index`, `specificity`, `volume-commitment`, `pricing-scopes` (le
   chargement), `pricing-materials.loader`, `loaded-pricer`, `board-category`,
   `board-comparison` — tous les sites que vitruve a nommés.
3. **Le chemin** : une décision de famille vaut pour ses sous-familles, la
   plus proche l'emporte (`categoryPathOf`, comme l'heure limite).
4. **Retirés** : `catalogCategorySchema`, `CATALOG_CATEGORY_LABELS`,
   `CATALOG_CATEGORY_ORDER`, `SHELF_BY_PIM_CATEGORY`, `shelfOfCategory`,
   `UnknownCatalogShelfError` côté serveur. Une porte
   (`lint:no-shelf-literals`) refuse leur retour. **Sauf le champ servi
   `category`** : il reste dans les vues, **toujours `null`**, déprécié — le
   front déjà déployé (`packages/b2b-ui/src/catalog/catalog-shelves.ts`) range un `null` sous
   « Sans famille connue » mais **perd** un article dont le champ est absent
   (`undefined` ne passe aucun test), et fronts et serveur se déploient par
   des workflows distincts (`CLAUDE.md` §0). Il se retire dans une livraison
   suivante, quand plus aucun front ne le lit.
5. **La migration** `…_les_familles_se_lisent_en_donnees` : pour les bases qui
   ont des codes de rayon (le dev, les semis de test), réécrit `scope_id`
   des quatre tables de portée famille, **code → slug → l'id de
   `catalog_categories` qui porte ce slug**, en préférant l'id non `cat_*`
   s'il y en a deux. Elle **échoue** si un code présent n'a pas de cible
   unique — avec un message qui dit laquelle. En production, elle ne réécrit
   rien : l'état des lieux l'a montré, et c'est le premier test qu'elle
   passe. Pas de réécriture de `pim.order_time_limit` (déjà en id PIM).
6. **Le journal et les instantanés** gardent leurs clés passées ; un seul
   fichier daté (`legacy-shelf-codes.ts`, cinq lignes, qui ne grandira plus)
   traduit un ancien code en libellé pour les lire.
7. **L'ordre de déploiement** : pendant la fenêtre où un front ancien lit un
   serveur neuf, il reçoit `category: null` et range tout sous « Sans famille
   connue » — dégradé, pas vide, et quelques minutes. Les fronts neufs lisent
   `family`.
8. **Décisions archivées** : la lecture datée (`unarchivedAt(at)`) relit une
   décision archivée après `at`. Si une règle ou une limite archivée porte un
   code de rayon, la migration la réécrit aussi — sinon elle cesserait de
   s'appliquer au passé. **À mesurer** : l'état des lieux se relance sans le
   filtre d'archivage (§5, requête 3). **Mesuré le 2026-09-26 : aucune** —
   en production, la migration ne réécrit rien, archives comprises.
9. **Lecteurs des clés passées** : les instantanés (`pricing_steps`…) et les
   sujets du journal (`category:viennoiserie`) sont inventoriés au début de la
   livraison ; tout lecteur qui les **compare** (et pas seulement les
   affiche) passe par `legacy-shelf-codes.ts`.
10. **Le coût, chiffré** (vitruve, 2026-09-26) : 19 fichiers source lisent
    l'union ou la traduction — dont le port du fournil
    `production/channels/commerce/workshop-shelves.reader.ts`,
    `production-worksheet-groups.ts`, `scope-names.ts`,
    `company-pricing.query.ts`, `prisma-pricing-board.reader.ts` — et
    `"viennoiserie"` paraît dans 30 fichiers dont 7 e2e ; les fixtures `cat_*`
    (catalog-fixture, catalog-ingest-fixtures, storefront-*, catalog-parity,
    admin-catalog) se réécrivent à la main : la migration ne sert pas les
    bases de test, créées vides.
11. **Base de dev sans cible** : si la migration échoue faute de slug (un
    miroir de dev jamais livré par le PIM), le geste de sortie est de relancer
    `seed:pim` puis `migrate deploy`. Écrit en tête de la migration.
12. **Retour arrière** : gratuit tant que rien n'est sur `main` ; ensuite, une
    migration inverse id → code, non écrite.

## 4. Tests

- Lot 0 : un article d'une famille inconnue n'empêche pas la liste de se
  charger (régression nommée d'après la panne) ; il se tarife sans décision
  de famille, la limite du catalogue le relève ; un brouillon, une
  occurrence d'abonnement et un devis qui le contiennent passent ; il est
  compté.
- Une famille livrée par le PIM apparaît comme rayon, avec son nom et sa
  position, se tarife et se limite, sans déploiement ; une décision sur une
  famille parente vaut pour sa sous-famille, la plus proche l'emporte.
- La migration, rejouée sur une base semée des cinq codes, réécrit chaque
  ligne de portée famille et elles seules ; le prix d'un article est
  identique avant et après ; sur une base sans code, elle ne touche rien ;
  un code sans cible unique la fait échouer.
- PIM : créer une famille au slug ou au nom déjà pris → refusé, avec un
  message qui nomme la famille existante.

## 5. L'état des lieux à lancer en production avant la livraison

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

```sql
-- 3. les décisions ARCHIVÉES de portée famille (la lecture datée les relit)
SELECT 'price_rules' AS t, scope_id, count(*) FROM public.price_rules
  WHERE scope_type = 'category' AND archived_at IS NOT NULL GROUP BY scope_id
UNION ALL
SELECT 'price_floors', scope_id, count(*) FROM public.price_floors
  WHERE scope_type = 'category' AND archived_at IS NOT NULL GROUP BY scope_id;
```

Toute clé de la requête 2 qui n'est ni un des cinq codes ni un id de la
requête 1 est à comprendre avant de lancer : c'est une collision possible.

## 6. Hors périmètre

- L'héritage entre familles imbriquées.
- ~~Le nettoyage du doublon de production~~ : il n'y avait pas de doublon
  (bandeau en tête). Rien à nettoyer dans le PIM.
