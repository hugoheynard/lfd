-- LES DESTINATAIRES DU DOSSIER DU JOUR
--
-- Plan `documentation/production/plan-envoi-du-dossier.md`, décisions 3-4, lot E2.
--
-- ADDITIVE : une table neuve du schéma `production`. Aucune ligne existante
-- touchée, aucun droit accordé (la lecture et l'écriture passent par
-- `production_settings`, déjà existant).
--
-- Une ligne est SOIT une référence à une fiche staff (sans clé étrangère :
-- l'annuaire vit dans `public`, un autre bloc), SOIT un externe complet. Un
-- retrait archive (`removed_at`) : pas de DELETE.
--
-- Retour arrière du SCHÉMA : `DROP TABLE`, une fois qu'aucun binaire ne la lit.

SET lock_timeout = '5s';

CREATE TABLE "production"."production_dossier_recipient" (
    "id"            TEXT           NOT NULL,
    "kind"          TEXT           NOT NULL,
    "staff_user_id" TEXT,
    "email"         TEXT,
    "first_name"    TEXT,
    "last_name"     TEXT,
    "job_title"     TEXT,
    "added_by"      TEXT           NOT NULL,
    "added_at"      TIMESTAMPTZ(6) NOT NULL,
    "removed_by"    TEXT,
    "removed_at"    TIMESTAMPTZ(6),

    CONSTRAINT "production_dossier_recipient_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_dossier_recipient_kind_check" CHECK (
        ("kind" = 'staff'
            AND "staff_user_id" IS NOT NULL
            AND "email" IS NULL AND "first_name" IS NULL
            AND "last_name" IS NULL AND "job_title" IS NULL)
        OR ("kind" = 'external'
            AND "staff_user_id" IS NULL
            AND "email" IS NOT NULL AND "email" = lower("email")
            AND "first_name" IS NOT NULL AND "last_name" IS NOT NULL)
    ),
    CONSTRAINT "production_dossier_recipient_removed_check"
        CHECK (("removed_at" IS NULL) = ("removed_by" IS NULL))
);

-- Une fiche n'est destinataire qu'une fois parmi les lignes vivantes.
CREATE UNIQUE INDEX "production_dossier_recipient_live_staff_key"
    ON "production"."production_dossier_recipient" ("staff_user_id")
    WHERE "removed_at" IS NULL AND "kind" = 'staff';

-- Une adresse externe n'est destinataire qu'une fois parmi les lignes vivantes.
CREATE UNIQUE INDEX "production_dossier_recipient_live_email_key"
    ON "production"."production_dossier_recipient" ("email")
    WHERE "removed_at" IS NULL AND "kind" = 'external';
