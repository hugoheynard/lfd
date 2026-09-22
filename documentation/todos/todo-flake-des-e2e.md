# TODO — le flake des e2e : une suite au hasard, verte quand on la rejoue

> **Ouvert le 2026-09-22**, après **deux** occurrences dans la même journée, sur
> deux suites différentes, lors de deux déploiements distincts.
>
> ⚠️ Ce n'est pas « les e2e sont flaky ». Le dépôt a déjà nommé et corrigé un
> flake inter-suites ; celui-ci en est un AUTRE, et il a une piste chiffrée.

---

## 1. Ce qui a été observé

| Passage    | Suite tombée              | Symptôme                                  | Rejouée seule |
| ---------- | ------------------------- | ----------------------------------------- | ------------- |
| matin      | `staff-author-conversion` | `timeout exceeded when trying to connect` | ✅ 7/7        |
| après-midi | `customer-sheet`          | `expected 200 "OK", got 500`              | ✅ 16/16      |

Les deux fois : **relance complète verte** (122 suites, 1699 tests, sortie 0).

🔴 **Aucun des deux échecs ne pouvait venir des commits en cours** : ceux de
l'après-midi ne touchaient **aucune ligne** de `apps/lfd-api`, `packages/` ni
`gateway` (vérifié par `git diff --stat origin/dev..dev -- …`, vide).

---

## 2. Ce que ce n'est PAS

**Ce n'est pas le flake déjà corrigé.** `test/e2e-harness.ts` documente un
mécanisme voisin — du travail de fond qui continuait d'écrire dans la base
**après** la fermeture d'une suite, et faisait accuser un test innocent. Sa
parade est en place (`await background.whenIdle()` avant `app.close()`), et
**les 122 suites ferment bien leur application** (vérifié le 2026-09-22).

**Ce n'est pas un défaut d'isolation des données.** Depuis le passage au
parallèle, chaque worker a **sa propre base** (`lfc_b2b_test_w<n>`) et son
bucket, posés par `test/setup-env.ts`. Deux suites ne peuvent plus se tronquer
mutuellement leurs fixtures.

🔴 **Et ce n'est pas à « réparer » en revenant à un worker unique.**
`jest.e2e.cjs` l'interdit explicitement, et la phrase est la bonne consigne
pour ce TODO :

> ⚠️ Ne pas remettre `maxWorkers: 1` en croyant réparer un flake : ce serait
> masquer une fuite d'isolation au lieu de la lire. Un test qui échoue en
> parallèle et passe seul accuse un état **PARTAGÉ** qu'on a manqué —
> cherchez-le.

---

## 3. L'état partagé qu'on a manqué : le SERVEUR Postgres

Chaque worker a sa base. **Tous partagent le même serveur**, donc le même
plafond de connexions.

Les nombres, tous mesurés ou lus le 2026-09-22 :

| Quoi                           | Valeur                       | Où                         |
| ------------------------------ | ---------------------------- | -------------------------- |
| `max_connections` du conteneur | **100**                      | `lfd-dev-postgres`, mesuré |
| Pool d'UNE instance            | `max: 5`                     | `prisma.service.ts`        |
| `connectionTimeoutMillis`      | `5_000`                      | idem                       |
| Workers e2e                    | **4** (`E2E_WORKERS ?? "4"`) | `jest.e2e.cjs`             |
| Suites                         | 122                          | `test/*.e2e-spec.ts`       |

### 🔴 L'hypothèse, et elle est testable

**`PrismaService` ne ferme jamais son pool.** Vérifié : la classe n'implémente
**ni `OnModuleDestroy` ni `onApplicationShutdown`**, et n'appelle nulle part
`$disconnect()` (zéro occurrence dans le fichier).

Chaque suite boote son `AppModule`, ouvre un pool jusqu'à 5 connexions, puis
`app.close()` — qui démonte le graphe Nest **sans qu'on ait dit à Prisma de
rendre ses connexions**.

Un worker enchaîne ~30 suites. Si les pools ne se libèrent pas :

```
4 workers × 30 suites × jusqu'à 5 connexions ≫ 100
```

Le plafond se franchit **en cours de route**, ce qui explique **les deux
symptômes d'un coup** :

- une requête qui n'obtient pas de connexion en 5 s → « timeout exceeded when
  trying to connect » (le message EXACT du matin) ;
- la même chose survenue **pendant** une requête HTTP → `TechnicalError` →
  **500** (le symptôme de l'après-midi).

Et ça explique aussi pourquoi la suite accusée est **différente à chaque fois** :
ce n'est pas elle qui fautive, c'est celle qui passait au moment où le plafond a
été atteint.

⚠️ **C'est une hypothèse, pas un diagnostic.** Elle n'a pas été confirmée : il
faut la mesurer (§4).

---

## 4. Comment la confirmer, en une commande

Pendant un run e2e complet, regarder les connexions monter :

```bash
watch -n 2 'docker exec lfd-dev-postgres psql -U lfc -d postgres -tAc \
  "select count(*), state from pg_stat_activity group by state"'
```

**Ce qu'on cherche** : un compte qui **monte sans redescendre** au fil des
suites, et une majorité d'`idle`. Si le compte reste stable autour de 20
(4 workers × 5), l'hypothèse tombe et il faut chercher ailleurs.

---

## 5. La direction, si elle se confirme

1. **`PrismaService` rend ses connexions** — implémenter `OnModuleDestroy` et y
   appeler `$disconnect()`. C'est le correctif juste : il vaut aussi en
   production, où chaque redéploiement laisse deux instances coexister une à
   deux minutes.
2. **Le vérifier par un test**, pas par un run vert : un e2e qui boote et ferme
   l'app N fois et constate que le compte de `pg_stat_activity` revient à son
   niveau de départ. Sans lui, la fuite reviendra sans qu'on la voie.
3. ⚠️ **Ne pas se contenter de relever `max_connections`.** Ça repousserait le
   seuil sans supprimer la fuite — et la fuite, elle, existe aussi en
   production.

---

## 6. Pourquoi ça mérite d'être fermé

Un échec au hasard, vert à la relance, apprend à **relancer jusqu'au vert**.
C'est ce réflexe qui fait passer une vraie régression pour un aléa — et il
s'installe d'autant plus vite que la relance donne raison à chaque fois.

Aujourd'hui le tri a coûté, deux fois, une relance complète (~3 min) **plus**
la lecture du périmètre des commits pour écarter la cause réelle. C'est le prix
à chaque déploiement, tant que ce n'est pas fermé.
