# TODO — les tests unitaires de l'API en CI

> **Ouvert le 2026-10-07** dans `todos/`
> (Hugo : « note en todo cette situation de test »). **Réécrit et déplacé le
> 2026-10-19** avec les mesures du jour : il n'y a plus eu de coupure depuis
> le 2026-10-07, et ce qui reste est une marge à surveiller et une cause à
> confirmer.

## Ce qui s'est passé (2026-10-07)

Les tests unitaires de `lfd-api` ont été **coupés deux fois** par GitHub vers
la **12e minute** (« The operation was canceled »), sans test rouge et sans
« heap out of memory » dans le journal. `workerIdleMemoryLimit: "1536MB"` dans
`apps/lfd-api/jest.unit.cjs` (`ebf110ad3`) a débloqué la CI : 2 min 27 ce
jour-là. La mémoire était donc en cause.

## Ce qui est réglé

- **Plus de coupure** depuis `ebf110ad3`. Les 5 dernières CI vertes de `dev`
  (2026-10-18) passent toutes.
- **Une limite écrite** (2026-10-19) : `timeout-minutes` sur les quatre jobs
  du backend dans `.github/workflows/ci.yml`, ≈ 3× la plus longue des 5
  dernières CI vertes. Une coupure dit désormais pourquoi.
- **`maxWorkers` explicite** (2026-10-19) : `"75%"`, ce qui donne 3 workers
  sur un runner `ubuntu-latest` (dépôt public : 4 vCPU, 16 Go), comme le
  défaut que la CI prenait déjà.
- **« Ne plus pousser `main` sans la CI verte de `dev` »** est tenue depuis.

## Les chiffres du 2026-10-19

| Mesure                                      | Valeur                                       |
| ------------------------------------------- | -------------------------------------------- |
| Job « tests unitaires », 5 CI vertes        | 3 min 52 à 4 min 45                          |
| Étape `test:unit` seule                     | 2 min 58 à 3 min 52 (227 s, 10 739 tests)    |
| Limite écrite (job / étape)                 | 15 min / 12 min                              |
| Autres jobs : lint, typecheck, e2e (max)    | 4 min 42, 2 min 24, 8 min 21 → 15, 8, 25 min |
| Poste (M1 Pro, 10 cœurs), défaut, 9 workers | 76 s                                         |
| Poste, `75%` (7 workers)                    | 69 s                                         |
| Poste, 3 workers (comme la CI)              | 100 s                                        |
| Pic de tas d'un worker                      | ~1,55 Go, puis le worker est recyclé         |

En série avec `--expose-gc` (`jest -i --logHeapUsage`, 8 min 10) : le tas net
ne monte que de **274 Mo** sur 1 234 fichiers. Ce n'est pas une fuite, c'est
une dent de scie : chaque fichier laisse du tas que le GC reprend plus tard.
Une spec d'**application** en laisse ~**47 Mo** en moyenne (359 fichiers),
une spec de **domaine** ~**15 Mo** (844 fichiers).

## Ce qui reste

- **Confirmer ce qui gonfle les specs d'application.** Hypothèse non prouvée :
  les handlers importent `@nestjs/cqrs` (627 modules CommonJS chargés, mesurés
  hors de Jest), que chaque fichier réévalue dans son propre registre. À
  vérifier en mesurant une spec qui n'importe que ce module, avant de
  toucher à quoi que ce soit.
- **Surveiller la marge.** 3 min 49 le 2026-10-18 contre 2 min 27 le
  2026-10-07, pour 10 739 tests au lieu de 7 608 : la durée suit la suite.
  Si l'étape approche la limite de 12 min, refaire la mesure, puis découper
  en tranches comme les e2e. Ne pas relever la limite à l'aveugle.
- **L'écart poste/CI** (69 s contre 3 min 49) s'explique en partie par
  3 workers contre 7. Le reste, c'est le CPU du runner, et rien ne l'a mesuré.
