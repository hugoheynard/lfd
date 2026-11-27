-- LES OPTIONS DE COMMANDE — lot G1 de
-- `documentation/catalogue/plan-options-de-commande.md` (§ 3.1).
--
-- ADDITIF : trois tables neuves du schéma `pim`, aucune colonne existante
-- touchée. Le groupe d'options (« Tranchage ») et ses choix (« tranché »),
-- puis l'activation d'un groupe sur une fiche, pour toutes ses déclinaisons
-- ou une liste. Aucune colonne d'argent : les options sont gratuites
-- (décision de Hugo du 2026-11-19). Aucune ligne écrite : le référentiel
-- naît vide.
--
-- Ordre de déploiement : cette migration → le code G1. Un fait v18 en vol se
-- lit sans options ; une fiche reçoit ses options à sa prochaine émission.
--
-- Retour arrière : `prisma/rollback/20261127100000_les_options_de_commande.sql`.

SET lock_timeout = '5s';

CREATE TABLE "pim"."option_group" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_group_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "option_group_name_not_blank" CHECK (btrim("name") <> '')
);

CREATE TABLE "pim"."option_choice" (
    "option_group_id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "archived_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "option_choice_pkey" PRIMARY KEY ("option_group_id","key"),
    CONSTRAINT "option_choice_audience_known" CHECK ("audience" IN ('pro', 'public', 'both')),
    CONSTRAINT "option_choice_label_not_blank" CHECK (btrim("label") <> ''),
    CONSTRAINT "option_choice_position_positive" CHECK ("position" >= 0)
);

CREATE TABLE "pim"."product_option_activation" (
    "product_id" TEXT NOT NULL,
    "option_group_id" TEXT NOT NULL,
    "all_variants" BOOLEAN NOT NULL,
    "variant_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "product_option_activation_pkey" PRIMARY KEY ("product_id","option_group_id"),
    -- Toutes les déclinaisons, ou une liste non vide — jamais les deux, jamais aucune.
    CONSTRAINT "product_option_activation_scope" CHECK (
      ("all_variants" AND cardinality(coalesce("variant_ids", ARRAY[]::TEXT[])) = 0)
      OR (NOT "all_variants" AND cardinality(coalesce("variant_ids", ARRAY[]::TEXT[])) > 0)
    )
);

CREATE INDEX "product_option_activation_option_group_id_idx" ON "pim"."product_option_activation"("option_group_id");

ALTER TABLE "pim"."option_choice" ADD CONSTRAINT "option_choice_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "pim"."option_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pim"."product_option_activation" ADD CONSTRAINT "product_option_activation_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "pim"."product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "pim"."product_option_activation" ADD CONSTRAINT "product_option_activation_option_group_id_fkey" FOREIGN KEY ("option_group_id") REFERENCES "pim"."option_group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
