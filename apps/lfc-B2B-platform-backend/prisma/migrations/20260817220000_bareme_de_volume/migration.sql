-- ───────────────────────────────────────────────────────────────────────────
-- Le barème de volume devient une ÉCHELLE, et cesse d'être N règles.
--
-- « 50+ à −10 % » et « 100+ à −5 % » sont deux règles parfaitement valides
-- prises séparément. Ensemble, elles forment un barème que personne n'a voulu :
-- un client qui passe de 90 à 100 pièces y verrait sa remise fondre.
-- L'incohérence n'était exprimable nulle part — il n'existait aucun objet d'où
-- la voir.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE "volume_ladders" (
    "id" TEXT NOT NULL,
    "scope_type" TEXT NOT NULL,
    "scope_id" TEXT,
    "audience_type" TEXT NOT NULL,
    "audience_id" TEXT,
    "unit" TEXT NOT NULL,
    "tiers" JSONB NOT NULL,
    "label" TEXT NOT NULL,
    "valid_from" TIMESTAMPTZ(3) NOT NULL,
    "valid_to" TIMESTAMPTZ(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "paused_at" TIMESTAMPTZ(3),
    "paused_by" TEXT,
    "archived_at" TIMESTAMPTZ(3),
    "archived_by" TEXT,
    "archive_reason" TEXT,

    CONSTRAINT "volume_ladders_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "volume_ladders_archived_at_idx" ON "volume_ladders" ("archived_at");

-- ───────────────────────────────────────────────────────────────────────────
-- **Deux barèmes ne se recouvrent jamais sur la même cible.**
--
-- Un barème est daté — celui d'aujourd'hui, celui de septembre — donc son
-- identifiant ne peut plus dériver de la cible. L'unicité se déplace : elle n'est
-- plus absolue, elle vaut À UN INSTANT DONNÉ, et c'est Postgres qui la tient.
--
-- Sans elle, deux barèmes actifs sur le même produit rendraient le prix
-- dépendant de l'ordre de tri, donc du hasard : la même faute que deux règles
-- également spécifiques, et le même refus. Un contrôle applicatif se contourne
-- par une insertion concurrente ; celui-ci, non.
--
-- `coalesce` est indispensable : dans une contrainte d'exclusion, NULL n'entre
-- jamais en conflit avec NULL — et la portée globale est justement celle dont le
-- `scope_id` est NULL.
--
-- Partielle (`WHERE archived_at IS NULL`) pour la même raison que sur les
-- règles : archiver doit LIBÉRER la place, sinon un barème rangé l'an dernier
-- interdirait pour toujours d'en poser un semblable.
-- ───────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "volume_ladders"
  ADD CONSTRAINT "volume_ladders_no_overlap"
  EXCLUDE USING gist (
    "scope_type" WITH =,
    coalesce("scope_id", '') WITH =,
    "audience_type" WITH =,
    coalesce("audience_id", '') WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);

-- ───────────────────────────────────────────────────────────────────────────
-- Reprise des règles de l'étage volume déjà posées.
--
-- Une règle par cible devient un palier ; plusieurs règles sur la même cible
-- (portée + audience) deviennent les paliers d'une seule échelle, triés par
-- quantité. `coalesce(min_quantity, 1)` : une règle volume SANS seuil
-- s'appliquait dès la première pièce, et c'est exactement ce que dit un palier à
-- 1 — la reprise ne change donc aucun prix.
--
-- La fenêtre reprise est la PLUS LARGE des règles reprises : rétrécir aurait
-- retiré une remise que des clients voyaient déjà.
--
-- Les règles en `replace` (un prix posé) ne sont pas des paliers de remise :
-- elles restent des règles, sur leur étage.
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO "volume_ladders" (
  "id", "scope_type", "scope_id", "audience_type", "audience_id",
  "unit", "tiers", "label", "valid_from", "valid_to",
  "created_by", "created_at", "updated_at"
)
SELECT
  md5("scope_type" || coalesce("scope_id", '') || "audience_type" || coalesce("audience_id", '')),
  "scope_type",
  "scope_id",
  "audience_type",
  "audience_id",
  min("mode"),
  jsonb_agg(
    jsonb_build_object('minQuantity', coalesce("min_quantity", 1), 'value', "value")
    ORDER BY coalesce("min_quantity", 1)
  ),
  min("label"),
  min("valid_from"),
  -- Une seule fenêtre ouverte suffit à ouvrir celle du barème.
  CASE WHEN bool_or("valid_to" IS NULL) THEN NULL ELSE max("valid_to") END,
  min("created_by"),
  min("created_at"),
  now()
FROM "price_rules"
WHERE "stage" = 'volume'
  AND "archived_at" IS NULL
  AND "nature" = 'alter'
  AND "direction" = 'decrease'
  AND "value" IS NOT NULL
GROUP BY "scope_type", "scope_id", "audience_type", "audience_id"
-- Une cible dont les règles mélangent les unités ne forme pas une échelle
-- lisible : on la laisse en règles plutôt que d'inventer une conversion.
HAVING count(DISTINCT "mode") = 1;

-- Les règles reprises sont ARCHIVÉES, jamais supprimées : elles ont facturé, et
-- leur trace explique des factures déjà payées.
UPDATE "price_rules"
SET "archived_at" = now(),
    "archived_by" = 'system',
    "archive_reason" = 'Reprise dans le barème de volume'
WHERE "stage" = 'volume'
  AND "archived_at" IS NULL
  AND "nature" = 'alter'
  AND "direction" = 'decrease'
  AND "value" IS NOT NULL
  AND md5("scope_type" || coalesce("scope_id", '') || "audience_type" || coalesce("audience_id", ''))
      IN (SELECT "id" FROM "volume_ladders");
