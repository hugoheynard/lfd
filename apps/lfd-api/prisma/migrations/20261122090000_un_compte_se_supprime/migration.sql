-- UN COMPTE SE SUPPRIME — lot A1 du plan
-- `documentation/comptes-client/plan-archiver-un-compte-jamais-servi.md`.
--
-- « Supprimer le compte » est un archivage : rien n'est effacé, le statut ne
-- bouge pas. Quatre colonnes nullables sur `companies` : quand, par qui (id de
-- la fiche staff et nom figé), pourquoi.
--
-- **Additif** : quatre colonnes nullables, sans défaut ni réécriture ; une
-- contrainte que toutes les lignes existantes satisfont (tout est NULL).
--
-- Le déclencheur de l'estampille du principal est refait avec `archived_at`
-- dans son `UPDATE OF` : le mur des lots suivants lit cette colonne, et un
-- principal gardé en mémoire doit tomber quand elle change. Même fonction,
-- même `BEFORE … FOR EACH STATEMENT`, mêmes colonnes qu'avant plus une
-- (`20261105120000_l_estampille_filtree_par_colonnes`) : rien ne se resserre.
--
-- Retour arrière, dans cet ordre :
--   CREATE OR REPLACE TRIGGER "companies_principal_stamp"
--     BEFORE INSERT OR DELETE OR UPDATE OF "id", "status", "parent_company_id"
--     ON "public"."companies"
--     FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();
--   ALTER TABLE "public"."companies" DROP CONSTRAINT "companies_archive_complete";
--   ALTER TABLE "public"."companies" DROP COLUMN "archive_reason";
--   ALTER TABLE "public"."companies" DROP COLUMN "archived_by_name";
--   ALTER TABLE "public"."companies" DROP COLUMN "archived_by_staff_id";
--   ALTER TABLE "public"."companies" DROP COLUMN "archived_at";

-- `companies` est lue à chaque requête : mieux vaut un déploiement qui échoue
-- proprement en 5 s — il se relance — que de la bloquer.
SET lock_timeout = '5s';

ALTER TABLE "public"."companies" ADD COLUMN "archived_at" TIMESTAMP(3);
ALTER TABLE "public"."companies" ADD COLUMN "archived_by_staff_id" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "archived_by_name" TEXT;
ALTER TABLE "public"."companies" ADD COLUMN "archive_reason" TEXT;

-- Une suppression sans instant ou sans motif n'en est pas une : les deux sont
-- nulles ensemble ou posées ensemble, et le motif n'est jamais vide. L'auteur
-- reste nullable, comme celui d'une activation.
ALTER TABLE "public"."companies" ADD CONSTRAINT "companies_archive_complete" CHECK (
  ("archived_at" IS NULL AND "archive_reason" IS NULL)
  OR ("archived_at" IS NOT NULL AND "archive_reason" IS NOT NULL AND btrim("archive_reason") <> '')
);

-- 🔴 `CREATE OR REPLACE TRIGGER` : une seule instruction, atomique — aucune
-- fenêtre où une écriture de `companies` passerait sans déclencheur.
CREATE OR REPLACE TRIGGER "companies_principal_stamp"
  BEFORE INSERT OR DELETE OR UPDATE OF "id", "status", "parent_company_id", "archived_at"
  ON "public"."companies"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."principal_stamp_bump"();
