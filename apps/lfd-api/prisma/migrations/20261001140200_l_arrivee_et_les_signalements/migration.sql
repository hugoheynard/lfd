-- L'ARRIVÉE, LE DÉPÔT FIGÉ ET LES SIGNALEMENTS — schéma `delivery`
--
-- Plan `documentation/livraisons/plan-a-la-porte.md`, § 3, AP-D5, AP-D6 (lot A).
--
-- 1. `delivery_stop_execution` gagne deux colonnes, écrites par l'exécution
--    seule (C10) — jamais par la tournée :
--    - `deposit_allowed` — « dépôt autorisé » de l'adresse du carnet, FIGÉ au
--      départ. `NOT NULL DEFAULT false` : un arrêt parti avant cette migration
--      n'avait rien figé, et `false` est la seule lecture qui n'autorise rien
--      que le client n'ait dit ; l'ancien binaire, qui part encore quelques
--      secondes pendant le déploiement, écrit au défaut ;
--    - `arrived_at` — « Je suis arrivé », nul tant que non déclaré.
--
-- 2. `delivery_incident` — un problème signalé par le livreur. Un fait : jamais
--    modifié, jamais supprimé. Aucune clé étrangère : ni vers la tournée (un
--    signalement survit à tout ce que la composition fera), ni hors du schéma.
--    Il porte une JOURNÉE (`service_day`, recopiée de la tournée) : trois
--    déclencheurs `day_change` sur la fonction de la livraison (D7, SD-D5),
--    pour que l'écran Tournées voie un signalement arriver.
--
-- Strictement ADDITIVE.
--
-- Retour arrière : `DROP TABLE "delivery"."delivery_incident";` (ses trois
-- déclencheurs partent avec elle) ; `ALTER TABLE "delivery"."delivery_stop_execution"
-- DROP COLUMN "deposit_allowed", DROP COLUMN "arrived_at";` — perd les
-- signalements et les arrivées écrits entre-temps.

-- Poser un déclencheur attend les transactions en cours sur la table ; échouer
-- proprement en 5 s vaut mieux que faire attendre un geste de la porte.
SET lock_timeout = '5s';

ALTER TABLE "delivery"."delivery_stop_execution" ADD COLUMN IF NOT EXISTS "deposit_allowed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "delivery"."delivery_stop_execution" ADD COLUMN IF NOT EXISTS "arrived_at" TIMESTAMP(3);

CREATE TABLE "delivery"."delivery_incident" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "stop_id" TEXT,
    "service_day" VARCHAR(10) NOT NULL,
    "family" VARCHAR(16) NOT NULL,
    "reason" VARCHAR(32) NOT NULL,
    "note" TEXT NOT NULL,
    "photo_key" TEXT,
    "reported_at" TIMESTAMP(3) NOT NULL,
    "reported_by" TEXT NOT NULL,
    "reported_by_name" TEXT NOT NULL,

    CONSTRAINT "delivery_incident_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_incident_family_known"
      CHECK ("family" IN ('doorstep', 'technical', 'road')),
    CONSTRAINT "delivery_incident_note_bounded" CHECK (char_length("note") <= 500),
    CONSTRAINT "delivery_incident_doorstep_has_stop"
      CHECK ("family" <> 'doorstep' OR "stop_id" IS NOT NULL)
);

CREATE INDEX "delivery_incident_round_id_idx" ON "delivery"."delivery_incident"("round_id");
CREATE INDEX "delivery_incident_service_day_idx" ON "delivery"."delivery_incident"("service_day");

CREATE TRIGGER "delivery_incident_day_change_insert"
  AFTER INSERT ON "delivery"."delivery_incident"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_incident_day_change_update"
  AFTER UPDATE ON "delivery"."delivery_incident"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_incident_day_change_delete"
  AFTER DELETE ON "delivery"."delivery_incident"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
