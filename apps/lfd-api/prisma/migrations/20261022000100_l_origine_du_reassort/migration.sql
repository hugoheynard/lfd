-- L'origine d'un réassort (lot R1d de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md, Hugo
-- 2026-10-21) : le fournil envoie un réassort À PART de la demande du
-- comptoir, « je t'envoie ça ».
--
-- ADDITIVE : une colonne neuve, NOT NULL avec un défaut (`counter`) que
-- toutes les lignes existantes prennent — elles viennent toutes du comptoir.
-- Deux CHECK neufs, que ces lignes vérifient. Rien n'est retiré ni renommé ;
-- l'index unique partiel des demandes en cours ne change pas : un réassort du
-- fournil naît envoyé (`placed_at` non nul) et n'y entre jamais.
-- Aucun droit n'est accordé.

ALTER TABLE "public"."site_resupply"
  ADD COLUMN "origin" TEXT NOT NULL DEFAULT 'counter';

ALTER TABLE "public"."site_resupply" ADD CONSTRAINT "site_resupply_origin_known" CHECK (
  "origin" IN ('counter', 'bakehouse')
);

-- Le fournil n'a pas de brouillon : son réassort est créé déjà envoyé.
ALTER TABLE "public"."site_resupply" ADD CONSTRAINT "site_resupply_bakehouse_placed" CHECK (
  "origin" <> 'bakehouse' OR "placed_at" IS NOT NULL
);
