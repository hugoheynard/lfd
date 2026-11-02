-- RETOUR ARRIÈRE de 20261102270000_la_fiche_de_reassort_retiree
-- (audit du réassort, 2026-11-02).
--
-- 🔴 NE JAMAIS LE JOUER SANS UN ORDRE EXPLICITE DE HUGO. Il porte des
-- `DELETE` sur la base de production (`CLAUDE.md` §0 : aucune suppression
-- sans ordre explicite). Si `20261102290000_la_fiche_retiree_jamais_emballee`
-- est appliquée, jouer d'abord SON retour arrière : ses déclencheurs lisent
-- la colonne que celui-ci retire.
--
-- 🔴 NON APPLIQUÉ, et Prisma ne le lit pas. Il se joue À LA MAIN, une fois,
-- par l'URL DIRECTE, APRÈS le retour du code qui effaçait les fiches. La
-- migration reste inscrite « appliquée ».
--
-- Les fiches retirées sont d'abord effacées, comme l'ancien code l'aurait
-- fait à la réouverture : sans la colonne, elles redeviendraient visibles au
-- poste. Elles n'ont jamais été entamées (CHECK), rien de saisi ne se perd.

SET lock_timeout = '5s';

DELETE FROM "packing"."packing_resupply_line" AS line
 USING "packing"."packing_resupply" AS sheet
 WHERE line."service_day" = sheet."service_day"
   AND line."resupply_id" = sheet."resupply_id"
   AND sheet."withdrawn_at" IS NOT NULL;

DELETE FROM "packing"."packing_resupply" WHERE "withdrawn_at" IS NOT NULL;

ALTER TABLE "packing"."packing_resupply"
  DROP CONSTRAINT IF EXISTS "packing_resupply_withdrawn_untouched";

ALTER TABLE "packing"."packing_resupply" DROP COLUMN IF EXISTS "withdrawn_at";
