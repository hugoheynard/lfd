-- LES SACS, LEUR CHARGEMENT, ET LE DÉPART D'UNE TOURNÉE
-- (`documentation/livraisons/plan-preparation-de-tournee.md`, lot 4, v4 :
-- L4-C16 à L4-C21 ; L4-C4 et le « snapshot au départ »).
--
-- Purement ADDITIVE : une colonne NULLABLE sur `delivery_round`, trois tables
-- neuves dans `production`, leurs index, six déclencheurs de journal de
-- journée. Aucune colonne existante touchée, aucune donnée réécrite.
--
-- Retour arrière : `DROP TRIGGER` des six déclencheurs, `DROP TABLE`
-- `delivery_stop_execution`, `delivery_bag_load`, `delivery_bag`, puis
-- `ALTER TABLE "production"."delivery_round" DROP COLUMN "departed_at"` — à ne
-- faire qu'avant le premier sac déclaré en production : après, ce sont des
-- chargements et des départs perdus.

-- Poser un déclencheur attend les transactions en cours sur la table ; les clés
-- étrangères verrouillent `delivery_round_stop`. Mieux vaut échouer proprement
-- en 5 s que faire attendre un geste de composition.
SET lock_timeout = '5s';

-- ─── Le départ (L4-C4) ─────────────────────────────────────────────────────
-- Écrivain : la tournée. Nul tant qu'elle est au dépôt.
ALTER TABLE "production"."delivery_round" ADD COLUMN "departed_at" TIMESTAMP(3);

-- ─── Le sac (L4-C16, L4-C18, L4-C20) ───────────────────────────────────────
-- Il appartient à la COMMANDE. Aucune journée : pas de déclencheur (exception
-- écrite dans `test/day-change-triggers.e2e-spec.ts`). `order_id` est opaque :
-- aucune clé étrangère vers `public.orders`, qui appartient au commerce.
CREATE TABLE "production"."delivery_bag" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "code" VARCHAR(6) NOT NULL,
    "voided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_bag_pkey" PRIMARY KEY ("id"),
    -- Crockford base 32 : ni I, ni L, ni O, ni U.
    CONSTRAINT "delivery_bag_code_crockford" CHECK ("code" ~ '^[0-9A-HJKMNP-TV-Z]{6}$')
);

-- Unique sur TOUS les sacs, annulés compris : un code tapé ne désigne jamais
-- deux sacs, même un vieux.
CREATE UNIQUE INDEX "delivery_bag_code_key" ON "production"."delivery_bag"("code");
CREATE INDEX "delivery_bag_order_id_idx" ON "production"."delivery_bag"("order_id");

-- ─── Le chargement (L4-C18) ────────────────────────────────────────────────
-- Il appartient à l'ARRÊT. Écrit par l'exécution seule (C10). Décharger remet
-- les trois colonnes `loaded_*` à nul ensemble : la ligne reste.
CREATE TABLE "production"."delivery_bag_load" (
    "id" TEXT NOT NULL,
    "stop_id" TEXT NOT NULL,
    "bag_id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "loaded_at" TIMESTAMP(3),
    "loaded_by" TEXT,
    "loaded_via" VARCHAR(8),
    "created_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_bag_load_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "delivery_bag_load_via" CHECK ("loaded_via" IN ('scan', 'code')),
    -- Chargé, ou pas : jamais un chargement sans auteur ni sans moyen.
    CONSTRAINT "delivery_bag_load_all_or_nothing" CHECK (
        ("loaded_at" IS NULL AND "loaded_by" IS NULL AND "loaded_via" IS NULL)
        OR ("loaded_at" IS NOT NULL AND "loaded_by" IS NOT NULL AND "loaded_via" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "delivery_bag_load_stop_id_bag_id_key"
    ON "production"."delivery_bag_load"("stop_id", "bag_id");
CREATE INDEX "delivery_bag_load_bag_id_idx" ON "production"."delivery_bag_load"("bag_id");

ALTER TABLE "production"."delivery_bag_load"
    ADD CONSTRAINT "delivery_bag_load_stop_id_fkey"
    FOREIGN KEY ("stop_id") REFERENCES "production"."delivery_round_stop"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "production"."delivery_bag_load"
    ADD CONSTRAINT "delivery_bag_load_bag_id_fkey"
    FOREIGN KEY ("bag_id") REFERENCES "production"."delivery_bag"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Ce que verra le livreur, figé au départ (snapshot au départ) ──────────
-- Écrit par l'exécution, dans la transaction de « Partir ». Aucun montant.
CREATE TABLE "production"."delivery_stop_execution" (
    "stop_id" TEXT NOT NULL,
    "round_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "service_day" VARCHAR(10) NOT NULL,
    "departed_at" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "customer_label" TEXT NOT NULL,
    "address" JSONB,
    "contact" JSONB,
    "delivery_window" JSONB,
    "signature_required" BOOLEAN NOT NULL,
    "note" TEXT NOT NULL,
    -- La note livreurs de l'ADRESSE du carnet, lue au départ ; nulle sans
    -- adresse reliée. La procédure (étapes, photos) n'est PAS figée : limite
    -- assumée, le lot 6 la lit en direct.
    "address_note" TEXT,

    CONSTRAINT "delivery_stop_execution_pkey" PRIMARY KEY ("stop_id")
);

CREATE INDEX "delivery_stop_execution_round_id_idx"
    ON "production"."delivery_stop_execution"("round_id");

ALTER TABLE "production"."delivery_stop_execution"
    ADD CONSTRAINT "delivery_stop_execution_stop_id_fkey"
    FOREIGN KEY ("stop_id") REFERENCES "production"."delivery_round_stop"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Le journal de journée (D7) ────────────────────────────────────────────
-- Les deux tables portent `service_day`, recopié de l'arrêt : la fonction de
-- `20260928140000_la_version_par_journee` s'applique telle quelle.
-- ⚠️ Chaque scan fait avancer `production.day_change` (plan, L4-C15) : à
-- mesurer au premier essai réel.
CREATE TRIGGER "delivery_bag_load_day_change_insert"
  AFTER INSERT ON "production"."delivery_bag_load"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_bag_load_day_change_update"
  AFTER UPDATE ON "production"."delivery_bag_load"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_bag_load_day_change_delete"
  AFTER DELETE ON "production"."delivery_bag_load"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

CREATE TRIGGER "delivery_stop_execution_day_change_insert"
  AFTER INSERT ON "production"."delivery_stop_execution"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_stop_execution_day_change_update"
  AFTER UPDATE ON "production"."delivery_stop_execution"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "delivery_stop_execution_day_change_delete"
  AFTER DELETE ON "production"."delivery_stop_execution"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

RESET lock_timeout;
