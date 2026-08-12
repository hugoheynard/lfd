-- Le périmètre staff devient un rôle, et les écarts au rôle deviennent des lignes.
--
-- Voir `documentation/b2b/architecture-acces-staff.md`. Jusqu'ici, `staff_users.scopes`
-- était un tableau d'enum que RIEN ne lisait : le périmètre était saisi, stocké,
-- et sans effet. On le remplace par un rôle (le paquet de permissions vit dans le
-- code) et une table de dérogations (l'écart, lui, doit être imputable).

-- ─────────────────────────────────────────────────────────────────────────────
-- Les types
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TYPE "public"."StaffRole" AS ENUM ('admin', 'commercial', 'comptabilite', 'support', 'dev');
CREATE TYPE "public"."StaffStatus" AS ENUM ('pending', 'invited', 'active', 'suspended');
CREATE TYPE "public"."StaffResource" AS ENUM ('companies', 'orders', 'growth', 'appointments', 'support', 'settings', 'staff', 'tech');
CREATE TYPE "public"."StaffAction" AS ENUM ('read', 'write');
CREATE TYPE "public"."StaffOverrideEffect" AS ENUM ('allow', 'deny');

-- ─────────────────────────────────────────────────────────────────────────────
-- L'annuaire : identité complétée, rôle, état de connexion
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "public"."staff_users"
  ADD COLUMN "phone" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "job_title" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "role" "public"."StaffRole" NOT NULL DEFAULT 'commercial',
  ADD COLUMN "status" "public"."StaffStatus" NOT NULL DEFAULT 'pending';

-- Reprise du périmètre en rôle : le plus fort l'emporte, puisqu'un tableau
-- pouvait en porter plusieurs et qu'un rôle est unique.
UPDATE "public"."staff_users"
  SET "role" = 'admin'
  WHERE 'admin'::"public"."StaffScope" = ANY ("scopes");

UPDATE "public"."staff_users"
  SET "role" = 'comptabilite'
  WHERE NOT ('admin'::"public"."StaffScope" = ANY ("scopes"))
    AND 'comptabilite'::"public"."StaffScope" = ANY ("scopes");

UPDATE "public"."staff_users"
  SET "role" = 'commercial'
  WHERE NOT ('admin'::"public"."StaffScope" = ANY ("scopes"))
    AND NOT ('comptabilite'::"public"."StaffScope" = ANY ("scopes"));

-- Périmètre vide = « aucun accès » dans l'ancien modèle. Le nouveau n'a pas de
-- rôle qui n'accorde rien, et la valeur par défaut (`commercial`) accorderait
-- justement ce que ces lignes n'avaient pas. On les suspend : la migration
-- n'ouvre aucune porte qu'elle ne sait pas justifier, et réactiver est un clic.
UPDATE "public"."staff_users"
  SET "status" = 'suspended'
  WHERE cardinality("scopes") = 0;

ALTER TABLE "public"."staff_users" DROP COLUMN "scopes";
DROP TYPE "public"."StaffScope";

-- ─────────────────────────────────────────────────────────────────────────────
-- Les dérogations : une ligne = un écart au rôle, daté et attribué
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE "public"."staff_permission_overrides" (
  "id" TEXT NOT NULL,
  "staff_user_id" TEXT NOT NULL,
  "resource" "public"."StaffResource" NOT NULL,
  "action" "public"."StaffAction" NOT NULL,
  "effect" "public"."StaffOverrideEffect" NOT NULL,
  "granted_by" TEXT NOT NULL,
  "granted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "staff_permission_overrides_pkey" PRIMARY KEY ("id")
);

-- Un seul écart par permission : deux lignes contradictoires sur le même couple
-- seraient une question sans réponse.
CREATE UNIQUE INDEX "staff_permission_overrides_staff_user_id_resource_action_key"
  ON "public"."staff_permission_overrides" ("staff_user_id", "resource", "action");

ALTER TABLE "public"."staff_permission_overrides"
  ADD CONSTRAINT "staff_permission_overrides_staff_user_id_fkey"
  FOREIGN KEY ("staff_user_id") REFERENCES "public"."staff_users" ("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
