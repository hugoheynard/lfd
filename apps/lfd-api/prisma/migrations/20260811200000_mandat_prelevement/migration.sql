-- Le **mandat de prélèvement SEPA** — l'autorisation de débiter, jamais les
-- coordonnées bancaires. L'IBAN est saisi dans l'iframe Stripe et ne traverse
-- pas ce backend : cette table ne porte que des identifiants Stripe, la
-- référence opposable (RUM), et de quoi *reconnaître* le compte à l'écran.
--
-- Table à part plutôt que des colonnes sur `companies` : un mandat a un cycle de
-- vie propre et son historique est la preuve. Un mandat révoqué ne s'efface pas,
-- il se date — c'est ce qui permet de répondre, deux ans plus tard, « sur quelle
-- autorisation avez-vous prélevé le 12 mars ? ».

CREATE TYPE "public"."MandateStatus" AS ENUM ('pending', 'active', 'revoked', 'failed');

CREATE TABLE "public"."payment_mandates" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "stripe_customer_id" TEXT NOT NULL,
  "payment_method_id" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "last4" TEXT NOT NULL DEFAULT '',
  "bank_code" TEXT NOT NULL DEFAULT '',
  "country" TEXT NOT NULL DEFAULT '',
  "status" "public"."MandateStatus" NOT NULL DEFAULT 'pending',
  "accepted_at" TIMESTAMP(3) NOT NULL,
  "revoked_at" TIMESTAMP(3),
  "proof_storage_key" TEXT,
  "proof_file_name" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "payment_mandates_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."payment_mandates"
  ADD CONSTRAINT "payment_mandates_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "payment_mandates_company_id_status_idx"
  ON "public"."payment_mandates" ("company_id", "status");

-- Un seul mandat **actif** par société. Index PARTIEL : les mandats révoqués ou
-- rejetés s'empilent sans se gêner, et c'est tout l'intérêt d'en garder
-- l'historique. La règle est ici plutôt que dans le code parce qu'enregistrer
-- deux mandats en même temps ferait passer les deux contrôles applicatifs, et
-- plus rien ensuite ne dirait lequel fait foi.
CREATE UNIQUE INDEX "payment_mandates_one_active_per_company"
  ON "public"."payment_mandates" ("company_id")
  WHERE "status" = 'active';
