-- LA VERSION PAR JOURNÉE — plan
-- `documentation/caching-usage/plan-version-par-journee.md`, D1, D2, D3.
--
-- Strictement ADDITIVE : deux tables neuves, quatre fonctions, vingt-et-un
-- déclencheurs (trois par table surveillée). Aucune colonne existante touchée,
-- aucune donnée déplacée. Les binaires en place ne lisent pas ces tables ; ils les ALIMENTENT sans le
-- savoir, puisque le déclencheur tourne dans la base.
--
-- Retour arrière : `DROP TRIGGER` des vingt-et-un déclencheurs, `DROP FUNCTION`
-- des quatre fonctions, `DROP TABLE` des deux journaux. Il ne perd que des numéros
-- d'affichage.
--
-- 🔴 DEUX journaux, un par schéma (D3). Aucune fonction ci-dessous ne lit ni
-- n'écrit hors de son propre schéma : un déclencheur de `production` qui
-- écrirait dans `public` serait la jointure que `lint:cross-schema-join`
-- refuse dans le code, cachée dans une migration.
--
-- Déclencheurs AU NIVEAU DE L'INSTRUCTION, avec tables de transition (D2) : une
-- clôture qui insère trois cents lignes écrit UNE ligne par journée touchée.
-- Une instruction qui ne touche aucune ligne n'écrit rien (tables vides).
-- `TRUNCATE` ne les déclenche pas — les journaux sont vidés avec le reste.

-- 🔴 `orders` est la table la plus écrite de la base, et poser un déclencheur
-- attend que ses transactions en cours finissent, en bloquant les suivantes.
-- Mieux vaut que le déploiement échoue proprement en 5 s — il se relance — que
-- de faire attendre les passations derrière lui (lecteur-de-migrations,
-- 2026-09-28).
SET lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LES JOURNAUX — en ajout seul ; la version est le plus grand `id` du jour
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Pas de compteur `version = version + 1` : il verrouillerait la ligne de la
-- journée jusqu'à la fin de la transaction, et la clôture (longue) ferait
-- attendre chaque coche de fournée du même jour (D2).
CREATE TABLE IF NOT EXISTS "public"."day_change" (
    "id"          BIGSERIAL    NOT NULL,
    "service_day" VARCHAR(10)  NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "day_change_pkey" PRIMARY KEY ("id")
);

-- `max(id) WHERE service_day = $1` : un parcours d'index à rebours.
CREATE INDEX IF NOT EXISTS "day_change_service_day_id_idx"
    ON "public"."day_change"("service_day", "id");

