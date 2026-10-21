-- La demande de réassort en cours, enregistrée (lot R1c de
-- documentation/reassort-boutiques/plan-reapprovisionnement.md, Hugo
-- 2026-10-21) : le brouillon de `SiteResupply` se persiste, pour qu'un
-- rechargement ou un autre poste ne le perde plus.
--
-- ADDITIVE : les quatre colonnes du geste « Envoyer » deviennent nullables
-- (un brouillon n'a pas été envoyé) — un relâchement, jamais un resserrement ;
-- toutes les lignes existantes sont des réassorts envoyés et les vérifient.
-- Deux CHECK et un index unique partiel neufs. Rien n'est retiré ni renommé.
-- Aucun droit n'est accordé.

ALTER TABLE "public"."site_resupply"
  ALTER COLUMN "placed_at" DROP NOT NULL,
  ALTER COLUMN "placed_by_staff_id" DROP NOT NULL,
  ALTER COLUMN "placed_by_name" DROP NOT NULL,
  ALTER COLUMN "placed_by_role" DROP NOT NULL;

-- Un envoi est entier : l'instant et l'auteur ensemble, ou rien (brouillon).
ALTER TABLE "public"."site_resupply" ADD CONSTRAINT "site_resupply_placement_whole" CHECK (
  ("placed_at" IS NULL AND "placed_by_staff_id" IS NULL
    AND "placed_by_name" IS NULL AND "placed_by_role" IS NULL)
  OR ("placed_at" IS NOT NULL AND "placed_by_staff_id" IS NOT NULL
    AND "placed_by_name" IS NOT NULL AND "placed_by_role" IS NOT NULL)
);

-- Seul un réassort envoyé s'annule.
ALTER TABLE "public"."site_resupply" ADD CONSTRAINT "site_resupply_cancelled_after_placed" CHECK (
  "cancelled_at" IS NULL OR "placed_at" IS NOT NULL
);

-- Une seule demande en cours par (point, visée, journée) : deux postes qui
-- ouvrent la même en même temps, le second est refusé (409) plutôt que
-- d'ouvrir un doublon.
CREATE UNIQUE INDEX "site_resupply_open_draft_key"
  ON "public"."site_resupply"("site_id", "target", "service_day")
  WHERE "placed_at" IS NULL;
