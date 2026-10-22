-- LE PRÉLÈVEMENT D'ESSAI ET NOS ÉTABLISSEMENTS (Hugo, 2026-10-22)
--
-- Plan : documentation/comptabilite/prelevement/plan-prelevement-d-essai.md
-- (§4 corrigé par vitruve, §6 décisions).
--
-- `public.own_establishment` : les sociétés clientes déclarées « à nous »
-- (Q1). Pas de ligne = pas à nous (faux par défaut). Un retrait garde la
-- ligne, avec son instant et son auteur.
--
-- `public.collection_test` : un essai = UN débit, son fichier `pain.008`
-- gardé (il porte l'IBAN du débiteur, comme `collection_batch.xml` — au
-- registre RGPD), sa trace, le retour éventuel de la banque et le geste
-- « Marqué remboursé » (Q4). Aucune clé étrangère : la société, le mandat et
-- l'entité sont des identifiants opaques, comme dans les lignes de lot.
--
-- 🔴 Aucune facture, aucun bon, aucun lot, aucun état d'encaissement n'est
-- touché : ces deux tables sont neuves et rien d'autre n'est modifié.
--
-- ADDITIVE : deux tables neuves, vides. Aucun droit accordé.
--
-- Retour arrière du SCHÉMA : `DROP TABLE` des deux tables, une fois qu'aucun
-- binaire ne les lit (leurs lignes sont des traces : les exporter avant).

SET lock_timeout = '5s';

CREATE TABLE "public"."own_establishment" (
    "company_id" TEXT NOT NULL,
    "declared_at" TIMESTAMPTZ(3) NOT NULL,
    "declared_by_staff_id" TEXT NOT NULL,
    "withdrawn_at" TIMESTAMPTZ(3),
    "withdrawn_by_staff_id" TEXT,

    CONSTRAINT "own_establishment_pkey" PRIMARY KEY ("company_id"),
    -- Un retrait porte son instant ET son auteur, ou ni l'un ni l'autre.
    CONSTRAINT "own_establishment_withdrawal_whole"
        CHECK (("withdrawn_at" IS NULL) = ("withdrawn_by_staff_id" IS NULL))
);

CREATE TABLE "public"."collection_test" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "debtor_company_id" TEXT NOT NULL,
    "debtor_name" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "mandate_reference" TEXT NOT NULL,
    "scheme" "public"."SepaScheme" NOT NULL,
    "sequence" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "requested_collection_day" DATE NOT NULL,
    "remittance" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "end_to_end_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "return_kind" "public"."CollectionReturnKind",
    "return_reason_code" TEXT,
    "return_reason_label" TEXT,
    "returned_on" DATE,
    "return_amount_cents" INTEGER,
    "return_source" "public"."CollectionReturnSource",
    "return_recorded_at" TIMESTAMPTZ(3),
    "return_recorded_by_staff_id" TEXT,
    "refunded_on" DATE,
    "refund_recorded_at" TIMESTAMPTZ(3),
    "refund_recorded_by_staff_id" TEXT,

    CONSTRAINT "collection_test_pkey" PRIMARY KEY ("id"),
    -- Le plafond de l'agrégat (`MAX_COLLECTION_TEST_CENTS`, 1 €), tenu aussi en base.
    CONSTRAINT "collection_test_amount_range"
        CHECK ("amount_cents" > 0 AND "amount_cents" <= 100),
    -- FNAL inexprimable (Q7).
    CONSTRAINT "collection_test_sequence"
        CHECK ("sequence" IN ('RCUR', 'FRST', 'OOFF')),
    -- Le préfixe d'un essai, et la borne SEPA de 35.
    CONSTRAINT "collection_test_references"
        CHECK ("message_id" LIKE 'ESS-%' AND "end_to_end_id" LIKE 'ESS-%'
               AND char_length("message_id") <= 35 AND char_length("end_to_end_id") <= 35),
    -- Un retour porte tous ses champs obligatoires, ou aucun.
    CONSTRAINT "collection_test_return_whole"
        CHECK (
            ("return_kind" IS NULL) = ("return_reason_code" IS NULL)
            AND ("return_kind" IS NULL) = ("returned_on" IS NULL)
            AND ("return_kind" IS NULL) = ("return_amount_cents" IS NULL)
            AND ("return_kind" IS NULL) = ("return_source" IS NULL)
            AND ("return_kind" IS NULL) = ("return_recorded_at" IS NULL)
            AND ("return_kind" IS NULL) = ("return_recorded_by_staff_id" IS NULL)
        ),
    -- Un remboursement porte son jour, son instant et son auteur, ou rien.
    CONSTRAINT "collection_test_refund_whole"
        CHECK (
            ("refunded_on" IS NULL) = ("refund_recorded_at" IS NULL)
            AND ("refunded_on" IS NULL) = ("refund_recorded_by_staff_id" IS NULL)
        )
);

CREATE UNIQUE INDEX "collection_test_message_id_key" ON "public"."collection_test"("message_id");
CREATE UNIQUE INDEX "collection_test_end_to_end_id_key" ON "public"."collection_test"("end_to_end_id");
CREATE INDEX "collection_test_created_at_idx" ON "public"."collection_test"("created_at");
