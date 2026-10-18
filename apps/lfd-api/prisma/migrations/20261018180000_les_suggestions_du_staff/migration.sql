-- LES SUGGESTIONS DÉCIDÉES PAR LE STAFF (RS1, Hugo, 2026-10-18)
--
-- Plan `documentation/recommandation-produit/plan-suggestions-du-staff.md`.
-- ADDITIVE : deux tables neuves dans `public`, rien d'existant ne bouge.
-- `public` et non `growth` : une règle est une décision du commerce, pas une
-- mesure.
--
-- Les CHECK tiennent en base ce que l'agrégat `StaffSuggestionRule` refuse
-- déjà : une ligne écrite à la main ne contourne pas les énumérations, la
-- taille de la liste, ni l'ordre de la période.
--
-- RETOUR ARRIÈRE : sans objet pour la donnée servie — le code précédent
-- ignore ces tables. Les colonnes `created_by` / `updated_by` sont au
-- registre RGPD (`documentation/legal/rgpd-registre.json`).

CREATE TABLE "public"."staff_suggestion_rules" (
    "id" TEXT NOT NULL,
    "trigger_kind" TEXT NOT NULL,
    "trigger_ref" TEXT,
    "suggested_skus" TEXT[] NOT NULL,
    "placement" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "starts_on" DATE NOT NULL,
    "ends_on" DATE NOT NULL,
    "phrase_fr" TEXT,
    "phrase_en" TEXT,
    "phrase_it" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "created_by" TEXT,
    "updated_by" TEXT,

    CONSTRAINT "staff_suggestion_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "staff_suggestion_rules_trigger_check"
        CHECK ("trigger_kind" IN ('everywhere', 'product_in_cart', 'category_in_cart', 'product_viewed')),
    -- « Partout » ne nomme rien ; les trois autres nomment un article ou une famille.
    CONSTRAINT "staff_suggestion_rules_trigger_ref_check"
        CHECK (("trigger_kind" = 'everywhere') = ("trigger_ref" IS NULL)),
    CONSTRAINT "staff_suggestion_rules_skus_check"
        CHECK (cardinality("suggested_skus") BETWEEN 1 AND 3),
    CONSTRAINT "staff_suggestion_rules_placement_check"
        CHECK ("placement" IN ('cart', 'product', 'home')),
    CONSTRAINT "staff_suggestion_rules_audience_check"
        CHECK ("audience" IN ('pro', 'public', 'both')),
    CONSTRAINT "staff_suggestion_rules_period_check" CHECK ("ends_on" >= "starts_on"),
    -- Une traduction sans le français ne s'écrit pas.
    CONSTRAINT "staff_suggestion_rules_phrase_check"
        CHECK ("phrase_fr" IS NOT NULL OR ("phrase_en" IS NULL AND "phrase_it" IS NULL))
);

CREATE INDEX "staff_suggestion_rules_archived_at_starts_on_ends_on_idx"
    ON "public"."staff_suggestion_rules"("archived_at", "starts_on", "ends_on");

CREATE TABLE "public"."staff_suggestion_order_settings" (
    "key" TEXT NOT NULL,
    "order" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "staff_suggestion_order_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "staff_suggestion_order_settings_order_check" CHECK ("order" IN ('recent', 'priority'))
);
