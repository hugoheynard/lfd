-- Le registre des échéances des paniers récurrents, et la borne basse du
-- planificateur (documentation/commandes/paniers-recurrents/plan-planificateur.md,
-- lot R2).
--
-- ADDITIVE : une colonne nullable sur `subscriptions` et une table neuve.
-- Aucune ligne existante n'est réécrite. Retour arrière : supprimer la table
-- et la colonne, qu'aucun code d'avant ce lot ne lit.

ALTER TABLE "public"."subscriptions" ADD COLUMN "armed_from" DATE;

CREATE TABLE "public"."subscription_occurrence_runs" (
  "id"              TEXT PRIMARY KEY,
  "subscription_id" TEXT NOT NULL,
  "occurrence_date" DATE NOT NULL,
  "outcome"         TEXT NOT NULL,
  "order_id"        TEXT,
  "cause"           TEXT,
  "reason"          TEXT,
  "recorded_at"     TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "subscription_occurrence_runs_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,
  -- Une commande générée porte sa commande et aucune cause ; un refus ou une
  -- échéance manquée portent leur cause et leur phrase, jamais de commande.
  CONSTRAINT "subscription_occurrence_runs_outcome_shape" CHECK (
    ("outcome" = 'generated' AND "order_id" IS NOT NULL AND "cause" IS NULL AND "reason" IS NULL)
    OR ("outcome" IN ('refused', 'missed_deadline')
        AND "order_id" IS NULL AND "cause" IS NOT NULL AND "reason" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "subscription_occurrence_runs_subscription_id_occurrence_date_key"
  ON "public"."subscription_occurrence_runs"("subscription_id", "occurrence_date");
