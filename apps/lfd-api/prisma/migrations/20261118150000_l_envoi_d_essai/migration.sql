-- L'ENVOI D'ESSAI : UN FICHIER, PLUSIEURS DÉBITEURS (Hugo, 2026-11-18)
--
-- Plan : documentation/comptabilite/prelevement/plan-essai-a-plusieurs-debiteurs.md
-- (§1.1, et §5 qui l'emporte).
--
-- `public.collection_test_file` : l'envoi — un fichier `pain.008`, son
-- `MsgId` (`ESS-<ULID de l'envoi>`), son empreinte. Il porte l'IBAN des
-- débiteurs en clair, comme `collection_batch.xml` : au registre RGPD.
--
-- `public.collection_test` garde une ligne par débit et gagne `file_id`.
--
-- REPRISE : chaque essai existant devient un envoi d'une ligne, de MÊME id,
-- avec son `message_id`, son `xml` et son `file_sha256` recopiés — le fichier
-- déjà déposé reste, octet pour octet, celui qu'on télécharge.
--
-- Colonnes mortes (CLAUDE.md §0 : pas de suppression sans ordre) :
-- `collection_test.message_id`, `xml`, `file_sha256` restent, rendues
-- nullables et plus écrites. `xml` est VIDÉE : l'IBAN n'est gardé qu'une fois,
-- dans l'envoi. Le `UNIQUE` de `message_id` tombe : deux lignes d'un envoi
-- partagent son `MsgId`. Le CHECK des références ne porte plus que
-- l'`EndToEndId` ; celui du `MsgId` passe sur l'envoi.
--
-- Retour arrière : prisma/rollback/20261118150000_l_envoi_d_essai.sql.

SET lock_timeout = '5s';

CREATE TABLE "public"."collection_test_file" (
    "id" TEXT NOT NULL,
    "legal_entity_id" TEXT NOT NULL,
    "scheme" "public"."SepaScheme" NOT NULL,
    "requested_collection_day" DATE NOT NULL,
    "message_id" TEXT NOT NULL,
    "xml" TEXT NOT NULL,
    "file_sha256" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_staff_id" TEXT NOT NULL,

    CONSTRAINT "collection_test_file_pkey" PRIMARY KEY ("id"),
    -- Le préfixe d'un essai, et la borne SEPA de 35.
    CONSTRAINT "collection_test_file_message_id_reference"
        CHECK ("message_id" LIKE 'ESS-%' AND char_length("message_id") <= 35)
);

CREATE UNIQUE INDEX "collection_test_file_message_id_key" ON "public"."collection_test_file"("message_id");

INSERT INTO "public"."collection_test_file" (
    "id", "legal_entity_id", "scheme", "requested_collection_day", "message_id",
    "xml", "file_sha256", "created_at", "created_by_staff_id"
)
SELECT "id", "legal_entity_id", "scheme", "requested_collection_day", "message_id",
       "xml", "file_sha256", "created_at", "created_by_staff_id"
  FROM "public"."collection_test";

ALTER TABLE "public"."collection_test" ADD COLUMN "file_id" TEXT;
UPDATE "public"."collection_test" SET "file_id" = "id";
ALTER TABLE "public"."collection_test" ALTER COLUMN "file_id" SET NOT NULL;

ALTER TABLE "public"."collection_test"
    ADD CONSTRAINT "collection_test_file_id_fkey" FOREIGN KEY ("file_id")
    REFERENCES "public"."collection_test_file"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "collection_test_file_id_idx" ON "public"."collection_test"("file_id");

ALTER TABLE "public"."collection_test" DROP CONSTRAINT "collection_test_references";
ALTER TABLE "public"."collection_test"
    ADD CONSTRAINT "collection_test_end_to_end_id_reference"
    CHECK ("end_to_end_id" LIKE 'ESS-%' AND char_length("end_to_end_id") <= 35);

DROP INDEX "public"."collection_test_message_id_key";

ALTER TABLE "public"."collection_test"
    ALTER COLUMN "message_id" DROP NOT NULL,
    ALTER COLUMN "xml" DROP NOT NULL,
    ALTER COLUMN "file_sha256" DROP NOT NULL;

UPDATE "public"."collection_test" SET "xml" = NULL;
