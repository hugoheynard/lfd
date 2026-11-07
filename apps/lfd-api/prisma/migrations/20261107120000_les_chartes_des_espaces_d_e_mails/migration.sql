-- LES CHARTES DES ESPACES D'E-MAILS — plan
-- `documentation/editeur-de-contenu/plan-editeur-par-blocs.md`, § 25, lot C1.
--
-- ADDITIVE : deux tables neuves dans le schéma `mail`. Aucune colonne
-- existante touchée, aucune donnée copiée, aucun droit accordé (même droit
-- que les e-mails : `mail_templates`).
--
-- - `mail_charter` : la charte graphique d'un espace (`lfc`, `lfd`), en
--   brouillon et publiée. Pas de ligne = la charte de départ, calculée à la
--   lecture depuis les constantes du rendu : ouvrir la page n'écrit rien, et
--   les e-mails rendent les mêmes octets qu'avant.
-- - `mail_charter_version` : chaque charte publiée, en AJOUT SEUL (un
--   déclencheur refuse UPDATE et DELETE).
--
-- L'espace n'est pas une valeur nouvelle : il se lit de la charte de chaque
-- modèle (`lfc` / `lfd` / `internal`, déclarée dans le code), `internal`
-- rangé dans `lfd`. Aucune valeur rangée n'est renommée.
--
-- Retour arrière (migration EN AVANT) : `DROP TABLE
-- "mail"."mail_charter_version"; DROP TABLE "mail"."mail_charter"; DROP
-- FUNCTION "mail"."mail_charter_version_append_only"()`. Gratuit tant que rien
-- n'est publié ; après, il perd l'historique des chartes, et les e-mails
-- reviennent à la charte de départ.

-- CreateTable
CREATE TABLE "mail"."mail_charter" (
    "space" VARCHAR(16) NOT NULL,
    "revision" INTEGER NOT NULL,
    "draft" JSONB,
    "draft_at" TIMESTAMPTZ(6),
    "draft_by" TEXT,
    "published" JSONB,
    "published_version" INTEGER,
    "published_at" TIMESTAMPTZ(6),
    "published_by" TEXT,
    "last_version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "mail_charter_pkey" PRIMARY KEY ("space"),
    CONSTRAINT "mail_charter_space_check" CHECK ("space" IN ('lfc', 'lfd')),
    CONSTRAINT "mail_charter_revision_check" CHECK ("revision" > 0),
    -- Un brouillon porte son instant et son auteur ; pas de brouillon, aucun.
    CONSTRAINT "mail_charter_draft_check" CHECK (
      ("draft" IS NULL AND "draft_at" IS NULL AND "draft_by" IS NULL)
      OR ("draft" IS NOT NULL AND "draft_at" IS NOT NULL AND "draft_by" IS NOT NULL)
    ),
    -- Une charte publiée porte sa version, son instant et son auteur.
    CONSTRAINT "mail_charter_published_check" CHECK (
      ("published" IS NULL AND "published_version" IS NULL AND "published_at" IS NULL AND "published_by" IS NULL)
      OR ("published" IS NOT NULL AND "published_version" IS NOT NULL AND "published_at" IS NOT NULL AND "published_by" IS NOT NULL)
    ),
    CONSTRAINT "mail_charter_version_check" CHECK (
      "last_version" >= 0 AND ("published_version" IS NULL OR "published_version" <= "last_version")
    )
);

-- CreateTable
CREATE TABLE "mail"."mail_charter_version" (
    "space" VARCHAR(16) NOT NULL,
    "version" INTEGER NOT NULL,
    "settings" JSONB NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "published_by" TEXT NOT NULL,

    CONSTRAINT "mail_charter_version_pkey" PRIMARY KEY ("space", "version"),
    CONSTRAINT "mail_charter_version_positive_check" CHECK ("version" > 0)
);

CREATE FUNCTION "mail"."mail_charter_version_append_only"() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'mail_charter_version_append_only: une charte publiée ne se modifie ni ne s''efface (% v%), une publication en ajoute une', OLD."space", OLD."version";
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "mail_charter_version_append_only"
    BEFORE UPDATE OR DELETE ON "mail"."mail_charter_version"
    FOR EACH ROW EXECUTE FUNCTION "mail"."mail_charter_version_append_only"();
