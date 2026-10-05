-- LE PAYEUR DES SOUS-COMPTES — plan `documentation/b2b/comptes-client/plan-sous-comptes.md`,
-- lot S4 (§2.1 ter, §2.3, §5).
--
-- ADDITIVE : des colonnes nullables, une table neuve, une énumération neuve.
-- Aucune ligne existante modifiée, aucune colonne resserrée, aucun droit
-- accordé à un rôle, aucun remplissage rétroactif : une commande d'avant porte
-- `billed_company_id` nul et se lit « la société de la commande » (§5) ; un
-- mandat d'avant porte `bank_account_id` nul et débite le RIB de sa société,
-- comme hier.
--
-- Retour arrière du SCHÉMA (migration EN AVANT, une fois qu'aucun binaire ne
-- les lit) : `DROP TABLE "company_collection_form"`, `DROP TYPE
-- "CollectionForm"`, puis les colonnes de `payment_mandates` et de `orders`.
-- ⚠️ Irréversible EN DONNÉES dès qu'une commande porte un payeur et qu'un
-- prélèvement a été émis sur lui (§6).

SET lock_timeout = '5s';

-- 1. Le payeur, copié à la passation (§2.3). Une commande sans société n'a
--    pas de payeur à copier.
ALTER TABLE "orders"
    ADD COLUMN "billed_company_id" TEXT,
    ADD CONSTRAINT "orders_billed_company_id_fkey"
        FOREIGN KEY ("billed_company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "order_billed_needs_company"
        CHECK ("billed_company_id" IS NULL OR "company_id" IS NOT NULL);

CREATE INDEX "orders_billed_company_id_idx" ON "orders"("billed_company_id");

-- 2. Le mandat désigne son compte, et fige son débiteur (§2.1 ter, T8, T9).
--    Nuls pour les mandats d'avant : le lecteur retombe alors sur le RIB de
--    la société du mandat, ce qui était la règle.
ALTER TABLE "payment_mandates"
    ADD COLUMN "bank_account_id" TEXT,
    ADD COLUMN "debtor_company_id" TEXT,
    ADD COLUMN "debtor_siren" TEXT,
    ADD COLUMN "debtor_name" TEXT,
    ADD COLUMN "debtor_legal_form" TEXT,
    ADD CONSTRAINT "payment_mandates_bank_account_id_fkey"
        FOREIGN KEY ("bank_account_id") REFERENCES "company_bank_accounts"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE,
    ADD CONSTRAINT "payment_mandates_debtor_company_id_fkey"
        FOREIGN KEY ("debtor_company_id") REFERENCES "companies"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "payment_mandates_debtor_company_id_idx" ON "payment_mandates"("debtor_company_id");

-- 3. La forme de prélèvement d'un site, décision DATÉE (§2.1 ter) : la forme
--    qui compte est celle en vigueur à la clôture du cycle. Une société sans
--    période est prélevée sur le mandat de son payeur (la première forme).
CREATE TYPE "CollectionForm" AS ENUM ('principal_mandate', 'own_mandate_principal_iban', 'own_iban');

CREATE TABLE "company_collection_form" (
    "company_id" TEXT NOT NULL,
    "form" "CollectionForm" NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3),

    CONSTRAINT "company_collection_form_pkey" PRIMARY KEY ("company_id", "valid_from"),
    CONSTRAINT "company_collection_form_company_id_fkey"
        FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "company_collection_form_window" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from")
);

-- Deux périodes ne se chevauchent jamais : « quelle forme à la clôture du
-- 1er mars » n'a qu'une réponse. `btree_gist` est déjà activée
-- (`20260818140000_engagement_de_volume`) ; la ligne la rend autoportante.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "company_collection_form"
    ADD CONSTRAINT "company_collection_form_no_overlap"
    EXCLUDE USING gist (
        "company_id" WITH =,
        tstzrange("valid_from", "valid_to", '[)') WITH &&
    );
