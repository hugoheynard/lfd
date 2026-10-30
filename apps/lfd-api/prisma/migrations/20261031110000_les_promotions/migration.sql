-- LES PROMOTIONS — lot L3 de
-- documentation/pricing/plan-promotions-par-audience-et-acheminement.md
-- (§ 13.3 « Le modèle de données »).
--
-- `public.promotions` (l'agrégat `Promotion`, src/b2b/promotions/) et
-- `public.promotion_scope_rules` (sa portée). Aucun lecteur de prix ne les lit
-- dans ce lot ; la reprise des règles d'étage promotion et des remises de
-- retrait est le lot L4, dans sa propre migration.
--
-- ADDITIVE : deux tables neuves, vides. Rien de retiré, rien de renommé,
-- aucune donnée convertie, aucun droit accordé.
--
-- Les sortes sont du TEXTE tenu par des CHECK, pas des enums : une variante
-- neuve (segment, zone de livraison — prévues, non bâties) élargit un CHECK
-- au lieu d'un `ALTER TYPE`. Elles n'y entrent pas tant qu'elles n'ont pas
-- d'évaluateur : une valeur sans lecteur serait une promesse.
--
-- Pas de contrainte d'exclusion : elle ne sait pas lire les exceptions de
-- portée. Le chevauchement se refuse à la pose (§ 13.2, lot L7).
--
-- Retour arrière du SCHÉMA : `DROP TABLE` des deux tables, tant qu'aucune
-- promotion n'y a été écrite et qu'aucun binaire ne les lit.

SET lock_timeout = '5s';

CREATE TABLE "public"."promotions" (
  "id"                     TEXT        NOT NULL,
  "internal_name"          TEXT        NOT NULL,
  "label_fr"               TEXT        NOT NULL,
  "label_en"               TEXT,
  "label_it"               TEXT,
  "reason"                 TEXT,
  "application_point"      TEXT        NOT NULL,
  "effect_kind"            TEXT        NOT NULL,
  "effect_value"           INTEGER     NOT NULL,
  "own_floor_mode"         TEXT,
  "own_floor_value"        INTEGER,
  "stacks_over_mercuriale" BOOLEAN     NOT NULL DEFAULT false,
  "valid_from"             TIMESTAMPTZ(3) NOT NULL,
  "valid_to"               TIMESTAMPTZ(3),
  "paused_at"              TIMESTAMPTZ(3),
  "paused_by"              TEXT,
  "archived_at"            TIMESTAMPTZ(3),
  "archived_by"            TEXT,
  "archive_reason"         TEXT,
  "audience_kind"          TEXT        NOT NULL,
  "audience_company_id"    TEXT,
  "fulfillment_kind"       TEXT        NOT NULL,
  "fulfillment_pickup_id"  TEXT,
  "scope_mode"             TEXT        NOT NULL,
  "conditions"             JSONB       NOT NULL DEFAULT '[]',
  "origin"                 JSONB,
  "legacy_source"          TEXT,
  "created_by"             TEXT        NOT NULL,
  "created_at"             TIMESTAMPTZ(3) NOT NULL,

  CONSTRAINT "promotions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotions_internal_name_not_blank" CHECK (btrim("internal_name") <> ''),
  CONSTRAINT "promotions_label_fr_not_blank" CHECK (btrim("label_fr") <> ''),
  CONSTRAINT "promotions_application_point_known"
    CHECK ("application_point" IN ('line', 'basket')),
  -- Le point d'application suit l'acheminement : sans critère, la ligne ;
  -- avec, le panier (§ 13.2).
  CONSTRAINT "promotions_point_follows_fulfillment"
    CHECK (("application_point" = 'basket') = ("fulfillment_kind" <> 'any')),
  CONSTRAINT "promotions_effect_fits_point" CHECK (
    ("application_point" = 'line'
      AND "effect_kind" IN ('percent_off', 'unit_amount_off', 'fixed_unit_price'))
    OR ("application_point" = 'basket'
      AND "effect_kind" IN ('percent_off', 'basket_amount_off'))
  ),
  CONSTRAINT "promotions_effect_value_in_range" CHECK (
    ("effect_kind" = 'percent_off' AND "effect_value" BETWEEN 1 AND 10000)
    OR ("effect_kind" = 'fixed_unit_price' AND "effect_value" >= 0)
    OR ("effect_kind" IN ('unit_amount_off', 'basket_amount_off') AND "effect_value" > 0)
  ),
  CONSTRAINT "promotions_own_floor_whole"
    CHECK (("own_floor_mode" IS NULL) = ("own_floor_value" IS NULL)),
  CONSTRAINT "promotions_own_floor_known"
    CHECK ("own_floor_mode" IS NULL OR "own_floor_mode" IN ('percent', 'amount')),
  CONSTRAINT "promotions_own_floor_on_line"
    CHECK ("own_floor_mode" IS NULL OR "application_point" = 'line'),
  CONSTRAINT "promotions_stacking_on_line"
    CHECK (NOT "stacks_over_mercuriale" OR "application_point" = 'line'),
  CONSTRAINT "promotions_window_forward"
    CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from"),
  CONSTRAINT "promotions_pause_whole"
    CHECK (("paused_at" IS NULL) = ("paused_by" IS NULL)),
  CONSTRAINT "promotions_archive_whole" CHECK (
    ("archived_at" IS NULL AND "archived_by" IS NULL AND "archive_reason" IS NULL)
    OR ("archived_at" IS NOT NULL AND "archived_by" IS NOT NULL AND "archive_reason" IS NOT NULL)
  ),
  CONSTRAINT "promotions_audience_known" CHECK ("audience_kind" IN (
    'everyone', 'individuals', 'individuals_guest', 'individuals_registered',
    'pros', 'pros_active', 'pros_pending', 'company', 'company_and_sites',
    'everyone_but_active_pros'
  )),
  CONSTRAINT "promotions_audience_company"
    CHECK (("audience_company_id" IS NOT NULL)
      = ("audience_kind" IN ('company', 'company_and_sites'))),
  CONSTRAINT "promotions_fulfillment_known"
    CHECK ("fulfillment_kind" IN ('any', 'pickup', 'pickup_point', 'delivery')),
  CONSTRAINT "promotions_fulfillment_pickup"
    CHECK (("fulfillment_pickup_id" IS NOT NULL) = ("fulfillment_kind" = 'pickup_point')),
  CONSTRAINT "promotions_scope_mode_known" CHECK ("scope_mode" IN ('all_except', 'only')),
  CONSTRAINT "promotions_conditions_list" CHECK (jsonb_typeof("conditions") = 'array')
);

CREATE UNIQUE INDEX "promotions_legacy_source_key" ON "public"."promotions"("legacy_source");
CREATE INDEX "promotions_archived_at_idx" ON "public"."promotions"("archived_at");
CREATE INDEX "promotions_application_point_archived_at_idx"
  ON "public"."promotions"("application_point", "archived_at");
CREATE INDEX "promotions_audience_company_id_idx" ON "public"."promotions"("audience_company_id");
CREATE INDEX "promotions_fulfillment_pickup_id_idx"
  ON "public"."promotions"("fulfillment_pickup_id");

CREATE TABLE "public"."promotion_scope_rules" (
  "id"           TEXT    NOT NULL,
  "promotion_id" TEXT    NOT NULL,
  "target"       TEXT    NOT NULL,
  "target_id"    TEXT    NOT NULL,
  "target_rank"  INTEGER,
  "eligible"     BOOLEAN NOT NULL,

  CONSTRAINT "promotion_scope_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "promotion_scope_rules_target_known"
    CHECK ("target" IN ('category', 'product', 'variant')),
  -- Seule une déclinaison reprise d'une portée produit porte un rang (§ 13.3).
  CONSTRAINT "promotion_scope_rules_rank_on_variant"
    CHECK ("target_rank" IS NULL OR ("target" = 'variant' AND "target_rank" = 2))
);

CREATE UNIQUE INDEX "promotion_scope_rules_promotion_id_target_target_id_key"
  ON "public"."promotion_scope_rules"("promotion_id", "target", "target_id");

ALTER TABLE "public"."promotion_scope_rules"
  ADD CONSTRAINT "promotion_scope_rules_promotion_id_fkey"
  FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
