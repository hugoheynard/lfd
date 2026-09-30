-- LA LIVRAISON A SON SCHÉMA — plan `documentation/livraisons/plan-schema-delivery.md`,
-- SD-D1, SD-D2 (déploiement 1 : étendre et basculer), SD-D3.
--
-- Un DÉPLACEMENT, sans réécriture : `ALTER TABLE … SET SCHEMA` ne touche
-- aucune ligne ; index (partiels compris), contraintes, clés étrangères et
-- déclencheurs suivent la table. Aucune clé étrangère ne sort des quatorze
-- tables vers `production` ni `public` (relevé par `vitruve`, 2026-09-30).
-- Aucune séquence ni aucun enum à déplacer (`\dT production.*` vide, et aucune
-- séquence `production.delivery_*` en dev le 2026-09-30).
--
-- Ce qui est AJOUTÉ : le schéma `delivery`, son journal `delivery.day_change`,
-- sa fonction `delivery.record_day_change_by_service_day()`, et quatorze VUES
-- de compatibilité `production.delivery_*`.
--
-- 🔴 LES VUES sont pour l'ANCIEN binaire, qui sert encore quelques secondes
-- entre `migrate deploy` et `wrangler deploy` et interroge
-- `production.delivery_*` (y compris en `FOR UPDATE`). Une vue simple
-- `SELECT *` est modifiable et verrouillable : il écrit à travers elle, et les
-- déclencheurs de la table sous-jacente se déclenchent. UN DÉPLOIEMENT SUIVANT
-- LES SUPPRIME (SD5, `DROP VIEW` ×14) — aucun code du nouveau binaire ne les lit.
--
-- 🔴 LE DIALOGUE EN BASE EST COUPÉ (SD-D3) : les douze déclencheurs des quatre
-- tables de livraison qui portent une journée écrivaient dans le journal du
-- FOURNIL (`production.day_change`). Ils sont reposés, sous les mêmes noms, sur
-- la fonction de la livraison, qui n'écrit que dans `delivery.day_change`.
-- Conséquence voulue : une tournée ne fait plus bouger la version de journée
-- du fournil ; les écrans qui ont besoin des deux composent (SD-D4).
--
-- Retour arrière (SD-D6, migration EN AVANT, `migrate deploy` ne rejoue rien à
-- rebours) : `DROP VIEW` des quatorze vues ; `DROP TRIGGER` des douze
-- déclencheurs ; `ALTER TABLE "delivery".<t> SET SCHEMA "production"` ×14 ;
-- reposer les douze déclencheurs sur `production.record_day_change_by_service_day()` ;
-- `DROP FUNCTION "delivery"."record_day_change_by_service_day"()` ;
-- `DROP TABLE "delivery"."day_change"` ; `DROP SCHEMA "delivery"`. Ne perd que
-- le journal de la livraison accumulé entre-temps — des numéros d'affichage.

-- Déplacer une table et poser un déclencheur attendent les transactions en
-- cours sur elle. Mieux vaut échouer proprement en 5 s — le déploiement se
-- relance — que faire attendre un geste de chargement derrière la migration.
SET lock_timeout = '5s';

