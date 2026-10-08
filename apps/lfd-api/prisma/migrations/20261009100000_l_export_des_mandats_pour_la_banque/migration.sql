-- L'EXPORT DES MANDATS POUR LA BANQUE — lot M1
-- (`documentation/comptabilite/mandat/plan-export-des-mandats-pour-la-banque.md`, § 2 bis)
--
-- Deux tables : l'export (entité, auteur, instant, nombre, et « importé » posé
-- à la main), et ses lignes (mandat, RUM, EMPREINTE du compte exporté).
--
-- 🔴 Aucun IBAN ni BIC, ni en clair ni scellé : le fichier n'est pas stocké, il
-- se recalcule depuis les mandats. L'empreinte (SHA-256 hex de l'IBAN
-- normalisé) suffit à dire « déjà importé sous ce compte ».
--
-- ADDITIVE : deux tables neuves. Aucune ligne existante modifiée, aucune
-- colonne resserrée, aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (tant qu'aucun export n'a été marqué importé en
-- production) : `DROP TABLE "mandate_bank_export_line"` puis
-- `DROP TABLE "mandate_bank_export"`. Après : NE PAS le faire — la ligne est la
-- seule trace chez nous de ce que la banque a reçu.

SET lock_timeout = '5s';

CREATE TABLE "public"."mandate_bank_export" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "mandate_count" INTEGER NOT NULL,
    "imported_at" TIMESTAMPTZ(3),
    "imported_by_staff_id" TEXT,

    CONSTRAINT "mandate_bank_export_pkey" PRIMARY KEY ("id"),
    -- Un export vide n'a rien à dire à la banque : l'agrégat le refuse aussi.
    CONSTRAINT "mandate_bank_export_not_empty" CHECK ("mandate_count" > 0),
    -- « Importé » se dit par son instant ET son auteur, jamais l'un sans l'autre.
    CONSTRAINT "mandate_bank_export_imported_stamp" CHECK (
        ("imported_at" IS NULL) = ("imported_by_staff_id" IS NULL)
    )
);

CREATE TABLE "public"."mandate_bank_export_line" (
    "export_id" TEXT NOT NULL,
    "mandate_id" TEXT NOT NULL,
    "rum" TEXT NOT NULL,
    "account_fingerprint" TEXT NOT NULL,

    CONSTRAINT "mandate_bank_export_line_pkey" PRIMARY KEY ("export_id","mandate_id"),
    -- Une empreinte, pas un compte : un IBAN ne peut pas s'y glisser.
    CONSTRAINT "mandate_bank_export_line_fingerprint_hex" CHECK ("account_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "mandate_bank_export_legal_entity_id_created_at_idx" ON "public"."mandate_bank_export"("legal_entity_id", "created_at");

CREATE INDEX "mandate_bank_export_line_mandate_id_idx" ON "public"."mandate_bank_export_line"("mandate_id");

ALTER TABLE "public"."mandate_bank_export"
    ADD CONSTRAINT "mandate_bank_export_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."mandate_bank_export_line"
    ADD CONSTRAINT "mandate_bank_export_line_export_id_fkey"
    FOREIGN KEY ("export_id") REFERENCES "public"."mandate_bank_export"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
