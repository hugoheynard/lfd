-- L'ANNULATION PAR LE CLIENT — qui a annulé, et ce que la boutique permet
--
-- Plan `documentation/commandes/annulation/plan-annulation-de-commande.md`,
-- lot C6 (C6.5, C6.6, objection S4).
--
-- 1. `public.orders` gagne trois colonnes, toutes NULLABLES :
--    - `cancelled_by_kind` : `staff | customer | guest`. NULL pour l'historique
--      (annulations automatiques, et annulations staff d'avant C6) : on ne
--      rattrape rien. CHECK à sens unique (S4) : `staff` exige `cancelled_by`
--      (la fiche), `customer` / `guest` exigent `cancelled_by_user_id`. Rien
--      n'est exigé dans l'autre sens : une ligne d'avant C6 garde sa fiche
--      sans type.
--    - `cancelled_by_user_id` : le client qui a annulé (l'auteur, ou un membre
--      de la société). Donnée CLIENT, pas staff : elle suit la conservation de
--      la commande. Clé étrangère vers `users`, sans cascade.
--    - `cancellation_reason_code` : le motif choisi par un client dans une
--      liste close. Valeurs IRRÉVERSIBLES dès la première ligne (CLAUDE.md §8).
-- 2. `public.customer_cancellation_settings` : une ligne, clé `orders`,
--    FERMÉE (`open_to_b2c = false`, 24 h) — rien ne s'ouvre au déploiement.
--    L'auteur est nul tant que personne n'a rien réglé : la ligne posée ici
--    n'a pas d'auteur, et on ne lui en invente pas.
--
-- ADDITIVE : aucune colonne existante touchée, aucune donnée réécrite, aucun
-- droit accordé. Retour arrière : `DROP TABLE
-- "public"."customer_cancellation_settings"` puis les trois `DROP COLUMN` —
-- seulement avant la première annulation par un client.

ALTER TABLE "public"."orders"
    ADD COLUMN "cancelled_by_kind" TEXT,
    ADD COLUMN "cancelled_by_user_id" TEXT,
    ADD COLUMN "cancellation_reason_code" TEXT;

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_cancelled_by_kind_known"
        CHECK ("cancelled_by_kind" IS NULL OR "cancelled_by_kind" IN ('staff', 'customer', 'guest')),
    ADD CONSTRAINT "orders_cancelled_by_staff_has_sheet"
        CHECK ("cancelled_by_kind" IS DISTINCT FROM 'staff' OR "cancelled_by" IS NOT NULL),
    ADD CONSTRAINT "orders_cancelled_by_customer_has_user"
        CHECK ("cancelled_by_kind" IS NULL OR "cancelled_by_kind" NOT IN ('customer', 'guest') OR "cancelled_by_user_id" IS NOT NULL),
    ADD CONSTRAINT "orders_cancellation_reason_code_known"
        CHECK ("cancellation_reason_code" IS NULL OR "cancellation_reason_code" IN ('no_longer_needed', 'wrong_date', 'wrong_products', 'other'));

ALTER TABLE "public"."orders"
    ADD CONSTRAINT "orders_cancelled_by_user_id_fkey"
        FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."users"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "public"."customer_cancellation_settings" (
    "key" TEXT NOT NULL,
    "open_to_b2c" BOOLEAN NOT NULL DEFAULT false,
    "hours_before" INTEGER NOT NULL DEFAULT 24,
    "updated_at" TIMESTAMP(3),
    "updated_by_staff_id" TEXT,
    "updated_by_name" TEXT,
    "updated_by_role" TEXT,

    CONSTRAINT "customer_cancellation_settings_pkey" PRIMARY KEY ("key"),
    CONSTRAINT "customer_cancellation_settings_hours_bounded" CHECK ("hours_before" BETWEEN 0 AND 168)
);

INSERT INTO "public"."customer_cancellation_settings" ("key", "open_to_b2c", "hours_before")
VALUES ('orders', false, 24);
