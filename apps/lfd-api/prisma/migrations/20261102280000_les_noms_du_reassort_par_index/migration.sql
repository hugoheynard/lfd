-- LES NOMS DU RÉASSORT LUS PAR INDEX — la liste « noms déjà employés au
-- point » (R1g, `PrismaResupplyUsedNames.usedAt`) regroupe `site_resupply`
-- par nom pour UN point ; aucun index ne commençait par `site_id`, la
-- lecture balayait la table de tous les points (audit du réassort,
-- 2026-11-02, tranche 1).
--
-- ADDITIVE : un index neuf, aucune colonne ni contrainte touchée. Déclaré
-- aussi dans `prisma/schema/public/resupply.prisma` (`@@index([siteId, name])`),
-- sous le nom que Prisma lui donne, pour que le schéma et la base ne
-- divergent pas.
--
-- Table petite aujourd'hui : un `CREATE INDEX` simple, sous `lock_timeout`,
-- plutôt que `CONCURRENTLY`, qui ne tourne pas dans la transaction de Prisma.
--
-- Retour arrière : `prisma/rollback/20261102280000_les_noms_du_reassort_par_index.sql`.

SET lock_timeout = '5s';

CREATE INDEX IF NOT EXISTS "site_resupply_site_id_name_idx"
  ON "public"."site_resupply" ("site_id", "name");
