-- RETOUR ARRIÈRE de 20261102280000_les_noms_du_reassort_par_index
-- (audit du réassort, 2026-11-02).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ».
--
-- Retire l'index : aucune donnée n'est perdue, la liste des noms employés
-- retrouve son balayage d'avant. Retirer aussi `@@index([siteId, name])` du
-- schéma Prisma dans le même geste, sans quoi la prochaine migration le
-- recréerait.

SET lock_timeout = '5s';

DROP INDEX IF EXISTS "public"."site_resupply_site_id_name_idx";
