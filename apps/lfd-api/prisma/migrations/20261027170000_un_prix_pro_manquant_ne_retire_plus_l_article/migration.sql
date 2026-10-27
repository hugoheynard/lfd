-- UN PRIX PRO MANQUANT NE RETIRE PLUS L'ARTICLE (Hugo, 2026-10-27,
-- `documentation/pricing/plan-prix-manquant-non-bloquant.md`, lot P3).
--
-- ADDITIVE : la colonne perd son `NOT NULL`, aucune ligne n'est réécrite.
-- `NULL` veut dire « pas vendable aux pros », jamais « gratuit » : le
-- lecteur du catalogue servi n'expose pas l'article aux pros.
--
-- `catalog_price_history.price_millicents` reste `NOT NULL` : la trace des
-- prix saute la ligne d'un article sans prix pro.
--
-- Retour arrière : `SET NOT NULL`, possible tant qu'aucune ligne n'est `NULL`.
-- Dès qu'un fait portant un prix `null` est ingéré, le retour se fait en avant.

ALTER TABLE "public"."catalog_items" ALTER COLUMN "price_millicents" DROP NOT NULL;