CREATE SCHEMA IF NOT EXISTS "delivery";

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. DÉBRANCHER les douze déclencheurs du journal du fournil
-- ─────────────────────────────────────────────────────────────────────────────
-- Avant le déplacement : ils nomment encore la table par son ancien schéma.
DROP TRIGGER "delivery_round_day_change_insert" ON "production"."delivery_round";
DROP TRIGGER "delivery_round_day_change_update" ON "production"."delivery_round";
DROP TRIGGER "delivery_round_day_change_delete" ON "production"."delivery_round";
DROP TRIGGER "delivery_round_stop_day_change_insert" ON "production"."delivery_round_stop";
DROP TRIGGER "delivery_round_stop_day_change_update" ON "production"."delivery_round_stop";
DROP TRIGGER "delivery_round_stop_day_change_delete" ON "production"."delivery_round_stop";
DROP TRIGGER "delivery_stop_execution_day_change_insert" ON "production"."delivery_stop_execution";
DROP TRIGGER "delivery_stop_execution_day_change_update" ON "production"."delivery_stop_execution";
DROP TRIGGER "delivery_stop_execution_day_change_delete" ON "production"."delivery_stop_execution";
DROP TRIGGER "delivery_bin_load_day_change_insert" ON "production"."delivery_bin_load";
DROP TRIGGER "delivery_bin_load_day_change_update" ON "production"."delivery_bin_load";
DROP TRIGGER "delivery_bin_load_day_change_delete" ON "production"."delivery_bin_load";

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. DÉPLACER les quatorze tables
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "production"."delivery_vehicle" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_departure" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_routing_settings" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_round" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_round_stop" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_stop_execution" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_geocode" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_bin_type" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_bin_capacity" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_bin" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_bin_load" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_simulation_scenario" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_purchase_vehicle_candidate" SET SCHEMA "delivery";
ALTER TABLE "production"."delivery_purchase_bin_candidate" SET SCHEMA "delivery";

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE JOURNAL DE LA LIVRAISON — même forme que `production.day_change`
-- ─────────────────────────────────────────────────────────────────────────────
-- En ajout seul ; la version d'une journée est le plus grand `id` du jour
-- (`20260928140000_la_version_par_journee`, D2).
CREATE TABLE IF NOT EXISTS "delivery"."day_change" (
    "id"          BIGSERIAL    NOT NULL,
    "service_day" VARCHAR(10)  NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "day_change_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "day_change_service_day_id_idx"
    ON "delivery"."day_change"("service_day", "id");

-- Qualifiée par SON schéma, et n'en cite aucun autre : la garde D3 de
-- `test/day-change-triggers.e2e-spec.ts` exige schéma de la table = schéma de
-- la fonction = seul schéma cité dans le corps.
CREATE OR REPLACE FUNCTION "delivery"."record_day_change_by_service_day"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "delivery"."day_change" ("service_day")
    SELECT DISTINCT "service_day" FROM new_rows;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "delivery"."day_change" ("service_day")
    SELECT "service_day" FROM new_rows
    UNION
    SELECT "service_day" FROM old_rows;
  ELSE
    INSERT INTO "delivery"."day_change" ("service_day")
    SELECT DISTINCT "service_day" FROM old_rows;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. REBRANCHER les douze déclencheurs, mêmes noms, sur la fonction de la livraison
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TRIGGER "delivery_round_day_change_insert"
  AFTER INSERT ON "delivery"."delivery_round"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_day_change_update"
  AFTER UPDATE ON "delivery"."delivery_round"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_day_change_delete"
  AFTER DELETE ON "delivery"."delivery_round"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();

CREATE TRIGGER "delivery_round_stop_day_change_insert"
  AFTER INSERT ON "delivery"."delivery_round_stop"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_stop_day_change_update"
  AFTER UPDATE ON "delivery"."delivery_round_stop"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_stop_day_change_delete"
  AFTER DELETE ON "delivery"."delivery_round_stop"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();

CREATE TRIGGER "delivery_stop_execution_day_change_insert"
  AFTER INSERT ON "delivery"."delivery_stop_execution"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_stop_execution_day_change_update"
  AFTER UPDATE ON "delivery"."delivery_stop_execution"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_stop_execution_day_change_delete"
  AFTER DELETE ON "delivery"."delivery_stop_execution"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();

CREATE TRIGGER "delivery_bin_load_day_change_insert"
  AFTER INSERT ON "delivery"."delivery_bin_load"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_bin_load_day_change_update"
  AFTER UPDATE ON "delivery"."delivery_bin_load"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_bin_load_day_change_delete"
  AFTER DELETE ON "delivery"."delivery_bin_load"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "delivery"."record_day_change_by_service_day"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. LES VUES DE COMPATIBILITÉ — pour l'ancien binaire, le temps d'un déploiement
-- ─────────────────────────────────────────────────────────────────────────────
-- 🔴 TEMPORAIRES : supprimées par le déploiement suivant (SD5). Aucun `.prisma`
-- ne les déclare, et aucun code du nouveau binaire ne les lit.
CREATE VIEW "production"."delivery_vehicle" AS SELECT * FROM "delivery"."delivery_vehicle";
CREATE VIEW "production"."delivery_departure" AS SELECT * FROM "delivery"."delivery_departure";
CREATE VIEW "production"."delivery_routing_settings" AS SELECT * FROM "delivery"."delivery_routing_settings";
CREATE VIEW "production"."delivery_round" AS SELECT * FROM "delivery"."delivery_round";
CREATE VIEW "production"."delivery_round_stop" AS SELECT * FROM "delivery"."delivery_round_stop";
CREATE VIEW "production"."delivery_stop_execution" AS SELECT * FROM "delivery"."delivery_stop_execution";
CREATE VIEW "production"."delivery_geocode" AS SELECT * FROM "delivery"."delivery_geocode";
CREATE VIEW "production"."delivery_bin_type" AS SELECT * FROM "delivery"."delivery_bin_type";
CREATE VIEW "production"."delivery_bin_capacity" AS SELECT * FROM "delivery"."delivery_bin_capacity";
CREATE VIEW "production"."delivery_bin" AS SELECT * FROM "delivery"."delivery_bin";
CREATE VIEW "production"."delivery_bin_load" AS SELECT * FROM "delivery"."delivery_bin_load";
CREATE VIEW "production"."delivery_simulation_scenario" AS SELECT * FROM "delivery"."delivery_simulation_scenario";
CREATE VIEW "production"."delivery_purchase_vehicle_candidate" AS SELECT * FROM "delivery"."delivery_purchase_vehicle_candidate";
CREATE VIEW "production"."delivery_purchase_bin_candidate" AS SELECT * FROM "delivery"."delivery_purchase_bin_candidate";

RESET lock_timeout;