CREATE TABLE IF NOT EXISTS "production"."day_change" (
    "id"          BIGSERIAL    NOT NULL,
    "service_day" VARCHAR(10)  NOT NULL,
    "changed_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),

    CONSTRAINT "day_change_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "day_change_service_day_id_idx"
    ON "production"."day_change"("service_day", "id");

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LE COMMERCE — `orders`, par `requested_delivery_date`
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Ancien ET nouveau jour : une commande déplacée du 3 au 4 fait bouger les
-- deux journées. Une commande sans date ne concerne aucune journée.
--
-- `order_lines` n'est pas surveillée : ses lignes ne s'écrivent que dans le
-- `create` imbriqué de la commande (vérifié le 2026-09-28 — aucun
-- `orderLine.update/create/delete` ni SQL écrit à la main dans `src/`), donc
-- toujours avec une insertion dans `orders`.
CREATE OR REPLACE FUNCTION "public"."orders_record_day_change"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "public"."day_change" ("service_day")
    SELECT DISTINCT to_char("requested_delivery_date", 'YYYY-MM-DD')
      FROM new_rows WHERE "requested_delivery_date" IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "public"."day_change" ("service_day")
    SELECT to_char("requested_delivery_date", 'YYYY-MM-DD')
      FROM new_rows WHERE "requested_delivery_date" IS NOT NULL
    UNION
    SELECT to_char("requested_delivery_date", 'YYYY-MM-DD')
      FROM old_rows WHERE "requested_delivery_date" IS NOT NULL;
  ELSE
    INSERT INTO "public"."day_change" ("service_day")
    SELECT DISTINCT to_char("requested_delivery_date", 'YYYY-MM-DD')
      FROM old_rows WHERE "requested_delivery_date" IS NOT NULL;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Une table de transition ne se déclare que pour UN événement (« transition
-- tables cannot be specified for triggers with more than one event », Postgres
-- 17, essayé le 2026-09-28) : trois déclencheurs par table, une seule fonction.
CREATE TRIGGER "orders_day_change_insert"
  AFTER INSERT ON "public"."orders"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."orders_record_day_change"();
CREATE TRIGGER "orders_day_change_update"
  AFTER UPDATE ON "public"."orders"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."orders_record_day_change"();
CREATE TRIGGER "orders_day_change_delete"
  AFTER DELETE ON "public"."orders"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."orders_record_day_change"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE FOURNIL — toute table du schéma `production` qui porte une journée
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Trois façons de lire le jour, toutes DANS le schéma :
--   · la colonne `service_day` — journée, commande de production, compte,
--     contrôle qualité ;
--   · la commande de production de la ligne (`production_order_id`) ;
--   · le contrôle de la photo (`check_id`).
--
-- Hors surveillance, et chacune avec sa raison (la même liste est tenue par
-- `test/day-change-triggers.e2e-spec.ts`, qui échoue sur toute autre table) :
--   · `order_handover` — un retrait change le statut de la commande, donc
--     `public.orders`, donc le journal du commerce ; son jour n'existe que
--     dans une table d'un autre bloc (D3) ;
--   · `production_container` — un réglage par SKU, sans journée ;
--   · `production_quality_upload` — un dépôt en attente, sans journée ; il
--     n'entre dans une journée qu'en devenant une photo, surveillée ;
--   · `day_change` — le journal lui-même.

CREATE OR REPLACE FUNCTION "production"."record_day_change_by_service_day"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT "service_day" FROM new_rows;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT "service_day" FROM new_rows
    UNION
    SELECT "service_day" FROM old_rows;
  ELSE
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT "service_day" FROM old_rows;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ⚠️ Une ligne supprimée en CASCADE avec sa commande ne retrouve plus son jour
-- (la commande est déjà partie) : c'est le déclencheur de `production_order`
-- qui a noté la journée, dans la même instruction d'origine.
CREATE OR REPLACE FUNCTION "production"."record_day_change_by_production_order"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT o."service_day"
      FROM new_rows r JOIN "production"."production_order" o ON o."id" = r."production_order_id";
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT o."service_day"
      FROM new_rows r JOIN "production"."production_order" o ON o."id" = r."production_order_id"
    UNION
    SELECT o."service_day"
      FROM old_rows r JOIN "production"."production_order" o ON o."id" = r."production_order_id";
  ELSE
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT o."service_day"
      FROM old_rows r JOIN "production"."production_order" o ON o."id" = r."production_order_id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION "production"."record_day_change_by_quality_check"() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT c."service_day"
      FROM new_rows r JOIN "production"."production_quality_check" c ON c."id" = r."check_id";
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO "production"."day_change" ("service_day")
    SELECT c."service_day"
      FROM new_rows r JOIN "production"."production_quality_check" c ON c."id" = r."check_id"
    UNION
    SELECT c."service_day"
      FROM old_rows r JOIN "production"."production_quality_check" c ON c."id" = r."check_id";
  ELSE
    INSERT INTO "production"."day_change" ("service_day")
    SELECT DISTINCT c."service_day"
      FROM old_rows r JOIN "production"."production_quality_check" c ON c."id" = r."check_id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "production_day_day_change_insert"
  AFTER INSERT ON "production"."production_day"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_day_day_change_update"
  AFTER UPDATE ON "production"."production_day"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_day_day_change_delete"
  AFTER DELETE ON "production"."production_day"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "production_order_day_change_insert"
  AFTER INSERT ON "production"."production_order"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_order_day_change_update"
  AFTER UPDATE ON "production"."production_order"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_order_day_change_delete"
  AFTER DELETE ON "production"."production_order"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "production_count_day_change_insert"
  AFTER INSERT ON "production"."production_count"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_count_day_change_update"
  AFTER UPDATE ON "production"."production_count"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_count_day_change_delete"
  AFTER DELETE ON "production"."production_count"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "production_quality_check_day_change_insert"
  AFTER INSERT ON "production"."production_quality_check"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_quality_check_day_change_update"
  AFTER UPDATE ON "production"."production_quality_check"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_quality_check_day_change_delete"
  AFTER DELETE ON "production"."production_quality_check"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "production_order_line_day_change_insert"
  AFTER INSERT ON "production"."production_order_line"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_production_order"();
CREATE TRIGGER "production_order_line_day_change_update"
  AFTER UPDATE ON "production"."production_order_line"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_production_order"();
CREATE TRIGGER "production_order_line_day_change_delete"
  AFTER DELETE ON "production"."production_order_line"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_production_order"();

CREATE TRIGGER "production_quality_photo_day_change_insert"
  AFTER INSERT ON "production"."production_quality_photo"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_quality_check"();
CREATE TRIGGER "production_quality_photo_day_change_update"
  AFTER UPDATE ON "production"."production_quality_photo"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_quality_check"();
CREATE TRIGGER "production_quality_photo_day_change_delete"
  AFTER DELETE ON "production"."production_quality_photo"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_quality_check"();

RESET lock_timeout;
