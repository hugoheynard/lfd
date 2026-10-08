-- LA FACTURE DU MOIS, ET LE LOT QUI ENCAISSE DES FACTURES — lot E4
-- (`documentation/facturation/plan-emission-de-la-facture.md`, § 3, § 8.5)
--
-- ADDITIVE : quatre tables neuves, deux colonnes neuves (nullable ou avec
-- défaut), une valeur d'énumération neuve. Aucune ligne existante réécrite,
-- aucune colonne resserrée, aucun droit accordé à un rôle.
--
-- 1. `invoicing_floor` : la mise en service de la facture du mois. Un bon
--    passé AVANT n'est jamais facturé par elle : il garde l'ancien chemin
--    (l'arrêté du lot). Posé au 1er du mois qui SUIT ce déploiement, 00h00
--    à Paris : un mois n'est jamais à moitié facturé, à moitié arrêté.
-- 2. `invoice.payment_means` : le moyen de paiement figé à l'émission
--    (BG-16 : prélèvement SEPA, code 59, et la RUM du mandat effectif) ;
--    NULL = aucun mandat unique au jour de l'émission. Couvert par
--    `invoice_immutable`, qui compare la ligne entière.
-- 3. `invoice_monthly_outcome` : l'issue de la facture du mois PAR PAYEUR —
--    émise (sa facture) ou signalée (le refus, en clair). Une émise ne
--    redevient jamais signalée (déclencheur) : c'est ce qui rend lisible
--    « déjà facturé pour ce mois ».
-- 4. `invoice_autopilot_run` : UNE tentative du passage automatique par
--    (entité, mois), comme `collection_autopilot_run`.
-- 5. `collection_batch_line_invoice` : les factures qu'une ligne de débit
--    encaisse. Une ligne d'avant E4 n'en a aucune (elle a son arrêté).
-- 6. `collection_notice.invoice_numbers` : les numéros que l'avis cite ;
--    vide pour un avis d'avant E4 (il cite son arrêté).
-- 7. `CollectionExclusionReason.invoice_split` : une facture dont les bons
--    tomberaient sur plusieurs mandats — elle ne se prélève pas en morceaux.
--
-- Retour arrière (migration EN AVANT, tant qu'aucune facture du mois n'a
-- été émise en production) : `DROP TABLE` des quatre tables, `DROP COLUMN`
-- des deux colonnes, la fonction `invoice_monthly_outcome_final`. La valeur
-- d'énumération ne se retire pas (Postgres) : elle reste, inutilisée.

SET lock_timeout = '5s';

-- 1. La mise en service.
CREATE TABLE "public"."invoicing_floor" (
    "id"       BOOLEAN        NOT NULL DEFAULT true,
    "floor_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoicing_floor_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invoicing_floor_single_row" CHECK ("id")
);

INSERT INTO "public"."invoicing_floor" ("id", "floor_at")
VALUES (
    true,
    (date_trunc('month', now() AT TIME ZONE 'Europe/Paris') + interval '1 month')
        AT TIME ZONE 'Europe/Paris'
);

-- 2. Le moyen de paiement figé.
ALTER TABLE "public"."invoice" ADD COLUMN "payment_means" JSONB;

-- 3. L'issue par payeur.
CREATE TABLE "public"."invoice_monthly_outcome" (
    "legal_entity_id"  TEXT           NOT NULL,
    "month"            TEXT           NOT NULL,
    "payer_company_id" TEXT           NOT NULL,
    "payer_name"       TEXT           NOT NULL,
    "outcome"          TEXT           NOT NULL,
    "invoice_id"       TEXT,
    "message"          TEXT,
    "unbillable_orders" TEXT[]        NOT NULL DEFAULT ARRAY[]::TEXT[],
    "recorded_at"      TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invoice_monthly_outcome_pkey" PRIMARY KEY ("legal_entity_id", "month", "payer_company_id"),
    CONSTRAINT "invoice_monthly_outcome_month" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "invoice_monthly_outcome_kind" CHECK ("outcome" IN ('issued', 'blocked')),
    -- Émise ⇔ sa facture ; signalée ⇔ son refus en clair.
    CONSTRAINT "invoice_monthly_outcome_issued_has_invoice" CHECK (
        ("outcome" = 'issued') = ("invoice_id" IS NOT NULL)
        AND ("outcome" = 'blocked') = ("message" IS NOT NULL)
    )
);

CREATE UNIQUE INDEX "invoice_monthly_outcome_invoice_id_key"
    ON "public"."invoice_monthly_outcome"("invoice_id");

ALTER TABLE "public"."invoice_monthly_outcome"
    ADD CONSTRAINT "invoice_monthly_outcome_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."invoice_monthly_outcome"
    ADD CONSTRAINT "invoice_monthly_outcome_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Une issue `issued` est définitive : ni supprimée, ni rendue `blocked`.
CREATE FUNCTION "public"."invoice_monthly_outcome_final"() RETURNS trigger AS $$
BEGIN
    IF OLD."outcome" = 'issued' THEN
        RAISE EXCEPTION 'invoice_monthly_outcome_final: % est déjà facturé pour %, sa facture ne se défait pas', OLD."payer_company_id", OLD."month";
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "invoice_monthly_outcome_final"
    BEFORE UPDATE OR DELETE ON "public"."invoice_monthly_outcome"
    FOR EACH ROW EXECUTE FUNCTION "public"."invoice_monthly_outcome_final"();

-- 4. La tentative automatique.
CREATE TABLE "public"."invoice_autopilot_run" (
    "legal_entity_id" TEXT           NOT NULL,
    "month"           TEXT           NOT NULL,
    "ran_at"          TIMESTAMPTZ(3) NOT NULL,
    "outcome"         TEXT           NOT NULL,
    "message"         TEXT,

    CONSTRAINT "invoice_autopilot_run_pkey" PRIMARY KEY ("legal_entity_id", "month"),
    CONSTRAINT "invoice_autopilot_run_month" CHECK ("month" ~ '^\d{4}-(0[1-9]|1[0-2])$'),
    CONSTRAINT "invoice_autopilot_run_outcome" CHECK (
        "outcome" IN ('pending', 'issued', 'nothing_to_invoice', 'not_yet_open', 'failed')
    ),
    CONSTRAINT "invoice_autopilot_run_failure_explained" CHECK (
        "outcome" <> 'failed' OR "message" IS NOT NULL
    )
);

ALTER TABLE "public"."invoice_autopilot_run"
    ADD CONSTRAINT "invoice_autopilot_run_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Les factures d'une ligne de débit.
CREATE TABLE "public"."collection_batch_line_invoice" (
    "batch_id"   TEXT    NOT NULL,
    "line_rank"  INTEGER NOT NULL,
    "invoice_id" TEXT    NOT NULL,

    CONSTRAINT "collection_batch_line_invoice_pkey" PRIMARY KEY ("batch_id", "line_rank", "invoice_id")
);

CREATE INDEX "collection_batch_line_invoice_invoice_id_idx"
    ON "public"."collection_batch_line_invoice"("invoice_id");

ALTER TABLE "public"."collection_batch_line_invoice"
    ADD CONSTRAINT "collection_batch_line_invoice_line_fkey"
    FOREIGN KEY ("batch_id", "line_rank") REFERENCES "public"."collection_batch_line"("batch_id", "rank")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."collection_batch_line_invoice"
    ADD CONSTRAINT "collection_batch_line_invoice_invoice_id_fkey"
    FOREIGN KEY ("invoice_id") REFERENCES "public"."invoice"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- 6. Les numéros que l'avis cite.
ALTER TABLE "public"."collection_notice"
    ADD COLUMN "invoice_numbers" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- 7. Une facture à cheval sur deux mandats.
ALTER TYPE "public"."CollectionExclusionReason" ADD VALUE 'invoice_split';
