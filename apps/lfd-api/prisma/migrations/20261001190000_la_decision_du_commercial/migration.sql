-- LA DÉCISION DU COMMERCIAL — `delivery.stop_decision`, et le retour d'une
-- commande rapportée (`production.order_departure.returned_at`)
--
-- Retour arrière : `DROP TABLE "delivery"."stop_decision";` (ses trois
-- déclencheurs partent avec elle) ; `ALTER TABLE "production"."order_departure"
-- DROP COLUMN "returned_at";`. Perd les décisions prises entre-temps, et la
-- mémoire des retours : une commande rapportée redevient « partie » pour le
-- contrôle qualité. Les arrêts clos « rapportés » restent clos (la clôture
-- vit sur `delivery_round_stop`, inchangée).
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, § 10 B3, § 10 bis
-- (« La décision a un propriétaire »), LB-Q2, LB-Q5, tranchés par Hugo le
-- 2026-10-01.
--
-- 1. `delivery.stop_decision` — UNE ligne par arrêt, la décision VIVANTE :
--    ouverte par un signalement « à la remise », répondue par un commercial
--    (« Autoriser le dépôt cette fois » / « Rapporter »). Aucune clé
--    étrangère, comme `delivery_incident` : identifiants de la livraison et de
--    la commande opaques. Elle porte une JOURNÉE (`service_day`, recopiée de
--    la tournée) : trois déclencheurs `day_change` sur la fonction de la
--    livraison (D7, SD-D5), pour que « Ma tournée » voie la décision arriver.
--
-- 2. `production.order_departure.returned_at` — la commande « rapportée »
--    est revenue : le contrôle qualité l'accepte de nouveau. Nullable, sans
--    défaut : l'ancien binaire ne la lit ni ne l'écrit. ⚠️ Pendant la fenêtre
--    de déploiement, un départ écrit par l'ancien binaire ne l'efface pas ;
--    aucun retour n'existant avant ce déploiement, il n'y a rien à effacer.
--
-- Strictement ADDITIVE : une table neuve, vide ; une colonne nullable.

-- Poser un déclencheur attend les transactions en cours sur la table ; échouer
-- proprement en 5 s vaut mieux que faire attendre un geste de la porte.
SET lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS "delivery"."stop_decision" (
    "stop_id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "opened_by_incident_id" TEXT NOT NULL,
    "opened_at" TIMESTAMP(3) NOT NULL,
    "outcome" VARCHAR(24),
    "source" VARCHAR(8),
    "decided_at" TIMESTAMP(3),
    "decided_by" TEXT,
    "decided_by_name" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "stop_decision_pkey" PRIMARY KEY ("stop_id"),
    CONSTRAINT "stop_decision_outcome_known"
      CHECK ("outcome" IS NULL OR "outcome" IN ('authorize_deposit', 'bring_back')),
    CONSTRAINT "stop_decision_source_known"
      CHECK ("source" IS NULL OR "source" IN ('staff', 'setting')),
    -- Ouverte : ni source, ni instant, ni auteur. Prise : une source et un
    -- instant ; un auteur et son nom quand c'est un commercial.
    CONSTRAINT "stop_decision_decided_whole"
      CHECK (
        ("outcome" IS NULL AND "source" IS NULL AND "decided_at" IS NULL
          AND "decided_by" IS NULL AND "decided_by_name" IS NULL)
        OR ("outcome" IS NOT NULL AND "source" IS NOT NULL AND "decided_at" IS NOT NULL
          AND ("source" <> 'staff' OR ("decided_by" IS NOT NULL AND "decided_by_name" IS NOT NULL)))
      )
);

CREATE INDEX IF NOT EXISTS "stop_decision_round_id_idx" ON "delivery"."stop_decision"("round_id");
CREATE INDEX IF NOT EXISTS "stop_decision_service_day_idx" ON "delivery"."stop_decision"("service_day");

CREATE TRIGGER "stop_decision_day_change_insert"
  AFTER INSERT ON "delivery"."stop_decision"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "stop_decision_day_change_update"
  AFTER UPDATE ON "delivery"."stop_decision"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "stop_decision_day_change_delete"
  AFTER DELETE ON "delivery"."stop_decision"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();

ALTER TABLE "production"."order_departure" ADD COLUMN IF NOT EXISTS "returned_at" TIMESTAMP(3);
