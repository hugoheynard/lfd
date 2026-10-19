# Les e2e : connexions, attente de la base, bases encombrées

> État au **2026-10-19**. Remplace le TODO du flake des e2e ouvert le
> 2026-09-22. Ce qui n'est pas réglé est dans
> [`todo-flake-des-e2e.md`](todo-flake-des-e2e.md), au même dossier.

Les suites e2e de `apps/lfd-api` tournent sur **4 workers** (`E2E_WORKERS`),
chacun avec **sa** base (`lfc_b2b_test_w<n>`), toutes sur le **même serveur**
Postgres (`lfd-dev-postgres`, `max_connections = 100`). Ce document dit ce qui
tient ce serveur partagé, et ce qui a été mesuré.

## 1. Une application fermée rend ses connexions

C'est `PrismaConnection.onModuleDestroy` (`src/platform/database/database.module.ts`)
qui appelle `$disconnect()` sur le client injecté ; l'adaptateur `pg` 7.8 crée
son pool lui-même (`connectionString`) et le termine (`pool.end()`) quand Prisma
le libère. Un seul endroit, pour une seule raison : le client nu et le client
compté partagent le même pool, et deux `$disconnect` seraient une course.

En production, `main.ts` pose `enableShutdownHooks()` : au `SIGTERM`, Nest joue
`onModuleDestroy`, et aucun autre crochet d'arrêt n'interroge la base après
(vérifié le 2026-10-19 : `database.module.ts` est le seul fichier de `src/` à
en déclarer un).

🔴 **L'hypothèse du 2026-09-22 était fausse.** Elle tenait que `PrismaService`
ne fermait jamais son pool ; elle avait lu `prisma.service.ts`, où le cycle de
vie n'est pas, et non `database.module.ts`, où il est.

### La mesure (2026-10-19, `pg_stat_activity`, une lecture toutes les 2 s)

| Run                               | Suites | Pic de connexions client | Après le run |
| --------------------------------- | ------ | ------------------------ | ------------ |
| partiel, avant toute modification | 20     | **18**                   | 1            |
| partiel, après                    | 20     | **20**                   | 1            |
| complet, après (`pnpm test:e2e`)  | 340    | **21**                   | 1            |

Le compte reste **borné par 4 workers × 5** (`max: 5` dans `prisma.service.ts`)
et redescend à chaque fermeture : aucun cumul, loin des 100 du serveur.

### Le test qui le garde

`test/prisma-connection-release.e2e-spec.ts` boote et ferme l'application
**5 fois**, remplit le pool à chaque fois, et exige qu'à la fin le compte de
connexions de SA base revienne à son niveau de départ (attente bornée de 5 s).
Éprouvé : avec le `$disconnect` retiré, il rougit sur **25** connexions
restées ouvertes (5 cycles × 5).

## 2. Un worker attend la base avant de booter

`test/database-readiness.ts` — `waitForDatabase()`, appelé en tête de
`bootstrapE2e()` : un `SELECT 1` sur un client à part, **60 essais × 500 ms**
(30 s au plus, 2 s par tentative de connexion). Au-delà, la suite échoue en
nommant la base et les deux commandes à lancer. Réponse au 500
`persistence.database_unavailable` survenu cinq secondes après le lancement des
quatre workers (`staff-roles`, 2026-10-04).

## 3. Le travail de fond est drainé avant de vider et de fermer

`ctx.reset()` et `ctx.close()` attendent `BackgroundWork.whenIdle()` avant le
`TRUNCATE` et avant `app.close()` (`test/e2e-harness.ts`). Un courriel envoyé
en tâche de fond ne peut plus arriver après la remise à zéro (`production-batch`,
2026-10-04).

## 4. Une base de worker encombrée est signalée au provisionnement

Chaque `ctx.reset()` tronque toutes les tables : chaque table reçoit un fichier
neuf, et l'ancien reste sur disque **jusqu'au prochain checkpoint**. Mesuré le
2026-10-19 après un run de 20 suites : **63 396** fichiers sans relation dans
`lfc_b2b_test_w1` (46 000 à 65 000 sur les quatre), **zéro** après un
`CHECKPOINT`. Ce qui survit au checkpoint est un vrai orphelin — celui d'un
serveur arrêté brutalement — que Postgres ne nettoie jamais : c'est ce qui a
porté les bases à ~400 000 fichiers chacune le 2026-10-03, et fait tomber 39
suites en `No space left on device` (inodes du volume Docker).

`pnpm --filter lfd-api db:test:setup` (`test/setup-test-database.ts`) fait donc,
pour chaque base de worker : `CHECKPOINT`, puis compte les fichiers de
`base/<oid>` qui ne sont le `relfilenode` d'aucune relation. Au-delà de
**10 000** (`ORPHAN_FILE_THRESHOLD`), il affiche la commande qui recrée la base :

```bash
docker exec lfd-dev-postgres sh -c "psql -U \"\$POSTGRES_USER\" -d postgres -c 'DROP DATABASE IF EXISTS \"lfc_b2b_test_w1\" WITH (FORCE)'"
pnpm --filter lfd-api db:test:setup
```

La mesure demande un superutilisateur (`lfc` l'est dans le conteneur de dev) ;
sans ce droit, elle le dit et le provisionnement continue.

## 5. Ce qu'on ne fait pas

- **Remettre `maxWorkers: 1`** : `jest.e2e.cjs` l'interdit, et la raison tient
  — un test rouge en parallèle et vert seul accuse un état partagé.
- **Relever `max_connections`** : il n'y a rien à repousser, le pic est à 21.
