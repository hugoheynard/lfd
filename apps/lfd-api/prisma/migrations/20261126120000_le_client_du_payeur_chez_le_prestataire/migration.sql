-- ───────────────────────────────────────────────────────────────────────────
-- LE CLIENT DU PAYEUR CHEZ LE PRESTATAIRE — `payment.card_customer`.
--
-- Plan documentation/payment/plan-pointage-stripe.md, lot 1 (objection 2).
-- ADDITIVE : la table naît vide. Une ligne par personne et par compte
-- d'encaissement, écrite au premier paiement par carte d'un payeur connu :
-- la correspondance se lit chez nous, jamais par la recherche du
-- prestataire. Ni nom ni adresse : ils sont chez le prestataire.
--
-- Retour arrière, tant que la table est vide :
--   DROP TABLE "payment"."card_customer";
-- Au-delà, les clients existent chez le prestataire : la table reste.
-- ───────────────────────────────────────────────────────────────────────────

SET lock_timeout = '5s';

CREATE TABLE "payment"."card_customer" (
    "account" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "card_customer_pkey" PRIMARY KEY ("account", "user_id")
);

CREATE UNIQUE INDEX "card_customer_account_provider_ref_key"
    ON "payment"."card_customer" ("account", "provider_ref");
