-- LES LIENS DE PAIEMENT — lot 4 du plan « blocage du prélèvement et liens de
-- paiement » (§2b).
--
-- Un lien de paiement libre demande une somme à un client hors de toute
-- commande, encaissée par Stripe Checkout hébergé. Et le plafond d'un tel lien
-- est un réglage du comptable (ligne unique `default`, `NULL` = aucun plafond).
--
-- **Additif** : un type, deux tables neuves, aucune colonne existante touchée.
--
-- Retour arrière, dans cet ordre :
--   DROP TABLE "public"."accounting_settings";
--   DROP TABLE "public"."payment_links";
--   DROP TYPE "public"."PaymentLinkStatus";
--
-- Plan : documentation/comptabilite/plan-blocage-prelevement-et-liens-de-paiement.md

CREATE TYPE "public"."PaymentLinkStatus" AS ENUM ('open', 'paid', 'cancelled', 'expired');

CREATE TABLE "public"."payment_links" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "public"."PaymentLinkStatus" NOT NULL DEFAULT 'open',
    "stripe_session_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "paid_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_staff_id" TEXT,
    CONSTRAINT "payment_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payment_links_stripe_session_id_key" ON "public"."payment_links"("stripe_session_id");
CREATE INDEX "payment_links_company_id_idx" ON "public"."payment_links"("company_id");
CREATE INDEX "payment_links_status_created_at_idx" ON "public"."payment_links"("status", "created_at");

ALTER TABLE "public"."payment_links" ADD CONSTRAINT "payment_links_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- L'argent en entiers strictement positifs : un lien à zéro ne demande rien.
ALTER TABLE "public"."payment_links" ADD CONSTRAINT "payment_links_amount_positive" CHECK ("amount_cents" > 0);

-- Une annulation sans instant ou sans auteur n'est pas une annulation : les
-- deux sont nulles ensemble ou posées ensemble.
ALTER TABLE "public"."payment_links" ADD CONSTRAINT "payment_links_cancellation_complete" CHECK (
  ("cancelled_at" IS NULL AND "cancelled_by_staff_id" IS NULL)
  OR ("cancelled_at" IS NOT NULL AND "cancelled_by_staff_id" IS NOT NULL)
);

CREATE TABLE "public"."accounting_settings" (
    "id" TEXT NOT NULL,
    "payment_link_max_cents" INTEGER,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by_staff_id" TEXT NOT NULL,
    CONSTRAINT "accounting_settings_pkey" PRIMARY KEY ("id")
);

-- Une seule ligne, et un plafond, s'il existe, strictement positif : un
-- plafond à zéro interdirait tout lien, ce qui se dit en ne créant pas de lien.
ALTER TABLE "public"."accounting_settings" ADD CONSTRAINT "accounting_settings_single_row" CHECK ("id" = 'default');
ALTER TABLE "public"."accounting_settings" ADD CONSTRAINT "accounting_settings_cap_positive" CHECK ("payment_link_max_cents" IS NULL OR "payment_link_max_cents" > 0);
