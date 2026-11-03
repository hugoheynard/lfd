# Plan — les tables du retrait quittent le schéma `production`

> 📐 Plan, écrit le 2026-11-03 (Hugo : « on va commencer par déplacer la table
> avant d'avancer sur le retrait »). Migration de données : contredit par
> `vitruve` avant d'être bâti. Reprend les tranches 6 et 7 du plan d'origine
> ([`plan-contexte-retrait.md`](plan-contexte-retrait.md), §9), dont les
> tranches 1 à 5 sont bâties (le bloc `src/handover/` et ses portes).

## 1. Pourquoi maintenant, et pourquoi c'était bloqué

Le blocage écrit dans [`architecture-contexte-retrait.md`](architecture-contexte-retrait.md)
§6 tenait à une vérification impossible : la vue de transition n'avait été
éprouvée que sur l'adaptateur `pg` des tests, et « la production tourne sur
Accelerate ». **C'est caduc depuis le 2026-09-19** : Accelerate a été quitté
en production, la branche retirée le 2026-09-22, et `AppConfig` refuse une URL
`prisma+postgres://` (`CLAUDE.md` §5, relu le 2026-11-03). Un seul transport,
`pg`, en production, en dev et en e2e : ce que les tests éprouvent est ce qui
tourne.

Ce qui reste vrai, et que ce plan garde :

- `prisma migrate diff` traduit un `@@schema` changé en `DROP TABLE` +
  `CREATE TABLE` — une destruction. La migration s'écrit **à la main**.
- Le workflow applique `prisma migrate deploy` **avant** de basculer le code ;
  l'ancienne image répond encore une à deux minutes et vise
  `production.<table>`. Sans **vue de transition**, c'est un 500 au comptoir.

## 2. Les tables (recensées le 2026-11-03)

Lues et écrites par le seul bloc `src/handover/` (et `src/dev/`, l'outillage) :

| Table                             | Modèle Prisma        |
| --------------------------------- | -------------------- |
| `production.order_handover`       | `OrderHandover`      |
| `production.order_handover_proof` | `OrderHandoverProof` |
| `production.order_departure`      | `OrderDeparture`     |

**Aucun déclencheur** ne leur est attaché, aucune fonction plpgsql ne les nomme,
et aucune clé étrangère n'entre ni ne sort (relu par `vitruve` dans `pg_trigger`,
`pg_proc` et `pg_constraint`, base de dev, 2026-11-03) : `test/day-change-triggers.e2e-spec.ts`
les range parmi les tables **exemptées** du balayage des versions de journée.

## 3. Tranche A — le déplacement (un déploiement)

Migration écrite à la main, `…_le_retrait_dans_son_schema` :

```sql
CREATE SCHEMA IF NOT EXISTS "handover";
ALTER TABLE "production"."order_handover"       SET SCHEMA "handover";
ALTER TABLE "production"."order_handover_proof" SET SCHEMA "handover";
ALTER TABLE "production"."order_departure"      SET SCHEMA "handover";
-- La fenêtre de l'ancienne image : elle vise encore production.<table>.
CREATE VIEW "production"."order_handover"       AS SELECT * FROM "handover"."order_handover";
CREATE VIEW "production"."order_handover_proof" AS SELECT * FROM "handover"."order_handover_proof";
CREATE VIEW "production"."order_departure"      AS SELECT * FROM "handover"."order_departure";
```

`SET SCHEMA` déplace la table **avec** ses données, index, contraintes,
séquences possédées et déclencheurs : rien n'est recopié, rien n'est perdu.
Rollback : `DROP VIEW` ×3, `SET SCHEMA "production"` ×3, `DROP SCHEMA "handover"`
— 🔴 **le code d'abord, le SQL ensuite** : rejouer ce SQL pendant que la
nouvelle image vise `handover.*` rend le 500 au comptoir qu'on évite.

Avec elle, dans le même commit :

- `prisma/schema/datasource.prisma` : `"handover"` dans `schemas` ;
- `prisma/schema/handover.prisma` : les trois modèles, `@@schema("handover")` ;
- `test/day-change-triggers.e2e-spec.ts` : les trois exemptions passent à
  `handover.*`, **et** `'handover'` rejoint la liste des schémas balayés —
  sans quoi une future table du retrait qui porte un jour échapperait à la
  porte ;
- l'outillage de dev : `purge-coverage.ts` et la purge du fournil
  (`production.purge.ts`), le semis (`production.seed.ts`) ;
- les commentaires du code qui disent « le retrait n'a pas de schéma à lui »
  (jamais ceux des `migration.sql`, dont le checksum est figé) ;
- la doc : `architecture-contexte-retrait.md` §6.

**La dérive Prisma** : `prisma migrate diff` de la base de dev migrée vers le
schéma Prisma doit rendre une migration vide, vues présentes — lancé dans ce
lot, avant le commit.

**Contrôle, pas pivot** : `SET SCHEMA` préserve les données quel que soit le
compte. `SELECT count(*)` des trois tables en production, juste avant le
déploiement, par Hugo (`CLAUDE.md` §0 : personne d'autre ne touche la base de
production), pour comparer après.

## 4. Tranche B — la vue retirée (le déploiement suivant)

Une fois la tranche A en production et l'ancienne image éteinte : migration
`DROP VIEW` ×3. Rollback : `CREATE VIEW` ×3.

⚠️ **Le point d'irréversibilité** : une fois B en production, revenir à
`production` demande un nouveau `SET SCHEMA` sur une base vivante, en trois
déploiements (vues, bascule, retrait des vues).

## 5. Éprouvé par `vitruve` (2026-11-03, base de dev, PG 17, transaction annulée)

- Le SQL du §3 passe tel quel.
- À travers la vue : INSERT avec `RETURNING` (le défaut `rank = 1` s'applique),
  `ON CONFLICT DO NOTHING` avec ou sans cible, `ON CONFLICT … DO UPDATE`,
  UPDATE et DELETE avec `RETURNING`, et `23505` sous le nom de la contrainte de
  la table de base.
- Le retrait n'écrit par aucun `upsert` Prisma ; sa seule écriture concurrente,
  `createMany({ skipDuplicates: true })` (`prisma-order-departure.repository.ts`),
  produit `ON CONFLICT DO NOTHING`, éprouvé.
- Non vérifié : les droits du rôle de migration en production (`CREATE SCHEMA`) —
  probable, `delivery` et `packing` ont été créés par migration.
