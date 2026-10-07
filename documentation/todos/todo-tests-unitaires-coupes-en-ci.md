# TODO — les tests unitaires de l'API coupés par GitHub

> **Ouvert le 2026-10-07** (Hugo : « note en todo cette situation de test »).
> Ce qui est constaté, ce qui a été tenté, et ce qui reste à comprendre.
> Débloqué le 2026-10-07 au soir (`ebf110ad3`, déployé) ; la cause profonde
> reste ouverte.

## Le constat

- Le job **« Backend B2B · contrôles »** de `ci.yml` (typecheck, lint, tests
  unitaires de `lfd-api`) n'a **pas réussi depuis le 2026-10-06 à 5 h 38**
  (run `37419560723`, tests unitaires en 7 min). Toutes ses exécutions
  suivantes sont annulées ou rouges.
- Le 2026-10-07, ses tests unitaires ont été **coupés deux fois** par GitHub
  (`SIGTERM`, « The operation was canceled »), vers la **12e minute**, **sans
  aucun test rouge** : les fichiers passaient encore au moment de la coupure
  (run `37660945072`, et sa relance).
- **Sur un poste**, la même suite tient en **34 s** (7 608 tests, pic de
  1,4 Go, Apple M1 Pro). Sur la CI, elle dépassait 11 min.
- Ce rouge est resté **invisible** tant que les déploiements ne touchaient pas
  l'API : le déploiement attend `ci.yml`, et ce job est sauté quand l'API ne
  change pas.

## Deux autres rouges du même jour, corrigés

- **Le lint de l'API manquait de mémoire** (tas de 4 Go par défaut, 5,5 Go
  mesurés après le découpage des fichiers de la livraison) : `lint:ci` a
  désormais `--max-old-space-size=6144` (`b932cf636`).
- **`dev-scenario.e2e-spec.ts` dépendait d'OSRM** : l'arrêt du plan compose
  les tournées depuis le 2026-10-07, et la CI n'a pas de carte routière. Le
  test double la carte (`ROAD_ROUTING_OVERRIDES`, `b932cf636`).

## Ce qui a été tenté

- `workerIdleMemoryLimit: "1536MB"` dans `apps/lfd-api/jest.unit.cjs`
  (`ebf110ad3`) : un worker qui dépasse le seuil est remplacé entre deux
  fichiers. **Résultat** : la CI d'`ebf110ad3` passe, tests unitaires en
  **2 min 27** (run `37666548060`) au lieu d'être coupés à 12 min. La
  mémoire était donc bien en cause, même si aucun journal ne le disait — la
  coupure ne laissait ni « heap out of memory » ni « killed ».

## Ce qui reste à faire

- **Surveiller la marge** : 2 min 27 en CI contre 34 s sur un poste. Si la
  suite grossit, `--maxWorkers` explicite (la CI prend le défaut de Jest,
  cœurs − 1) ou des tranches comme les e2e ; et une limite `timeout-minutes`
  écrite, pour qu'une coupure dise pourquoi.
- **Comprendre ce qui gonfle les workers** (un module lourd chargé par
  beaucoup de specs ?) : le seuil soigne le symptôme.
- **Expliquer l'écart 34 s → 11 min** avant le seuil : à lui seul, il dit que quelque chose
  ne va pas sur le runner, même si le job finit par passer.
- **Ne plus pousser `main` sans la CI verte de `dev`** : le 2026-10-07, la CI
  de `dev` était rouge depuis 16 h 52 quand `main` a été poussé ; seul le
  garde du déploiement (« Attendre que la CI soit verte ») a empêché la mise
  en production.
