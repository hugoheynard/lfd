-- L'EXPORT DES COMPTES DESTINATAIRES POUR LA BANQUE
-- (`documentation/comptabilite/prelevement/prerequis-export-ribs.md`, § 2, § 4 lot 2)
--
-- Trois tables : l'export (entité, auteur, instant, nombre, puis « importé »
-- OU « abandonné », posés à la main), ses lignes (EMPREINTE du compte, RIB et
-- société opaques), et les comptes déclarés « déjà connus de la banque » sans
-- fichier (§ 2.6).
--
-- 🔴 Aucun IBAN ni BIC, ni en clair ni scellé : le fichier n'est pas stocké, il
-- se recalcule depuis les RIB. L'empreinte (SHA-256 hex de l'IBAN normalisé)
-- suffit à dire « la banque a déjà ce compte ».
--
-- ADDITIVE : trois tables neuves. Aucune ligne existante modifiée, aucune
-- colonne resserrée, aucun droit accordé à un rôle.
--
-- Retour arrière du SCHÉMA (tant qu'aucun export n'a été marqué importé ni
-- aucun compte déclaré connu en production) : `DROP TABLE
-- "known_bank_account"`, `DROP TABLE "account_bank_export_line"` puis `DROP
-- TABLE "account_bank_export"`. Après : NE PAS le faire — ces lignes sont la
-- seule trace chez nous de ce que la banque connaît, et un compte renvoyé fait
-- rejeter tout l'import suivant.

SET lock_timeout = '5s';

CREATE TABLE "public"."account_bank_export" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,
    "account_count" INTEGER NOT NULL,
    "imported_at" TIMESTAMPTZ(3),
    "imported_by_staff_id" TEXT,
    "abandoned_at" TIMESTAMPTZ(3),
    "abandoned_by_staff_id" TEXT,

    CONSTRAINT "account_bank_export_pkey" PRIMARY KEY ("id"),
    -- Au moins un compte, 200 au plus (réponse 8 de la banque) : l'agrégat le refuse aussi.
    CONSTRAINT "account_bank_export_count" CHECK ("account_count" BETWEEN 1 AND 200),
    -- « Importé » et « abandonné » se disent par instant ET auteur, jamais l'un sans l'autre.
    CONSTRAINT "account_bank_export_imported_stamp" CHECK (
        ("imported_at" IS NULL) = ("imported_by_staff_id" IS NULL)
    ),
    CONSTRAINT "account_bank_export_abandoned_stamp" CHECK (
        ("abandoned_at" IS NULL) = ("abandoned_by_staff_id" IS NULL)
    ),
    -- Un export se clôt une fois : importé OU abandonné.
    CONSTRAINT "account_bank_export_closed_once" CHECK (
        "imported_at" IS NULL OR "abandoned_at" IS NULL
    )
);

CREATE TABLE "public"."account_bank_export_line" (
    "export_id" TEXT NOT NULL,
    "account_fingerprint" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,

    CONSTRAINT "account_bank_export_line_pkey" PRIMARY KEY ("export_id","account_fingerprint"),
    -- Une empreinte, pas un compte : un IBAN ne peut pas s'y glisser.
    CONSTRAINT "account_bank_export_line_fingerprint_hex" CHECK ("account_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "public"."known_bank_account" (
    "id" TEXT NOT NULL,
    "account_fingerprint" TEXT NOT NULL,
    "bank_account_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "declared_at" TIMESTAMPTZ(3) NOT NULL,
    "declared_by_staff_id" TEXT NOT NULL,

    CONSTRAINT "known_bank_account_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "known_bank_account_fingerprint_hex" CHECK ("account_fingerprint" ~ '^[0-9a-f]{64}$')
);

CREATE INDEX "account_bank_export_legal_entity_id_created_at_idx" ON "public"."account_bank_export"("legal_entity_id", "created_at");

CREATE INDEX "account_bank_export_line_account_fingerprint_idx" ON "public"."account_bank_export_line"("account_fingerprint");

-- Une empreinte se déclare connue une seule fois.
CREATE UNIQUE INDEX "known_bank_account_account_fingerprint_key" ON "public"."known_bank_account"("account_fingerprint");

ALTER TABLE "public"."account_bank_export"
    ADD CONSTRAINT "account_bank_export_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."account_bank_export_line"
    ADD CONSTRAINT "account_bank_export_line_export_id_fkey"
    FOREIGN KEY ("export_id") REFERENCES "public"."account_bank_export"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."known_bank_account"
    ADD CONSTRAINT "known_bank_account_legal_entity_id_fkey"
    FOREIGN KEY ("legal_entity_id") REFERENCES "public"."legal_entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
