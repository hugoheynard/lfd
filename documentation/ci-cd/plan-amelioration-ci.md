# Plan — une CI trois fois plus courte

> **Plan**, ouvert le 2026-10-13 sur la demande de Hugo : « ma CI est beaucoup
> trop longue, j'ai besoin qu'on la divise par au moins 3 ». Les lots 1 à 3 sont
> **bâtis** ; la suite est **décidée à moitié** (§4). Les mesures viennent des
> runs cités, ouverts le jour même. Ne touche ni à l'argent, ni à une migration,
> ni à une frontière de sécurité : pas de `vitruve` d'office (CLAUDE.md §9 bis).

## 0. Ce qui ne saute jamais

Accélérer ne veut pas dire prouver moins. Restent obligatoires à **chaque** run :

- les **e2e en entier** — découpées en éclats, jamais filtrées par le diff
  (Hugo, 2026-10-13 : pas de « tests touchés seulement ») ;
- le **typecheck des specs** — ni ts-jest en `isolatedModules` ni swc ne typent ;
- le **build AOT** des fronts — `tsc` ne voit pas les gabarits ;
- les **portes** du dépôt, `lint:e2e-durations` compris.

Un succès servi par un cache (turbo, ESLint) ne prouve rien pour le paquet
touché.

## 1. Où partait le temps (run 38347525043, 2026-10-13)

Run complet : **12 min 45**. Le fixe était faible partout (installation ~10 s,
build des paquets ~12 s, conteneurs ~15 s, migrations ~10 s) ; le temps partait
dans des jobs **en série** et dans les **e2e** :

| Job                       | Durée             | Ce qu'il faisait à la suite                         |
| ------------------------- | ----------------- | --------------------------------------------------- |
| e2e, 6 éclats × 2 workers | 9 min 30 à 12 min | 299 suites                                          |
| Front admin               | 9 min 50          | tests vitest 479 s, AOT, lint, typecheck            |
| Backend · contrôles       | 8 min 55          | unitaires 225 s, ESLint type-aware 180 s, typecheck |
| Front boutique            | 5 min 30          | tests 228 s, AOT                                    |

## 2. Les trois lots bâtis (2026-10-13)

| Lot                            | Commit      | Run         | Durée du run complet |
| ------------------------------ | ----------- | ----------- | -------------------- |
| avant                          | `b98ef0f30` | 38347525043 | 12 min 45            |
| 1 · découper les jobs en série | `57146f5ae` | 38350054509 | 12 min 03            |
| 2 · swc + cache Jest           | `ea294bf0d` | 38351177471 | 13 min 04            |
| 3 · e2e en 20 éclats           | `e4b418e84` | 38352558414 | **8 min 52**         |

- **Lot 1.** Backend en 3 jobs (lint · typecheck · unitaires) ; admin en
  lint+typecheck · AOT · tests en 4 éclats ; boutique en typecheck+AOT · tests
  en 2 éclats. Le builder `unit-test` d'Angular n'a pas de `--shard` :
  `dev-toolbox/ci/front-shard.mjs` relit les fichiers de `angular.json` et en
  passe la liste à chaque éclat. Ce que le lot découpait passe sous 4 min 30 ;
  le total ne bouge pas, les e2e restent le chemin critique.
- **Lot 2.** `@swc/jest` remplace ts-jest dans lfd-api, cache Jest gardé entre
  runs. Unitaires : 4 min 25 → 3 min 40. **Les e2e ne bougent presque pas** :
  la transpilation n'était pas leur coût (§3).
- **Lot 3.** 20 éclats e2e au lieu de 6, équilibrés par
  `apps/lfd-api/test/e2e-durations.json`. Éclats entre 162 et 330 s.

**Gain : 12 min 45 → 8 min 52, ×1,45.** L'objectif ×3 n'est pas atteint.

**Coût.** Environ 129 min de machine par run complet au lieu de 98 (+30 %),
surtout le fixe de chaque éclat. **Facturé : zéro** — le dépôt est public, et
les machines standard y sont gratuites (constaté le 2026-10-13 sur le run
38352558414, `billable` à 0 sur ses 38 jobs). Rendre le dépôt privé ferait de
ces +30 % un vrai coût.

## 3. Pourquoi on plafonne

1. **Les machines.** Une suite e2e prend en CI environ **2,9×** sa durée locale
   (2 vCPU partagés avec Postgres et MinIO). swc n'y change rien.
