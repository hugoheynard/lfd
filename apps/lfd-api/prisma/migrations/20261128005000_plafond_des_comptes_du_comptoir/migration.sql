-- LE PLAFOND DES COMPTES OUVERTS AU COMPTOIR — lot K4 du plan
-- documentation/comptes-client/plan-comptes-du-comptoir.md, § 3.3.
--
-- Une ligne au plus, clé `orders`. Aucune ligne n'est posée : ligne absente =
-- aucun plafond, la valeur par défaut décidée (`NULL`).
--
-- ADDITIVE : une table neuve, sans clé étrangère.

CREATE TABLE "public"."counter_account_settings" (
    "key" TEXT NOT NULL,
    "ceiling_cents" INTEGER,
    "updated_at" TIMESTAMP(3),
    "updated_by_staff_id" TEXT,

    CONSTRAINT "counter_account_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "counter_account_settings_single" CHECK ("key" = 'orders'),
    CONSTRAINT "counter_account_settings_ceiling_non_negative" CHECK ("ceiling_cents" IS NULL OR "ceiling_cents" >= 0)
);
