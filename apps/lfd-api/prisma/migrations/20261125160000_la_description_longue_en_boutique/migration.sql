-- LA DESCRIPTION LONGUE EN BOUTIQUE — décision de Hugo, 2026-11-25.
--
-- La description longue d'une fiche du référentiel (`descriptionLong`) voyage
-- par le fait du catalogue jusqu'au commerce, et la fiche de la boutique
-- l'affiche sous la ligne courte. Additive : deux colonnes nullables — une
-- ligne existante se lit « rien d'écrit » jusqu'à la prochaine émission.
--
-- Le déclencheur des versions de `catalog_items` est redéfini pour LIRE les
-- deux colonnes : l'instantané du catalogue les lit, et une écriture sur
-- elles doit faire monter la version du contexte
-- (`lint:context-version-columns`).
--
-- Aucun droit accordé ici.

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "description" TEXT,
  ADD COLUMN "description_translations" JSONB;

DROP TRIGGER IF EXISTS "catalog_items_context_version" ON "public"."catalog_items";

CREATE TRIGGER "catalog_items_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "sku", "product_id", "product_sku", "name", "category_id", "price_millicents", "is_default", "position", "vat_rate_percent", "pro_price_per_kg_millicents", "public_price_per_kg_ttc_cents", "sale_unit", "weight_min_grams", "weight_step_grams", "pro_min_quantity", "public_min_quantity", "public_by_context", "allergens", "allergen_labels", "allergens_precautionary", "allergen_texts", "note", "name_translations", "note_translations", "image_url", "image_alt", "image_width", "image_height", "image_focal_x", "image_focal_y", "thumbnail_url", "thumbnail_alt", "thumbnail_width", "thumbnail_height", "thumbnail_focal_x", "thumbnail_focal_y", "order_limit_days_before", "order_limit_time", "order_limit_grace_minutes", "withdrawn_at", "operation_only", "variants_as_tiles", "product_name", "custom_recipe", "detached_from_sku", "detached_from_variant_sku", "audience", "public_review_pending", "pro_review_pending", "order_limit_staff_may_exceed", "description", "description_translations"
  ON "public"."catalog_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."catalog_version_bump"();
