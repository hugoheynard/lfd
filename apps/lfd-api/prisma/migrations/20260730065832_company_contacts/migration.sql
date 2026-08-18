-- Introduit les contacts additionnels d'une entreprise, et retire l'ancien
-- « représentant » unique (colonnes rep_*) que ce modèle 0..N remplace.
--
-- ⚠️ ORDRE VOLONTAIRE — la migration générée par Prisma supprimait rep_* AVANT
-- de créer la table : un représentant existant aurait été perdu. Ici on crée, on
-- REPREND, puis on supprime. Rejouable sur une base peuplée sans perte.

-- 1. Le carnet de contacts additionnels -------------------------------------
CREATE TABLE "company_contacts" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fonction" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "company_contacts_company_id_idx" ON "company_contacts"("company_id");
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Reprise du représentant existant (le cas échéant) ----------------------
-- Un id déterministe (donc rejouable) dérivé de la société. Seules les lignes
-- avec un e-mail de représentant sont reprises : un représentant sans e-mail
-- n'aurait pas été un contact joignable.
INSERT INTO "company_contacts" ("id", "company_id", "prenom", "nom", "fonction", "email", "telephone", "updated_at")
SELECT 'cct_rep_' || "id",
       "id",
       COALESCE("rep_prenom", ''),
       COALESCE("rep_nom", ''),
       COALESCE("rep_fonction", ''),
       "rep_email",
       COALESCE("rep_telephone", ''),
       CURRENT_TIMESTAMP
FROM "companies"
WHERE "rep_email" IS NOT NULL AND "rep_email" <> '';

-- 3. Retrait de l'ancien représentant unique --------------------------------
ALTER TABLE "companies"
    DROP COLUMN "rep_email",
    DROP COLUMN "rep_fonction",
    DROP COLUMN "rep_nom",
    DROP COLUMN "rep_prenom",
    DROP COLUMN "rep_telephone";
