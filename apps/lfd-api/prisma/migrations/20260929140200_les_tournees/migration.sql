-- LES TOURNÉES — composer : répartir, puis ordonner
-- (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 3, C1–C17).
--
-- Purement ADDITIVE : deux tables neuves dans `production` (Q10), leurs index,
-- six déclencheurs de journal de journée. Aucune colonne existante touchée.
--
-- Retour arrière : `DROP TRIGGER` des six déclencheurs, puis `DROP TABLE`
-- `delivery_round_stop` et `delivery_round` — à ne faire qu'avant la première
-- tournée composée en production : après, c'est une composition perdue.

-- Poser un déclencheur attend les transactions en cours sur la table ; la clé
-- étrangère verrouille `delivery_vehicle`. Mieux vaut échouer proprement en
-- 5 s que faire attendre un geste sur la flotte.
SET lock_timeout = '5s';

-- ─── La tournée (C1, C17) ─────────────────────────────────────────────────
CREATE TABLE "production"."delivery_round" (
    "id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "vehicle_id" TEXT NOT NULL,
    "vehicle_name" TEXT NOT NULL,
    "passage" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_round_pkey" PRIMARY KEY ("id")
);

-- Un véhicule fait plusieurs tournées dans la journée (Q13), jamais deux fois
-- le même passage.
CREATE UNIQUE INDEX "delivery_round_service_day_vehicle_id_passage_key"
    ON "production"."delivery_round"("service_day", "vehicle_id", "passage");
CREATE INDEX "delivery_round_vehicle_id_service_day_idx"
    ON "production"."delivery_round"("vehicle_id", "service_day");

-- RESTRICT : un véhicule n'est jamais supprimé (il est retiré, à une date).
ALTER TABLE "production"."delivery_round"
    ADD CONSTRAINT "delivery_round_vehicle_id_fkey"
    FOREIGN KEY ("vehicle_id") REFERENCES "production"."delivery_vehicle"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── L'arrêt (C10, C11, C12) ──────────────────────────────────────────────
-- Écrit par la TOURNÉE seule : `round_id`, `position`, `removed_at`,
-- `closed_at`, et `order_id`, `service_day`, `created_at` à la création.
-- `closed_at` — écrivain : la tournée ; posé au lot 6 par `closeStop`, quand
-- l'exécution rapporte livré ou raté. Nul à ce lot. L'état d'exécution vivra
-- dans une AUTRE table : aucune colonne n'a deux écrivains (C10). `order_id`
-- est opaque : aucune clé étrangère vers `public.orders`, qui appartient au
-- commerce.
CREATE TABLE "production"."delivery_round_stop" (
    "id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "position" INTEGER NOT NULL,
    "removed_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_round_stop_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_round_stop_position_positive" CHECK ("position" > 0)
);

CREATE INDEX "delivery_round_stop_round_id_idx"
    ON "production"."delivery_round_stop"("round_id");
CREATE INDEX "delivery_round_stop_order_id_idx"
    ON "production"."delivery_round_stop"("order_id");

ALTER TABLE "production"."delivery_round_stop"
    ADD CONSTRAINT "delivery_round_stop_round_id_fkey"
    FOREIGN KEY ("round_id") REFERENCES "production"."delivery_round"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- I3 (C12) — une commande est dans AU PLUS UNE tournée vivante, TOUS JOURS
-- CONFONDUS. « Vivant » = ni retiré de sa tournée, ni clos par l'exécution :
-- une livraison ratée (lot 6) libère la commande pour un autre jour sans
-- reconstruire cet index en production. Prisma ne sait pas l'exprimer : il
-- n'apparaît pas dans le schéma.
CREATE UNIQUE INDEX "delivery_round_stop_live_order_key"
    ON "production"."delivery_round_stop"("order_id")
    WHERE "removed_at" IS NULL AND "closed_at" IS NULL;

-- ─── Le journal de journée (C6, D7) ───────────────────────────────────────
-- Les deux tables portent `service_day` : la fonction de
-- `20260928140000_la_version_par_journee` s'applique telle quelle. Une
-- variante par jointure perdrait le jour sur une suppression en cascade.
-- ⚠️ Elles avancent la version de journée du FOURNIL (`production.day_change`)
-- — c'est elle que l'écran de composition suit.
CREATE TRIGGER "delivery_round_day_change_insert"
  AFTER INSERT ON "production"."delivery_round"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_day_change_update"
  AFTER UPDATE ON "production"."delivery_round"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_day_change_delete"
  AFTER DELETE ON "production"."delivery_round"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "delivery_round_stop_day_change_insert"
  AFTER INSERT ON "production"."delivery_round_stop"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_stop_day_change_update"
  AFTER UPDATE ON "production"."delivery_round_stop"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_round_stop_day_change_delete"
  AFTER DELETE ON "production"."delivery_round_stop"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

RESET lock_timeout;
