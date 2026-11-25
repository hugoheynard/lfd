-- ───────────────────────────────────────────────────────────────────────────
-- LE RELIQUAT DE COMMANDE — la table, et le port offert durable.
--
-- Plan documentation/commandes/reliquat/plan-reliquat-de-commande.md, lot B1
-- (§ 2, et § 4 « Durable (décision 14) »). ADDITIVE : la table naît vide, la
-- colonne naît `false` partout, le CHECK et le déclencheur ne refusent rien de
-- ce qui est en base.
--
-- 1. `public.backorder` : ce qui n'est pas parti d'une commande, pour qui, et
--    son sort (`open` → `converted` | `abandoned`, définitif). Un reliquat par
--    commande d'origine (UNIQUE) ; une commande issue d'un reliquat l'est d'un
--    seul (UNIQUE). `converted_order_id` non nul SSI `converted` ;
--    `closed_at` / `closed_by_staff_id` non nuls SSI l'état n'est pas `open`.
--    `company_id` nul pour un particulier ; `company_id`, `buyer_user_id` et
--    `closed_by_staff_id` sont des identifiants recopiés, sans clé étrangère
--    (comme `orders.placed_by_staff_id`). Pas de prix : il se relit sur les
--    lignes de la commande d'origine.
-- 2. `orders.delivery_offered` : le port offert d'une commande issue d'un
--    reliquat (décisions 7, 14 et 16). La base refuse un frais posé avec le
--    drapeau (HT et TTC), et un déclencheur fige la valeur à la passation :
--    l'INSERT passe, un CHANGEMENT est refusé (`IS DISTINCT FROM`, pour qu'un
--    `save()` qui réécrit la même valeur passe).
--
-- Retour arrière, tant qu'aucune ligne de `backorder` n'existe et qu'aucune
-- commande ne porte `delivery_offered = true` :
--   DROP TRIGGER "orders_delivery_offered_frozen" ON "public"."orders";
--   DROP FUNCTION "public"."orders_delivery_offered_frozen"();
--   ALTER TABLE "public"."orders" DROP CONSTRAINT "orders_delivery_offered_waives_fee";
--   ALTER TABLE "public"."orders" DROP COLUMN "delivery_offered";
--   DROP TABLE "public"."backorder";
-- Au-delà, la table et la colonne restent, mortes.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TABLE "public"."backorder" (
    "id" TEXT NOT NULL,
    "origin_order_id" TEXT NOT NULL,
    "company_id" TEXT,
    "buyer_user_id" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "converted_order_id" TEXT,
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_staff_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "backorder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "backorder_state_known"
        CHECK ("state" IN ('open', 'converted', 'abandoned')),
    CONSTRAINT "backorder_lines_array"
        CHECK (jsonb_typeof("lines") = 'array' AND jsonb_array_length("lines") > 0),
    CONSTRAINT "backorder_converted_order_iff_converted"
        CHECK (("converted_order_id" IS NOT NULL) = ("state" = 'converted')),
    CONSTRAINT "backorder_closed_iff_not_open"
        CHECK (("closed_at" IS NOT NULL) = ("state" <> 'open')
           AND ("closed_by_staff_id" IS NOT NULL) = ("state" <> 'open')),
    CONSTRAINT "backorder_not_its_own_origin"
        CHECK ("converted_order_id" IS NULL OR "converted_order_id" <> "origin_order_id")
);

CREATE UNIQUE INDEX "backorder_origin_order_id_key"
    ON "public"."backorder"("origin_order_id");
CREATE UNIQUE INDEX "backorder_converted_order_id_key"
    ON "public"."backorder"("converted_order_id");
CREATE INDEX "backorder_company_id_state_idx"
    ON "public"."backorder"("company_id", "state");
CREATE INDEX "backorder_state_created_at_idx"
    ON "public"."backorder"("state", "created_at");

ALTER TABLE "public"."backorder"
    ADD CONSTRAINT "backorder_origin_order_id_fkey"
        FOREIGN KEY ("origin_order_id") REFERENCES "public"."orders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "backorder_converted_order_id_fkey"
        FOREIGN KEY ("converted_order_id") REFERENCES "public"."orders"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."orders"
    ADD COLUMN "delivery_offered" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_delivery_offered_waives_fee" CHECK (
        NOT "delivery_offered"
        OR ("delivery_fee_cents" = 0 AND COALESCE("delivery_fee_ttc_cents", 0) = 0)
    );

CREATE FUNCTION "public"."orders_delivery_offered_frozen"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."delivery_offered" IS DISTINCT FROM OLD."delivery_offered" THEN
    RAISE EXCEPTION 'Le port offert de la commande % est figé à la passation : il ne se modifie pas.', OLD."id"
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "orders_delivery_offered_frozen"
  BEFORE UPDATE OF "delivery_offered" ON "public"."orders"
  FOR EACH ROW EXECUTE FUNCTION "public"."orders_delivery_offered_frozen"();
