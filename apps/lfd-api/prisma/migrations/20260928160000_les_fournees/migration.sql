-- LES FOURNÉES — plan `documentation/production/plan-fournees-progressives.md`,
-- D1, D6 et §5.1 (M1 : « étendre »).
--
-- Strictement ADDITIVE : une table neuve, trois déclencheurs, un rattrapage.
-- Aucune colonne existante touchée. `production_count.done_*` reste en place et
-- lisible : le binaire précédent continue d'y cocher, le nouveau n'y écrit plus
-- (§5), et lit une ligne cochée SANS fournée comme une fournée implicite.
--
-- Retour arrière : `DROP TRIGGER` des trois déclencheurs, `DROP TABLE
-- production_batch`. Sûr tant qu'aucune fournée PARTIELLE n'a été saisie en
-- production (§5, « point de non-retour ») : le binaire précédent ne lit que
-- `done_at`, nul sur une ligne à moitié sortie.

-- Même prudence que la migration de la version par journée : poser un
-- déclencheur attend les transactions en cours sur la table. Celle-ci est
-- neuve, mais la clé étrangère verrouille `production_day` — mieux vaut échouer
-- proprement en 5 s que faire attendre la clôture du soir.
SET lock_timeout = '5s';

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. LA TABLE — une fournée par ligne, en ajout seul (D1)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- `id` vient du CLIENT (ULID) : c'est la clé d'idempotence. Pas de compteur
-- `produced` sur `production_count` : sorti = Σ des fournées non annulées.
CREATE TABLE IF NOT EXISTS "production"."production_batch" (
    "id"           TEXT         NOT NULL,
    "service_day"  VARCHAR(10)  NOT NULL,
    "sku"          TEXT         NOT NULL,
    "quantity"     INTEGER      NOT NULL,
    "recorded_at"  TIMESTAMPTZ  NOT NULL,
    "recorded_by"  TEXT         NOT NULL,
    "initials"     TEXT         NOT NULL DEFAULT '',
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" TEXT,

    CONSTRAINT "production_batch_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "production_batch_quantity_positive" CHECK ("quantity" > 0),
    -- Une annulation sans auteur ne se conteste pas : les deux ensemble, ou rien.
    CONSTRAINT "production_batch_cancelled_pair" CHECK (
        ("cancelled_at" IS NULL) = ("cancelled_by" IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "production_batch_service_day_sku_idx"
    ON "production"."production_batch" ("service_day", "sku");

-- RESTRICT et non CASCADE : une fournée est un fait, jamais supprimé (D3). Une
-- journée ne se supprime pas non plus ; si quelqu'un essayait, la base refuse.
ALTER TABLE "production"."production_batch"
    ADD CONSTRAINT "production_batch_service_day_fkey"
    FOREIGN KEY ("service_day") REFERENCES "production"."production_day"("service_day")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. LE JOURNAL DE JOURNÉE — chaque fournée avance la version (D6)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La fonction existe déjà (`20260928140000_la_version_par_journee`) : la table
-- porte sa colonne `service_day`, c'est la même lecture du jour.
CREATE TRIGGER "production_batch_day_change_insert"
  AFTER INSERT ON "production"."production_batch"
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_batch_day_change_update"
  AFTER UPDATE ON "production"."production_batch"
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();
CREATE TRIGGER "production_batch_day_change_delete"
  AFTER DELETE ON "production"."production_batch"
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION "production"."record_day_change_by_service_day"();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. LE RATTRAPAGE — les coches de l'ancien binaire deviennent des fournées
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Rejouable sans doubler (§5.1, objections B1 et B2 de `vitruve`) :
--   · clé `(service_day, sku)`, JAMAIS `production_count.id` — un cuid que
--     chaque `save` régénère ;
--   · `id` déterministe, `ON CONFLICT DO NOTHING` ;
--   · seulement là où il n'existe AUCUNE fournée pour ce `(service_day, sku)`,
--     annulée comprise : une ligne que le nouveau binaire a déjà touchée est
--     tenue par ses fournées, pas par `done_at`.
--
-- Le même `id` est écrit par le binaire quand il matérialise une coche
-- implicite (§5.3) : les deux chemins ne peuvent pas se doubler.
--
-- Les marqueurs ci-dessous délimitent l'instruction que l'e2e
-- `test/production-batches.e2e-spec.ts` rejoue deux fois : ne pas les retirer.
-- BACKFILL:BEGIN
INSERT INTO "production"."production_batch"
    ("id", "service_day", "sku", "quantity", "recorded_at", "recorded_by", "initials")
SELECT 'backfill-' || c."service_day" || '-' || c."sku",
       c."service_day", c."sku", c."quantity", c."done_at", c."done_by", c."done_initials"
  FROM "production"."production_count" c
 WHERE c."done_at" IS NOT NULL
   AND c."done_by" IS NOT NULL
   AND c."quantity" > 0
   AND NOT EXISTS (
       SELECT 1 FROM "production"."production_batch" b
        WHERE b."service_day" = c."service_day" AND b."sku" = c."sku"
   )
ON CONFLICT ("id") DO NOTHING;
-- BACKFILL:END

RESET lock_timeout;
