-- Cause de la suspension : ce qui a coupé l'accès décide de ce qui le rouvre.
-- Une suspension née du retrait de vérification du KBIS se lève d'elle-même à la
-- re-vérification ; une suspension décidée par le staff ne se lève jamais seule.
CREATE TYPE "public"."SuspensionCause" AS ENUM ('staff', 'kbis_revoked');

ALTER TABLE "public"."companies"
  ADD COLUMN "suspension_cause" "public"."SuspensionCause";

-- Les suspensions déjà en base sont, par construction, des décisions humaines :
-- la suspension automatique n'existait pas avant cette migration.
UPDATE "public"."companies" SET "suspension_cause" = 'staff' WHERE "status" = 'suspended';

-- Qui a activé le compte, à quel titre. Nul pour les comptes activés avant la
-- trace : on ne réécrit pas une histoire qu'on n'a pas enregistrée.
ALTER TABLE "public"."companies"
  ADD COLUMN "activated_by_sub"  TEXT,
  ADD COLUMN "activated_by_name" TEXT,
  ADD COLUMN "activated_by_role" TEXT;
