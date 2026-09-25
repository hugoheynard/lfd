# TODO — la durée d'un déploiement

> Ouvert le 2026-09-25, à la demande de Hugo : « pour déployer une codebase
> comme ça, ça devrait être 3 minutes ». Rien de ce qui suit n'est commencé.

## Ce qu'on cherche

**Qu'un changement poussé sur `dev` soit en production en quelques minutes**,
sans rien retirer de ce qui le garde : les portes, les typechecks, les tests
aux trois niveaux, la CI verte avant tout déploiement, les migrations
appliquées avant l'image neuve, et l'attente que cette image serve vraiment.

Le but n'est pas une CI plus rapide pour elle-même : c'est de ne plus hésiter
à déployer un petit correctif parce que le cycle coûte une demi-heure.

## Où on en est (mesuré)

| Étape                                 | 2026-09-24  | 2026-09-25  |
| ------------------------------------- | ----------- | ----------- |
| CI de `dev`                           | ~7 min      | 6 min 50    |
| Du push sur `main` à tout en ligne    | 21,5 min    | 6,1 min     |
| **Du push sur `dev` à la production** | **~28 min** | **~13 min** |

Ce qui a été fait le 2026-09-25 (runbook « Déployer », `pipelines.md`) :

- **plus de CI rejouée sur `main`** : la promotion est une avance rapide
  (`git push origin dev:main`), les déploiements retrouvent le run de `dev` par
  SHA ; le hook refuse une promotion qui n'est pas exactement `origin/dev`
  (`1deac375b`) ;
- **les déploiements construisent pendant l'attente** : ils n'attendent la CI —
  et les fronts, l'API — qu'avant le premier geste qui touche la production ;
- **six tranches e2e rééquilibrées** au lieu de quatre, durées régénérées depuis
  un run de CI vert (`3367202d4`).

## Ce qui reste, par gain attendu

### 1. Le vidage de base de chaque test e2e

`ctx.reset()` (`apps/lfd-api/test/e2e-harness.ts`) vide toutes les tables puis
ressème, **en série**, une quinzaine d'écritures : rôles un par un
(`ensureStaffRoleDefinitions`, un `upsert` par rôle), contextes de vente, point
de vente racine, allergènes, personnel, catalogue. Il tourne **avant chaque
test**. `admin-pricing` n'a aucun test lent : ce sont 105 tests, donc 105
vidages, et c'est la suite la plus longue (93 s en CI).

Pistes, à mesurer d'abord (chronométrer `reset()` seul) :

- grouper les semis en quelques requêtes (`createMany`, une transaction) ;
- partir d'un **modèle** : semer une fois, puis restaurer par
  `TRUNCATE … ; INSERT … SELECT` depuis des tables-modèles, ou par une base
  `TEMPLATE` Postgres.

⚠️ Toutes les suites en dépendent. Ce que le harnais garantit aujourd'hui —
aucune fuite d'un test au suivant, les fonctions de PRODUCTION rejouées plutôt
que des doubles (cf. ses commentaires) — doit rester vrai. Une accélération qui
laisserait passer une fuite coûterait plus qu'elle ne rend.

### 2. « Front admin (+ PIM) » tient la CI

Depuis les six tranches, c'est lui le plus long job de la CI (6,2 min). Voir
ce qu'il enchaîne (`ci.yml`, job `front-admin`) : tests, typecheck, build AOT.
S'ils sont en série, les couper en deux jobs parallèles, comme les e2e.

### 3. Le déploiement de l'API (5,6 min)

Mesuré le 2026-09-24 : image 1,7 min, attente que l'image neuve serve
1,2 min, synchronisation des secrets 1,1 min, migration, installation et
typecheck. Pistes :

- **cache de couches Docker** entre deux runs (`docker/build-push-action` avec
  cache GitHub) : l'installation des dépendances ne change presque jamais ;
- **le typecheck du déploiement** double celui de la CI, déjà verte sur le même
  SHA : le retirer ;
- **les secrets** : ne pousser que s'ils ont changé.

Ce qui ne se compresse pas : la migration, et l'attente de l'image neuve — c'est
elle qui distingue un déploiement réussi d'un `200` rendu par l'ancienne.

## Ce qui ne changera pas

Le plancher est **la CI de `dev` + le déploiement de l'API**. 3 minutes de bout
en bout supposeraient de retirer des garde-fous ; ce n'est pas le but.
L'objectif réaliste, une fois les trois points faits : **CI ~4 min, déploiement
~3 min**.
