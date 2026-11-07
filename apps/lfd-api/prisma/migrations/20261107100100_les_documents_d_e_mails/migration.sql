-- LES DOCUMENTS DES E-MAILS — plan
-- `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 5, lot S4c.
--
-- ADDITIVE : deux tables neuves dans le schéma `mail`, et une colonne
-- NULLABLE sur `mail.mail_request`. Aucune donnée copiée, aucun droit accordé.
--
-- - `mail_document` : l'arrangement d'un e-mail (ses blocs), en brouillon et
--   publié. Pas de ligne = le document de départ, calculé à la lecture : ouvrir
--   un e-mail n'écrit rien.
-- - `mail_document_version` : chaque document publié, en AJOUT SEUL (un
--   déclencheur refuse UPDATE et DELETE) — de quoi dire quel texte a composé
--   un envoi.
-- - `mail_request.document_version` : la version publiée qui a composé
--   l'envoi ; `null` = le document de départ (Hugo, 2026-11-07, § 5).
--
-- Rien ne change pour un e-mail tant qu'aucun document n'est publié.
--
-- Retour arrière (migration EN AVANT) : `ALTER TABLE "mail"."mail_request" DROP
-- COLUMN "document_version"; DROP TABLE "mail"."mail_document_version"; DROP
-- TABLE "mail"."mail_document"; DROP FUNCTION
-- "mail"."mail_document_version_append_only"()`. Gratuit tant que rien n'est
-- publié ; après, il perd l'historique des versions.

-- CreateTable
CREATE TABLE "mail"."mail_document" (
    "template" VARCHAR(80) NOT NULL,
    "revision" INTEGER NOT NULL,
    "draft" JSONB,
    "draft_at" TIMESTAMPTZ(6),
    "draft_by" TEXT,
    "published" JSONB,
    "published_version" INTEGER,
    "published_at" TIMESTAMPTZ(6),
    "published_by" TEXT,
    "last_version" INTEGER NOT NULL DEFAULT 0,
    "retracted_at" TIMESTAMPTZ(6),
    "retracted_by" TEXT,

    CONSTRAINT "mail_document_pkey" PRIMARY KEY ("template"),
    CONSTRAINT "mail_document_revision_check" CHECK ("revision" > 0),
    -- Un document publié porte sa version, son instant et son auteur ; un
    -- document qui n'est pas publié n'en porte aucun.
    CONSTRAINT "mail_document_published_check" CHECK (
      ("published" IS NULL AND "published_version" IS NULL AND "published_at" IS NULL AND "published_by" IS NULL)
      OR ("published" IS NOT NULL AND "published_version" IS NOT NULL AND "published_at" IS NOT NULL AND "published_by" IS NOT NULL)
    ),
    CONSTRAINT "mail_document_version_check" CHECK (
      "last_version" >= 0 AND ("published_version" IS NULL OR "published_version" <= "last_version")
    )
);

-- CreateTable
CREATE TABLE "mail"."mail_document_version" (
    "template" VARCHAR(80) NOT NULL,
    "version" INTEGER NOT NULL,
    "document" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "published_by" TEXT NOT NULL,

    CONSTRAINT "mail_document_version_pkey" PRIMARY KEY ("template", "version"),
    CONSTRAINT "mail_document_version_positive_check" CHECK ("version" > 0)
);

CREATE FUNCTION "mail"."mail_document_version_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'mail_document_version_append_only: une version publiée ne se modifie ni ne s''efface (% v%), une publication en ajoute une', OLD."template", OLD."version";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "mail_document_version_append_only"
    BEFORE UPDATE OR DELETE ON "mail"."mail_document_version"
    FOR EACH ROW EXECUTE FUNCTION "mail"."mail_document_version_append_only"();

-- AlterTable
ALTER TABLE "mail"."mail_request" ADD COLUMN "document_version" INTEGER;
