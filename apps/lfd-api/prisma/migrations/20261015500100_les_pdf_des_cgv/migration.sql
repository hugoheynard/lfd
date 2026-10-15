-- LES PDF DE RÉFÉRENCE DES CGV (Hugo, 2026-10-15)
--
-- Plan `documentation/legal/plan-cgv-par-audience.md`, C3 et C3′. Le PDF est
-- le document juridique ; les paragraphes de `platform_content` en sont la
-- lecture en ligne. ADDITIVE : une table neuve, aucune donnée réécrite.
--
-- 🔴 JAMAIS ÉCRASÉ, ET LA BASE LE TIENT. Interdire plutôt que convenir :
--   · un `DELETE` est refusé ;
--   · un `UPDATE` n'est admis que s'il pose `superseded_at` alors qu'elle est
--     nulle, sans toucher à aucune autre colonne.
-- `TRUNCATE` n'est pas visé : il ne déclenche pas les déclencheurs de ligne,
-- et la remise à zéro des e2e en a besoin. En production, aucun chemin ne le
-- fait, et le runbook n'en connaît pas.
--
-- Un seul PDF en vigueur par texte : index unique partiel.

CREATE TABLE "public"."legal_document_files" (
    "id" TEXT NOT NULL,
    "document_key" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL,
    "uploaded_by_staff_id" TEXT NOT NULL,
    "superseded_at" TIMESTAMPTZ(3),

    CONSTRAINT "legal_document_files_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "legal_document_files_document_key_check"
      CHECK ("document_key" IN ('sales-terms', 'sales-terms-pro')),
    CONSTRAINT "legal_document_files_size_check" CHECK ("size_bytes" > 0),
    CONSTRAINT "legal_document_files_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$')
);

CREATE UNIQUE INDEX "legal_document_files_storage_key_key"
  ON "public"."legal_document_files"("storage_key");

CREATE INDEX "legal_document_files_document_key_uploaded_at_idx"
  ON "public"."legal_document_files"("document_key", "uploaded_at" DESC);

CREATE UNIQUE INDEX "legal_document_files_one_current"
  ON "public"."legal_document_files"("document_key")
  WHERE "superseded_at" IS NULL;

CREATE FUNCTION "public"."legal_document_files_never_rewritten"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un PDF de référence des CGV ne se supprime pas (legal_document_files %).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  IF OLD.superseded_at IS NOT NULL
     OR NEW.superseded_at IS NULL
     OR NEW.id IS DISTINCT FROM OLD.id
     OR NEW.document_key IS DISTINCT FROM OLD.document_key
     OR NEW.storage_key IS DISTINCT FROM OLD.storage_key
     OR NEW.sha256 IS DISTINCT FROM OLD.sha256
     OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
     OR NEW.uploaded_at IS DISTINCT FROM OLD.uploaded_at
     OR NEW.uploaded_by_staff_id IS DISTINCT FROM OLD.uploaded_by_staff_id THEN
    RAISE EXCEPTION 'Un PDF de référence des CGV ne se réécrit pas : seule la pose de superseded_at, une fois, est admise (legal_document_files %).', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "legal_document_files_never_rewritten"
  BEFORE UPDATE OR DELETE ON "public"."legal_document_files"
  FOR EACH ROW EXECUTE FUNCTION "public"."legal_document_files_never_rewritten"();
