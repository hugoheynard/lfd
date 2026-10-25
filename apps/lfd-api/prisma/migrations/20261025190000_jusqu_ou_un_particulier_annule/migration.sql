-- Plan A1, lot A1.1 (documentation/commandes/annulation/plan-a1-retirer-une-commande-inscrite.md) :
-- jusqu'où un particulier peut annuler. Additive : un type et une colonne
-- avec défaut, la ligne existante prend la règle d'avant (`production_plan`).
-- Valeurs irréversibles dès la première ligne écrite ; `handover` écarté par Hugo (Q2).

CREATE TYPE "public"."customer_cancellation_stage" AS ENUM ('production_plan', 'ready');

ALTER TABLE "public"."customer_cancellation_settings"
  ADD COLUMN "b2c_cancellable_until" "public"."customer_cancellation_stage" NOT NULL DEFAULT 'production_plan';
