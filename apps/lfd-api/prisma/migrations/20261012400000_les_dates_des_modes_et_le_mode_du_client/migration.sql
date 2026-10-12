-- LES DATES DES MODES, LE MODE DU CLIENT — lot M1
-- (`documentation/comptabilite/facturation/plan-rythme-de-facturation.md`, §16 et §16.6)
--
-- L'entité fixe les dates de chacun des trois modes (mensuel, deux fois par
-- mois, hebdomadaire) ; chaque payeur choisit un mode. Deux historiques
-- APPEND-ONLY : rien ne s'efface, une clôture passée se relit toujours sous les
-- dates qui étaient en vigueur.
--
-- 1. `billing_mode_dates` — un segment de dates d'un mode, à partir d'une
--    clôture. Forme tenue par `billing_rhythm_is_well_formed` (R2, gardée pour
--    ça). AUCUNE ligne pour un mode = ses dates par défaut (mensuel le 1er,
--    deux fois par mois le 1er et le 16, hebdomadaire le lundi).
-- 2. `payer_billing_mode` — le mode d'un payeur, à partir d'une clôture de son
--    mode d'avant. AUCUNE ligne = mensuel.
--    Aucune ligne n'est semée ici : les défauts sont des défauts de lecture.
-- 3. Un déclencheur par table refuse le DELETE, et tout UPDATE sauf la pose
--    de l'annulation (`cancelled_at` + son auteur), une seule fois.
-- 4. Un index unique partiel par table : deux segments VIVANTS ne prennent
--    pas effet au même instant — la course entre deux gestes simultanés se
--    tranche en base, l'agrégat tenant la règle « un seul à la fois ».
-- 5. SUPPRESSION des colonnes R2 de `legal_entities` (ordre de Hugo,
--    2026-10-12, §16.6) : le rythme unique n'a jamais porté de donnée de
--    production. Leurs deux CHECK partent avec elles ; la fonction de forme
--    reste, réutilisée par 1.
--
-- Aucun droit n'est accordé ici (`b2b_accounting` existe déjà).

CREATE TABLE "public"."billing_mode_dates" (
    "id"                    TEXT           NOT NULL,
    "legal_entity_id"       TEXT           NOT NULL,
    "mode"                  TEXT           NOT NULL,
    "effective_from"        TIMESTAMPTZ(3) NOT NULL,
    "days"                  INTEGER[]      NOT NULL,
    "cancelled_at"          TIMESTAMPTZ(3),
    "cancelled_by_staff_id" TEXT,
    "created_at"            TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id"   TEXT           NOT NULL,

    CONSTRAINT "billing_mode_dates_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "billing_mode_dates_shape"
        CHECK ("public"."billing_rhythm_is_well_formed"("mode", "days")),
    CONSTRAINT "billing_mode_dates_cancellation"
        CHECK (("cancelled_at" IS NULL) = ("cancelled_by_staff_id" IS NULL))
);

ALTER TABLE "public"."billing_mode_dates"
    ADD CONSTRAINT "billing_mode_dates_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "billing_mode_dates_entity_mode_effective_from_idx"
    ON "public"."billing_mode_dates" ("legal_entity_id", "mode", "effective_from");

CREATE UNIQUE INDEX "billing_mode_dates_live_effective_from_key"
    ON "public"."billing_mode_dates" ("legal_entity_id", "mode", "effective_from")
    WHERE "cancelled_at" IS NULL;

CREATE TABLE "public"."payer_billing_mode" (
    "id"                    TEXT           NOT NULL,
    "legal_entity_id"       TEXT           NOT NULL,
    "payer_company_id"      TEXT           NOT NULL,
    "effective_from"        TIMESTAMPTZ(3) NOT NULL,
    "mode"                  TEXT           NOT NULL,
    "cancelled_at"          TIMESTAMPTZ(3),
    "cancelled_by_staff_id" TEXT,
    "created_at"            TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id"   TEXT           NOT NULL,

    CONSTRAINT "payer_billing_mode_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payer_billing_mode_mode"
        CHECK ("mode" IN ('monthly', 'semimonthly', 'weekly')),
    CONSTRAINT "payer_billing_mode_cancellation"
        CHECK (("cancelled_at" IS NULL) = ("cancelled_by_staff_id" IS NULL))
);

