-- Brouillon de commande saisie par l'équipe : un par société, partagé.
CREATE TABLE "public"."order_drafts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "saved_by_staff_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_drafts_company_id_key" ON "public"."order_drafts"("company_id");

ALTER TABLE "public"."order_drafts" ADD CONSTRAINT "order_drafts_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
