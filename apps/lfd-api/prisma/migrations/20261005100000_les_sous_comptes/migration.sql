-- LES SOUS-COMPTES — plan `documentation/b2b/plan-sous-comptes.md`, lot S1 (§2, §2.1, §4, §5).
--
-- ADDITIVE : deux colonnes nullables ou à défaut sur `companies`, une table
-- neuve, une énumération neuve, deux déclencheurs de seconde ligne. Aucune
-- ligne existante modifiée, aucune colonne resserrée, aucun droit accordé à un
-- rôle. `orders.billed_company_id` n'est PAS ici : il appartient au lot S4.
--
-- Retour arrière du SCHÉMA (migration EN AVANT, une fois qu'aucun binaire ne
-- les lit) : `DROP TABLE "company_follows"`, `DROP TYPE "CompanyFollowAspect"`,
-- les deux fonctions de déclencheur, puis `ALTER TABLE "companies" DROP COLUMN
-- "group_without_delivery", DROP COLUMN "parent_company_id"`.

SET lock_timeout = '5s';

-- 1. La structure : le principal d'un sous-compte. Un compte n'est jamais son
--    propre principal.
ALTER TABLE "companies"
    ADD COLUMN "parent_company_id" TEXT,
    ADD COLUMN "group_without_delivery" BOOLEAN NOT NULL DEFAULT false,
    ADD CONSTRAINT "companies_parent_company_id_fkey"
        FOREIGN KEY ("parent_company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "company_not_own_parent"
        CHECK ("parent_company_id" <> "id");

CREATE INDEX "companies_parent_company_id_idx" ON "companies"("parent_company_id");

-- 2. Les aspects suivis, et leurs périodes.
CREATE TYPE "CompanyFollowAspect" AS ENUM ('billing', 'pricing', 'contacts');

CREATE TABLE "company_follows" (
    "company_id" TEXT NOT NULL,
    "parent_id" TEXT NOT NULL,
    "aspect" "CompanyFollowAspect" NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3),

    CONSTRAINT "company_follows_pkey" PRIMARY KEY ("company_id", "aspect", "valid_from"),
    CONSTRAINT "company_follows_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "company_follows_parent_id_fkey"
        FOREIGN KEY ("parent_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    -- Le principal ne se suit pas lui-même (le `CHECK` de la déclinaison).
    CONSTRAINT "company_follows_not_self" CHECK ("parent_id" <> "company_id"),
    -- Une période fermée finit après avoir commencé.
    CONSTRAINT "company_follows_window" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from")
);

CREATE INDEX "company_follows_parent_id_idx" ON "company_follows"("parent_id");

-- Deux périodes d'un même aspect ne se chevauchent jamais : « qui suivait qui
-- le 12 mars » n'a qu'une réponse. `btree_gist` est déjà activée
-- (`20260818140000_engagement_de_volume`) ; la ligne la rend autoportante.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "company_follows"
    ADD CONSTRAINT "company_follows_no_overlap"
    EXCLUDE USING gist (
        "company_id" WITH =,
        "aspect" WITH =,
        tstzrange("valid_from", "valid_to", '[)') WITH &&
    );

-- 3. SECONDE LIGNE — profondeur 1 et pas de cycle (§5).
--
-- La première ligne est le geste : verrou consultatif unique « hiérarchie des
-- comptes », relecture, vérification par l'agrégat. Un déclencheur seul ne
-- suffirait pas : en READ COMMITTED il ne voit pas l'écriture concurrente. Il
-- reste ici contre une écriture faite HORS du geste.
CREATE FUNCTION "company_hierarchy_depth_one"() RETURNS trigger AS $$
BEGIN
    IF NEW."parent_company_id" IS NULL THEN
        RETURN NEW;
    END IF;
    -- Le principal n'est lui-même le sous-compte de personne.
    IF EXISTS (
        SELECT 1 FROM "companies"
        WHERE "id" = NEW."parent_company_id" AND "parent_company_id" IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'company_hierarchy_depth: % est déjà un sous-compte', NEW."parent_company_id";
    END IF;
    -- Un compte qui a des sous-comptes ne devient pas sous-compte (et A→B, B→A
    -- est le cas particulier de cette règle : il n'y a pas de cycle possible).
    IF EXISTS (SELECT 1 FROM "companies" WHERE "parent_company_id" = NEW."id") THEN
        RAISE EXCEPTION 'company_hierarchy_depth: % a déjà des sous-comptes', NEW."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "companies_hierarchy_depth_one"
    BEFORE INSERT OR UPDATE OF "parent_company_id" ON "companies"
    FOR EACH ROW EXECUTE FUNCTION "company_hierarchy_depth_one"();

-- Une période EN COURS suit le principal actuel : « un compte sans parent ne
-- suit rien ». Les périodes closes gardent le principal d'alors.
CREATE FUNCTION "company_follows_current_parent"() RETURNS trigger AS $$
BEGIN
    IF NEW."valid_to" IS NULL AND NOT EXISTS (
        SELECT 1 FROM "companies"
        WHERE "id" = NEW."company_id" AND "parent_company_id" = NEW."parent_id"
    ) THEN
        RAISE EXCEPTION 'company_follows_parent: % ne suit que son principal actuel', NEW."company_id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "company_follows_current_parent"
    BEFORE INSERT OR UPDATE ON "company_follows"
    FOR EACH ROW EXECUTE FUNCTION "company_follows_current_parent"();
