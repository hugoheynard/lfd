-- RETOUR ARRIÈRE de 20261102290000_la_fiche_retiree_jamais_emballee
-- (audit du réassort, 2026-11-02).
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE. La migration reste inscrite « appliquée ». Il ne retire
-- que les deux déclencheurs et leur fonction : aucune donnée n'est touchée.

SET lock_timeout = '5s';

DROP TRIGGER IF EXISTS "packing_resupply_withdrawn_unpacked_on_line"
  ON "packing"."packing_resupply_line";
DROP TRIGGER IF EXISTS "packing_resupply_withdrawn_unpacked_on_sheet"
  ON "packing"."packing_resupply";
DROP FUNCTION IF EXISTS "packing"."packing_resupply_withdrawn_unpacked"();
