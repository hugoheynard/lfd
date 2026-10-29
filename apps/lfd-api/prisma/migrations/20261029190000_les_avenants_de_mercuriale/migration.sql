-- LES AVENANTS DATÉS D'UNE MERCURIALE — `documentation/pricing/plan-tarif-date-sur-une-reference.md`.
--
-- Hugo, 2026-10-29 : un tarif ajouté sur une référence en cours d'accord est un
-- AVENANT au document `company_mercuriales` (voie b), et un avenant peut aussi
-- arrêter une ligne à une date (Q1). Le document n'est jamais réécrit.
--
-- ADDITIF : une table neuve, vide. Rien n'est lu ni réécrit dans l'existant.
-- La clé étrangère est en RESTRICT : un document ne se supprime pas (archivage
-- seulement), et un avenant ne doit pas disparaître avec lui.
--
-- Deux CHECK que Prisma ne sait pas écrire, et qui doublent le domaine :
--   - un motif non blanc (l'invariant « pas d'avenant sans motif ») ;
--   - une fenêtre non vide quand elle est bornée.
--
-- Retour arrière : le code précédent ignore la table. Une fois des avenants
-- écrits, le retour arrière les rend muets — les prix qu'ils portent cessent
-- de s'appliquer. Irréversible en pratique après merge (seconde contradiction).

SET lock_timeout = '5s';

CREATE TABLE "public"."company_mercuriale_amendments" (
    "id" TEXT NOT NULL,
    "mercuriale_id" TEXT NOT NULL,
    "lines" JSONB NOT NULL,
    "ended_skus" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3),
    "reason" TEXT NOT NULL,
    "origin" JSONB,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),
    "archived_by" TEXT,
    "archive_reason" TEXT,

    CONSTRAINT "company_mercuriale_amendments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "company_mercuriale_amendments_reason_not_blank" CHECK (btrim("reason") <> ''),
    CONSTRAINT "company_mercuriale_amendments_window" CHECK ("valid_to" IS NULL OR "valid_to" > "valid_from")
);

CREATE INDEX "company_mercuriale_amendments_mercuriale_id_archived_at_idx"
    ON "public"."company_mercuriale_amendments"("mercuriale_id", "archived_at");

ALTER TABLE "public"."company_mercuriale_amendments"
    ADD CONSTRAINT "company_mercuriale_amendments_mercuriale_id_fkey"
    FOREIGN KEY ("mercuriale_id") REFERENCES "public"."company_mercuriales"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
