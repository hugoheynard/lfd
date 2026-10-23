-- LES NUMÉROS COURTS DES EXPORTS BANCAIRES — `EXC-<n>` (comptes destinataires)
-- et `EXM-<n>` (mandats), et le rang d'un fichier dans sa série (« 1 sur 2 »).
-- Décision de Hugo, 2026-10-23 ; doc
-- `documentation/comptabilite/prelevement/procedure-de-prelevement.md`,
-- « Les identifiants courts et les noms de fichiers ».
--
-- Même mécanique que `order_number_counter` (`20261023210000`) : un compteur
-- par sorte d'export, jamais remis à zéro, pris dans la transaction de la
-- préparation par `INSERT … ON CONFLICT DO UPDATE … RETURNING` — la ligne
-- reste verrouillée jusqu'au COMMIT, une préparation concurrente attend et
-- prend le rang suivant.
--
-- ADDITIVE. Ce qu'elle fait aux lignes EXISTANTES :
--   · chaque export reçoit sa `reference`, numérotée par ordre de création
--     (`created_at`, puis `id` — un ULID — pour départager), à partir de 1,
--     sur TOUTES les entités : le compteur est global ;
--   · le compteur de chaque sorte part du nombre d'exports déjà numérotés,
--     de sorte que la prochaine préparation prend le rang suivant ;
--   · `part_rank` / `part_count` restent NULL : la file d'attente au moment de
--     leur préparation n'a pas été gardée, et on ne l'invente pas. Leur nom de
--     fichier n'a donc pas de segment « k-sur-N ».
-- Aucune autre colonne n'est touchée.
--
-- Retour arrière : supprimer les trois colonnes de chaque table, la table
-- `bank_export_counter` et sa fonction — rien d'autre n'en dépend en base.

SET lock_timeout = '5s';

CREATE TABLE "public"."bank_export_counter" (
    -- `accounts` (EXC) ou `mandates` (EXM).
    "kind" TEXT NOT NULL,
    "last_rank" INTEGER NOT NULL,

    CONSTRAINT "bank_export_counter_pkey" PRIMARY KEY ("kind"),
    CONSTRAINT "bank_export_counter_kind" CHECK ("kind" IN ('accounts', 'mandates')),
    CONSTRAINT "bank_export_counter_rank" CHECK ("last_rank" >= 1)
);

-- Le compteur ne recule pas et ne se supprime pas : un rang rendu ressortirait
-- sur un second export, et `reference` est unique.
CREATE FUNCTION "public"."bank_export_counter_forward"() RETURNS trigger AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'bank_export_counter_forward: le compteur des exports bancaires ne se supprime pas';
    END IF;
    IF NEW."last_rank" <= OLD."last_rank" THEN
        RAISE EXCEPTION 'bank_export_counter_forward: le compteur % est au rang %, il ne revient pas au rang %', OLD."kind", OLD."last_rank", NEW."last_rank";
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "bank_export_counter_forward"
    BEFORE UPDATE OR DELETE ON "public"."bank_export_counter"
    FOR EACH ROW EXECUTE FUNCTION "public"."bank_export_counter_forward"();

-- ── Les comptes destinataires : EXC ─────────────────────────────────────────

ALTER TABLE "public"."account_bank_export"
    ADD COLUMN "reference" TEXT,
    ADD COLUMN "part_rank" INTEGER,
    ADD COLUMN "part_count" INTEGER;

UPDATE "public"."account_bank_export" AS e
SET "reference" = 'EXC-' || ranked.rank
FROM (
    SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rank
    FROM "public"."account_bank_export"
) AS ranked
WHERE e."id" = ranked."id";

INSERT INTO "public"."bank_export_counter" ("kind", "last_rank")
SELECT 'accounts', count(*) FROM "public"."account_bank_export" HAVING count(*) > 0;

ALTER TABLE "public"."account_bank_export"
    ALTER COLUMN "reference" SET NOT NULL,
    ADD CONSTRAINT "account_bank_export_reference_shape" CHECK ("reference" ~ '^EXC-[1-9][0-9]*$'),
    ADD CONSTRAINT "account_bank_export_part" CHECK (
        ("part_rank" IS NULL AND "part_count" IS NULL)
        OR ("part_rank" >= 1 AND "part_count" >= "part_rank")
    );

CREATE UNIQUE INDEX "account_bank_export_reference_key"
    ON "public"."account_bank_export" ("reference");

-- ── Les mandats : EXM ───────────────────────────────────────────────────────

ALTER TABLE "public"."mandate_bank_export"
    ADD COLUMN "reference" TEXT,
    ADD COLUMN "part_rank" INTEGER,
    ADD COLUMN "part_count" INTEGER;

UPDATE "public"."mandate_bank_export" AS e
SET "reference" = 'EXM-' || ranked.rank
FROM (
    SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS rank
    FROM "public"."mandate_bank_export"
) AS ranked
WHERE e."id" = ranked."id";

INSERT INTO "public"."bank_export_counter" ("kind", "last_rank")
SELECT 'mandates', count(*) FROM "public"."mandate_bank_export" HAVING count(*) > 0;

ALTER TABLE "public"."mandate_bank_export"
    ALTER COLUMN "reference" SET NOT NULL,
    ADD CONSTRAINT "mandate_bank_export_reference_shape" CHECK ("reference" ~ '^EXM-[1-9][0-9]*$'),
    ADD CONSTRAINT "mandate_bank_export_part" CHECK (
        ("part_rank" IS NULL AND "part_count" IS NULL)
        OR ("part_rank" >= 1 AND "part_count" >= "part_rank")
    );

CREATE UNIQUE INDEX "mandate_bank_export_reference_key"
    ON "public"."mandate_bank_export" ("reference");