ALTER TABLE "public"."payer_billing_mode"
    ADD CONSTRAINT "payer_billing_mode_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- `payer_company_id` est OPAQUE, comme `invoice_monthly_outcome.payer_company_id` :
-- la comptabilité ne tient pas de clé étrangère vers le compte client.

CREATE INDEX "payer_billing_mode_entity_payer_effective_from_idx"
    ON "public"."payer_billing_mode" ("legal_entity_id", "payer_company_id", "effective_from");

CREATE UNIQUE INDEX "payer_billing_mode_live_effective_from_key"
    ON "public"."payer_billing_mode" ("legal_entity_id", "payer_company_id", "effective_from")
    WHERE "cancelled_at" IS NULL;

-- 3. Append-only : seule l'annulation se pose, une fois. Rien ne s'efface.
CREATE FUNCTION "public"."billing_mode_dates_append_only"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'billing_mode_dates_append_only: un segment de dates ne s''efface pas (%), il s''annule', OLD."id";
    END IF;
    IF OLD."cancelled_at" IS NOT NULL
        OR NEW."cancelled_at" IS NULL
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."legal_entity_id" IS DISTINCT FROM OLD."legal_entity_id"
        OR NEW."mode" IS DISTINCT FROM OLD."mode"
        OR NEW."effective_from" IS DISTINCT FROM OLD."effective_from"
        OR NEW."days" IS DISTINCT FROM OLD."days"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
        OR NEW."created_by_staff_id" IS DISTINCT FROM OLD."created_by_staff_id" THEN
        RAISE EXCEPTION 'billing_mode_dates_append_only: le segment % ne se modifie pas, seule son annulation se pose, une fois', OLD."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "billing_mode_dates_append_only"
    BEFORE UPDATE OR DELETE ON "public"."billing_mode_dates"
    FOR EACH ROW EXECUTE FUNCTION "public"."billing_mode_dates_append_only"();

CREATE FUNCTION "public"."payer_billing_mode_append_only"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'payer_billing_mode_append_only: un mode de payeur ne s''efface pas (%), il s''annule', OLD."id";
    END IF;
    IF OLD."cancelled_at" IS NOT NULL
        OR NEW."cancelled_at" IS NULL
        OR NEW."id" IS DISTINCT FROM OLD."id"
        OR NEW."legal_entity_id" IS DISTINCT FROM OLD."legal_entity_id"
        OR NEW."payer_company_id" IS DISTINCT FROM OLD."payer_company_id"
        OR NEW."effective_from" IS DISTINCT FROM OLD."effective_from"
        OR NEW."mode" IS DISTINCT FROM OLD."mode"
        OR NEW."created_at" IS DISTINCT FROM OLD."created_at"
        OR NEW."created_by_staff_id" IS DISTINCT FROM OLD."created_by_staff_id" THEN
        RAISE EXCEPTION 'payer_billing_mode_append_only: le segment % ne se modifie pas, seule son annulation se pose, une fois', OLD."id";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "payer_billing_mode_append_only"
    BEFORE UPDATE OR DELETE ON "public"."payer_billing_mode"
    FOR EACH ROW EXECUTE FUNCTION "public"."payer_billing_mode_append_only"();

-- 5. Les colonnes R2 du rythme unique — ordre de Hugo du 2026-10-12.
ALTER TABLE "public"."legal_entities"
    DROP CONSTRAINT "legal_entities_billing_rhythm_shape",
    DROP CONSTRAINT "legal_entities_next_billing_rhythm_shape";

ALTER TABLE "public"."legal_entities"
    DROP COLUMN "billing_rhythm_kind",
    DROP COLUMN "billing_rhythm_days",
    DROP COLUMN "next_billing_rhythm_kind",
    DROP COLUMN "next_billing_rhythm_days",
    DROP COLUMN "next_billing_rhythm_effective_at";
