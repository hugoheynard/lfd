-- LES CONDITIONS FACULTATIVES DES SUGGESTIONS DU STAFF (RS8, 2026-10-18)
--
-- Doc `documentation/recommandation-produit/suggestions-du-staff.md`, §2.1.
-- ADDITIVE : six colonnes neuves sur `staff_suggestion_rules`, nullables ou à
-- liste vide par défaut — une règle d'avant n'a aucune condition, et aucune
-- ligne existante ne change de sens. Aucune colonne existante ne bouge.
--
-- Les CHECK tiennent en base ce que l'agrégat `StaffSuggestionRule` refuse
-- déjà : des jours connus et jamais les sept, une plage dans l'ordre et qui
-- ne passe pas minuit, un seuil positif, et les deux conditions du panier
-- réservées à l'emplacement `cart`.
--
-- RETOUR ARRIÈRE : le code précédent ignore ces colonnes ; elles restent en
-- base (CLAUDE.md §0).

ALTER TABLE "public"."staff_suggestion_rules"
    ADD COLUMN "condition_weekdays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "condition_hours_from" TEXT,
    ADD COLUMN "condition_hours_to" TEXT,
    ADD COLUMN "condition_min_cart_total_cents" INTEGER,
    ADD COLUMN "condition_cart_without_family_id" TEXT,
    ADD COLUMN "condition_pickup_address_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

ALTER TABLE "public"."staff_suggestion_rules"
    ADD CONSTRAINT "staff_suggestion_rules_weekdays_check"
        CHECK ("condition_weekdays" <@ ARRAY['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']::TEXT[]
               AND cardinality("condition_weekdays") < 7),
    -- Les deux bornes, ou aucune ; `HH:MM` à deux chiffres, donc l'ordre des
    -- chaînes est celui des heures.
    ADD CONSTRAINT "staff_suggestion_rules_hours_check"
        CHECK (("condition_hours_from" IS NULL AND "condition_hours_to" IS NULL)
               OR ("condition_hours_from" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                   AND "condition_hours_to" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
                   AND "condition_hours_to" > "condition_hours_from")),
    ADD CONSTRAINT "staff_suggestion_rules_cart_threshold_check"
        CHECK ("condition_min_cart_total_cents" IS NULL OR "condition_min_cart_total_cents" > 0),
    -- Le montant et les familles du panier ne se jugent qu'au panier.
    ADD CONSTRAINT "staff_suggestion_rules_cart_conditions_check"
        CHECK ("placement" = 'cart'
               OR ("condition_min_cart_total_cents" IS NULL
                   AND "condition_cart_without_family_id" IS NULL));
