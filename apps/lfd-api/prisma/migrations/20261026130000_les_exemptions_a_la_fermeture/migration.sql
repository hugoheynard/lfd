-- Retour arrière : `DROP TABLE "public"."order_opening_exemptions"` — toute
-- exemption disparaît, et une boutique fermée refuse de nouveau ces clients.
-- À dire à Hugo avant.
--
-- LES EXEMPTIONS À LA FERMETURE DE LA BOUTIQUE — décision de Hugo du 2026-10-26.
-- Doc : `documentation/commandes/passation/ouverture-de-la-boutique.md`.
--
-- ADDITIVE : une table neuve, vide. Aucune colonne existante touchée, aucun
-- droit accordé à un rôle — l'écran se règle sous `lfc_order_opening`, la
-- ressource du réglage.
--
-- Retirer une exemption l'ARCHIVE (`withdrawn_at`) ; aucune ligne ne s'efface.
-- Pas de clé étrangère vers `companies` : la société est un identifiant opaque
-- et un nom figé, comme dans un fait du journal.

CREATE TABLE "public"."order_opening_exemptions" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "company_id" TEXT,
    "company_name" TEXT,
    "email" TEXT,
    "granted_at" TIMESTAMP(3) NOT NULL,
    "granted_by_staff_id" TEXT NOT NULL,
    "granted_by_name" TEXT NOT NULL,
    "granted_by_role" TEXT NOT NULL,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_staff_id" TEXT,
    "withdrawn_by_name" TEXT,
    "withdrawn_by_role" TEXT,

    CONSTRAINT "order_opening_exemptions_pkey" PRIMARY KEY ("id"),
    -- Une exemption vise une société OU une adresse, et la colonne de l'autre reste vide.
    CONSTRAINT "order_opening_exemptions_target_check" CHECK (
        ("kind" = 'company' AND "company_id" IS NOT NULL AND "company_name" IS NOT NULL AND "email" IS NULL)
        OR ("kind" = 'email' AND "email" IS NOT NULL AND "company_id" IS NULL AND "company_name" IS NULL)
    )
);

-- Une cible n'a qu'une exemption ACTIVE : deux ajouts simultanés se départagent ici.
CREATE UNIQUE INDEX "order_opening_exemptions_active_company_key"
    ON "public"."order_opening_exemptions"("company_id") WHERE "withdrawn_at" IS NULL AND "kind" = 'company';
CREATE UNIQUE INDEX "order_opening_exemptions_active_email_key"
    ON "public"."order_opening_exemptions"("email") WHERE "withdrawn_at" IS NULL AND "kind" = 'email';
