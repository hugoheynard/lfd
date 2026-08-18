-- ───────────────────────────────────────────────────────────────────────────
-- Cycle de vie des décisions tarifaires, et le journal qui les raconte.
--
-- Trois choses, qui n'en font qu'une : plus rien ne s'efface, une promotion se
-- suspend, et tout geste laisse un acte signé.
-- ───────────────────────────────────────────────────────────────────────────

ALTER TABLE "price_rules"
  ADD COLUMN "paused_at"      TIMESTAMPTZ(3),
  ADD COLUMN "paused_by"      TEXT,
  ADD COLUMN "archived_at"    TIMESTAMPTZ(3),
  ADD COLUMN "archived_by"    TEXT,
  ADD COLUMN "archive_reason" TEXT;

CREATE INDEX "price_rules_archived_at_idx" ON "price_rules" ("archived_at");

-- ───────────────────────────────────────────────────────────────────────────
-- LA décision de cette migration : la contrainte d'exclusion devient PARTIELLE.
--
-- Archiver doit LIBÉRER le créneau — sinon une règle rangée l'an dernier
-- interdirait pour toujours d'en poser une semblable, et le staff n'aurait
-- d'autre issue que de la supprimer pour de bon, c'est-à-dire d'effacer
-- l'explication d'une facture.
--
-- Suspendre, à l'inverse, le GARDE : une pause qui rendrait sa place laisserait
-- quelqu'un poser une jumelle pendant ce temps, et la reprise échouerait sur un
-- chevauchement que personne n'a vu venir. Une promotion suspendue deviendrait
-- irrécupérable — précisément le jour où on veut la rallumer.
--
-- D'où la clause, qui ne nomme QUE l'archivage.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "price_rules" DROP CONSTRAINT "price_rules_no_overlap";

ALTER TABLE "price_rules"
  ADD CONSTRAINT "price_rules_no_overlap"
  EXCLUDE USING gist (
    "stage" WITH =,
    "scope_type" WITH =,
    coalesce("scope_id", '') WITH =,
    "audience_type" WITH =,
    coalesce("audience_id", '') WITH =,
    coalesce("min_quantity", 0) WITH =,
    tstzrange("valid_from", "valid_to", '[)') WITH &&
  )
  WHERE ("archived_at" IS NULL);

-- ───────────────────────────────────────────────────────────────────────────
-- Les limites suivent la même règle : on archive, on ne supprime pas.
--
-- Pas de versionnage ici, à la différence des règles, et c'est un choix : leur
-- identifiant est DÉRIVÉ de la portée (`category:cat_vien`), ce qui rend « une
-- seule limite par cible » structurel plutôt que surveillé. Une limite retirée
-- puis re-posée reprend donc sa ligne — et son histoire, elle, vit dans le
-- journal, qui est l'endroit fait pour ça.
--
-- L'index unique reste donc entier : il n'y a jamais qu'une ligne par portée,
-- archivée ou non.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "price_floors"
  ADD COLUMN "archived_at"    TIMESTAMPTZ(3),
  ADD COLUMN "archived_by"    TEXT,
  ADD COLUMN "archive_reason" TEXT;

-- ───────────────────────────────────────────────────────────────────────────
-- Le journal. Append-only : aucune colonne mutable, aucun `updated_at`, et
-- aucun port applicatif qui expose une mise à jour ou un effacement.
--
-- Pas de clé étrangère vers `price_rules` ni `price_floors`, volontairement :
-- l'acte doit survivre à son sujet. Une cascade emporterait exactement la trace
-- qu'on cherchait à garder.
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE "pricing_events" (
    "id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" TEXT NOT NULL,
    "act" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "summary" TEXT NOT NULL,

    CONSTRAINT "pricing_events_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pricing_events_subject_type_subject_id_occurred_at_idx"
  ON "pricing_events" ("subject_type", "subject_id", "occurred_at");

CREATE INDEX "pricing_events_occurred_at_idx" ON "pricing_events" ("occurred_at");
