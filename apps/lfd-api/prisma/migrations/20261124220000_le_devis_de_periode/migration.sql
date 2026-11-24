-- LE DEVIS DE PÉRIODE — un payeur public qui donne son numéro d'engagement
-- sur le devis (documentation/comptabilite/facturation/plan-clients-publics-chorus.md,
-- § 6 sexies, QD3 et v5).
--
-- ADDITIVE : trois tables neuves, aucune ligne existante lue ni réécrite. Les
-- binaires en place ne les lisent ni ne les écrivent.
--
-- · `period_quote` : un devis, une version. `mandate_id` et `service_code`
--   valent `''` sans mandat ni code — jamais NULL, pour que l'unicité du devis
--   vivant ne soit pas trouée par NULL (la forme de `invoice_monthly_outcome`).
--   État `awaiting` | `invoiced` | `superseded` ; `invoice_id` posé ⇔ `invoiced`.
--   Un seul devis non remplacé par (entité, payeur, mandat, code service,
--   clôture) : index unique PARTIEL, que Prisma ne sait pas décrire.
-- · `period_quote_order` : les commandes d'un devis. `quote_state` est la copie
--   de l'état du devis, tenue par la base : clé étrangère composite
--   (`quote_id`, `quote_state`) → `period_quote` (`id`, `state`) ON UPDATE
--   CASCADE. Une commande n'est que dans UN devis `awaiting` : index unique
--   PARTIEL sur `order_id`.
-- · `period_quote_counter` : le dernier rang par (entité, étiquette de la
--   période `AAAAMMJJ`). Numéro `D-<AAAAMMJJ>-<rang>` — un devis n'est pas une
--   pièce comptable, il ne prend pas un numéro de facture.
--
-- Un devis ne se supprime pas, et un état final (`invoiced`, `superseded`)
-- ne se quitte pas : déclencheurs `period_quote_final` et
-- `period_quote_order_kept`.
--
-- Retour arrière : `prisma/rollback/20261124220000_le_devis_de_periode.sql`.
SET lock_timeout = '5s';

CREATE TABLE "public"."period_quote" (
    "id"                TEXT           NOT NULL,
    "number"            TEXT           NOT NULL,
    "version"           INTEGER        NOT NULL,
    "legal_entity_id"   TEXT           NOT NULL,
    "payer_company_id"  TEXT           NOT NULL,
    "payer_name"        TEXT           NOT NULL,
    "mandate_id"        TEXT           NOT NULL DEFAULT '',
    "service_code"      TEXT           NOT NULL DEFAULT '',
    "period_starts_at"  TIMESTAMPTZ(3) NOT NULL,
    "period_closes_at"  TIMESTAMPTZ(3) NOT NULL,
    "state"             TEXT           NOT NULL,
    "fingerprint"       TEXT           NOT NULL,
    "total_ttc_cents"   INTEGER        NOT NULL,
    "invoice_id"        TEXT,
    "created_at"        TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "period_quote_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "period_quote_state_known"
        CHECK ("state" IN ('awaiting', 'invoiced', 'superseded')),
    -- Facturé ⇔ sa facture.
    CONSTRAINT "period_quote_invoiced_has_invoice"
        CHECK (("invoice_id" IS NOT NULL) = ("state" = 'invoiced')),
    CONSTRAINT "period_quote_version_positive" CHECK ("version" >= 1),
    CONSTRAINT "period_quote_number_form" CHECK ("number" ~ '^D-\d{8}-[1-9]\d*$'),
    CONSTRAINT "period_quote_fingerprint_form" CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "period_quote_period_order" CHECK ("period_starts_at" < "period_closes_at")
);

-- La cible de la clé étrangère composite de `period_quote_order`.
CREATE UNIQUE INDEX "period_quote_id_state_key"
    ON "public"."period_quote"("id", "state");

CREATE UNIQUE INDEX "period_quote_number_version_key"
    ON "public"."period_quote"("number", "version");

CREATE UNIQUE INDEX "period_quote_invoice_id_key"
    ON "public"."period_quote"("invoice_id");

-- Un seul devis vivant (en attente ou facturé) par groupe de facture et par clôture.
CREATE UNIQUE INDEX "period_quote_live_once"
    ON "public"."period_quote"(
        "legal_entity_id", "payer_company_id", "mandate_id", "service_code", "period_closes_at"
    )
    WHERE "state" <> 'superseded';

ALTER TABLE "public"."period_quote"
    ADD CONSTRAINT "period_quote_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."period_quote"
    ADD CONSTRAINT "period_quote_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."period_quote_order" (
    "quote_id"    TEXT NOT NULL,
    "order_id"    TEXT NOT NULL,
    "quote_state" TEXT NOT NULL,

    CONSTRAINT "period_quote_order_pkey" PRIMARY KEY ("quote_id", "order_id")
);

ALTER TABLE "public"."period_quote_order"
    ADD CONSTRAINT "period_quote_order_quote_id_quote_state_fkey"
    FOREIGN KEY ("quote_id", "quote_state") REFERENCES "public"."period_quote"("id", "state")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une commande n'est que dans UN devis en attente.
CREATE UNIQUE INDEX "period_quote_order_awaiting_once"
    ON "public"."period_quote_order"("order_id")
    WHERE "quote_state" = 'awaiting';

CREATE TABLE "public"."period_quote_counter" (
    "legal_entity_id" TEXT    NOT NULL,
    "period_tag"      TEXT    NOT NULL,
    "last_rank"       INTEGER NOT NULL,

    CONSTRAINT "period_quote_counter_pkey" PRIMARY KEY ("legal_entity_id", "period_tag"),
    CONSTRAINT "period_quote_counter_tag_form" CHECK ("period_tag" ~ '^\d{8}$'),
    CONSTRAINT "period_quote_counter_rank_positive" CHECK ("last_rank" >= 1)
);

ALTER TABLE "public"."period_quote_counter"
    ADD CONSTRAINT "period_quote_counter_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Un devis ne se supprime pas ; un état final ne se quitte pas.
CREATE FUNCTION "public"."period_quote_final"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'period_quote_final: le devis % ne se supprime pas', OLD."id";
    END IF;
    IF OLD."state" <> 'awaiting' AND NEW."state" IS DISTINCT FROM OLD."state" THEN
        RAISE EXCEPTION 'period_quote_final: le devis % est %, cet état ne se quitte pas', OLD."id", OLD."state";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "period_quote_final"
    BEFORE UPDATE OR DELETE ON "public"."period_quote"
    FOR EACH ROW EXECUTE FUNCTION "public"."period_quote_final"();

CREATE FUNCTION "public"."period_quote_order_kept"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'period_quote_order_kept: la commande % du devis % ne se retire pas', OLD."order_id", OLD."quote_id";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "period_quote_order_kept"
    BEFORE DELETE ON "public"."period_quote_order"
    FOR EACH ROW EXECUTE FUNCTION "public"."period_quote_order_kept"();

-- Le compteur ne recule pas et ne se supprime pas.
CREATE FUNCTION "public"."period_quote_counter_monotonic"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'period_quote_counter_monotonic: le compteur des devis ne se supprime pas';
    END IF;
    IF NEW."last_rank" < OLD."last_rank" THEN
        RAISE EXCEPTION 'period_quote_counter_monotonic: le rang % ne recule pas à %', OLD."last_rank", NEW."last_rank";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "period_quote_counter_monotonic"
    BEFORE UPDATE OR DELETE ON "public"."period_quote_counter"
    FOR EACH ROW EXECUTE FUNCTION "public"."period_quote_counter_monotonic"();