2. **Le parallélisme du compte.** Un run compte **36 jobs** ; GitHub en lance
   environ **20 à la fois** sur un compte gratuit. Les derniers éclats e2e
   démarrent ~4 min après le début du run. Avec ces machines, le plancher est
   d'environ **6 à 7 min**, quel que soit le découpage.
3. **La remise à zéro de la base, entre deux tests** — le vrai poste, mesuré
   ci-dessous.

### La mesure du démarrage (run 38355493316, 300 fichiers, 20 éclats)

L'instrumentation reste en CI (`apps/lfd-api/test/e2e-boot-log.ts`, active
seulement avec `E2E_BOOT_LOG`). Réunir les artefacts :
`gh run download <run> -p 'e2e-boot-*' -D <dossier>` puis
`node dev-toolbox/ci/e2e-boot-summary.mjs <dossier>`.

| Par fichier, en moyenne         | CI        | Local  |
| ------------------------------- | --------- | ------ |
| Démarrage de l'application      | 1 042 ms  | 536 ms |
| — compilation du module de test | 567 ms    | 291 ms |
| — `app.init`                    | 364 ms    | 212 ms |
| — base prête + bucket           | 40 ms     | 28 ms  |
| Arrêt                           | 37 ms     | 15 ms  |
| **Part du temps des e2e**       | **≈ 5 %** | ≈ 5 %  |

| `reset()` (vider les tables, réensemencer) | CI         | Local   |
| ------------------------------------------ | ---------- | ------- |
| Par appel                                  | ≈ 1,27 s   | ≈ 0,5 s |
| Appels sur un run                          | 3 341      | —       |
| **Part du temps des e2e**                  | **≈ 63 %** | —       |

**Conclusion : démarrer l'application une fois par worker ne vaut pas le
chantier** (≈ 7 s gagnées par éclat, au prix de doublures réinitialisables et
de fuites d'état possibles). **C'est `reset()` qu'il faut accélérer** : diviser
son coût par deux rendrait environ 30 % des e2e.

## 4. La suite

### Lot 4 — accélérer `reset()` (proposé, pas décidé)

Dans `apps/lfd-api/test/e2e-harness.ts`, à essayer dans cet ordre, en mesurant
chaque pas avec l'instrumentation :

1. **Un seul `TRUNCATE`** sur toutes les tables, au lieu de plusieurs.
2. **Ne réensemencer que ce qui a changé** — la graine des rôles, des réglages,
   des référentiels ne bouge pas d'un test à l'autre.
3. **Un test = une transaction annulée à la fin.** Le plus rapide, mais délicat
   ici : le code prend ses propres verrous (`FOR UPDATE`, consultatifs) et
   ouvre ses propres transactions (`UnitOfWork`), et plusieurs suites éprouvent
   justement des courses entre deux transactions. À réserver aux suites qui
   n'en ont pas.

Visé : e2e de 30 % plus courtes, run complet vers 6 min.

### Leviers payants — à décider par Hugo

- **Machines de 4 cœurs pour les e2e** : chaque éclat plus rapide, donc moins
  d'éclats, donc des places libérées parmi les 20. Payant à la minute, même
  pour un dépôt public.
- **Un plan GitHub à 40 jobs simultanés** (Team / Pro).

### Écarté

- **Ne lancer que les tests touchés** — refusé par Hugo le 2026-10-13. Le graphe
  d'imports ne voit ni une colonne renommée, ni une traduction, ni une variable
  d'environnement : une panne passerait sur `dev` et se verrait au déploiement.
- **Une application partagée entre fichiers** — écarté par la mesure (§3).

## 5. À regarder en passant

- **Suites e2e de plus de 55 s**, non découpées faute de pouvoir le faire sans
  risque : `dev-scenario-stability` (85 s, ~2 min en CI, un seul test),
  `dev-scenario` (59 s), `admin-catalog`, `production-batch`, `staff-roles`
  (~56 s chacune). Elles fixent le plancher d'un éclat.
- **Un test rouge une fois** sur le run de mesure :
  `guest-account-claim.e2e-spec.ts`, « une course entre deux premières
  entrées : une seule gagne » — deux entrées ont gagné. **Course réelle**, rouge
  trois fois le 2026-10-13 : l'admission ne relisait pas les comptes après
  avoir cherché la fiche invité, et la perdante ouvrait un second compte.
  Corrigé par `163f4074e`.
