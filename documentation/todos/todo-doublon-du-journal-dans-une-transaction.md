# TODO — un doublon du journal fait échouer la transaction qu'il devait épargner

> Ouvert le 2026-09-18, relevé en bâtissant
> [`../auth-inscription/plan-journal-de-l-annuaire.md`](../auth-inscription/plan-journal-de-l-annuaire.md).
> **Non reproduit par un test** : c'est une déduction du code et du comportement
> de Postgres.

## Le constat

`PrismaActivityRecorder.append` (`b2b/growth/infrastructure/prisma-activity-recorder.ts`)
attrape une violation d'unicité (`P2002`) sur `idempotency_key` et la traite
comme un doublon idempotent : « déjà journalisé, rien à faire ».

C'est juste **hors transaction**. **Dans** une `UnitOfWork`, l'`INSERT` qui
échoue met la transaction Postgres en état d'échec : toute requête suivante est
refusée, et le commit devient un rollback. L'erreur avalée par le recorder
ressort donc au commit, et le geste métier est annulé.

## Qui est exposé

Tous les gestes qui journalisent dans une transaction : les `publishTraced` des
comptes clients, les faits de l'annuaire staff (2026-09-18), le journal du
référentiel.

## Quand ça arrive

Seulement si le même fait est écrit deux fois avec la même clé
(`type:subjectId:traceId`) : une requête rejouée avec le même `traceparent`, ou
un geste qui écrirait deux fois le même type sur le même sujet dans une seule
requête. Rare, mais la conséquence — un geste refusé pour cause de trace déjà
présente — est l'inverse de ce que le `catch` promet.

## Pistes

- `INSERT … ON CONFLICT (idempotency_key) DO NOTHING` (SQL brut ou
  `createMany({ skipDuplicates: true })`) : pas d'erreur, donc pas de
  transaction avortée ;
- ou un point de sauvegarde autour de l'`INSERT` quand une transaction est en
  cours.

Le test de non-régression : un `uow.run` qui écrit deux fois le même fait, puis
une écriture métier, et qui doit réussir.
