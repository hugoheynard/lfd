-- LES VIGNETTES SANS OPTION — décision de Hugo, 2026-11-27
-- (`documentation/catalogue/plan-fin-du-sur-mesure.md`, V2).
--
-- Toute déclinaison en vente a sa vignette au rayon : l'option « Montrer
-- chaque déclinaison en vignette » n'existe plus, et le code déployé avant
-- celui-ci (V1) ne lit ni n'écrit plus ses deux colonnes. Les supprimer est
-- un ordre explicite de Hugo (CLAUDE.md § 0) ; la valeur perdue n'est plus
-- lue par personne.
--
-- Le déclencheur des versions de `catalog_items` est redéfini SANS la
-- colonne avant de la supprimer : un `UPDATE OF` qui nomme une colonne
-- interdit son `DROP`.
--
-- Aucun droit accordé ici.

DROP TRIGGER IF EXISTS "catalog_items_context_version" ON "public"."catalog_items";

CREATE TRIGGER "catalog_items_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "sku", "product_id", "product_sku", "name", "category_id", "price_millicents", "is_default", "position", "vat_rate_percent", "pro_price_per_kg_millicents", "public_price_per_kg_ttc_cents", "sale_unit", "weight_min_grams", "weight_step_grams", "pro_min_quantity", "public_min_quantity", "public_by_context", "allergens", "allergen_labels", "allergens_precautionary", "allergen_texts", "note", "name_translations", "note_translations", "image_url", "image_alt", "image_width", "image_height", "image_focal_x", "image_focal_y", "thumbnail_url", "thumbnail_alt", "thumbnail_width", "thumbnail_height", "thumbnail_focal_x", "thumbnail_focal_y", "order_limit_days_before", "order_limit_time", "order_limit_grace_minutes", "withdrawn_at", "operation_only", "product_name", "custom_recipe", "detached_from_sku", "detached_from_variant_sku", "audience", "public_review_pending", "pro_review_pending", "order_limit_staff_may_exceed", "description", "description_translations"
  ON "public"."catalog_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."catalog_version_bump"();

ALTER TABLE "public"."catalog_items" DROP COLUMN "variants_as_tiles";

ALTER TABLE "pim"."product" DROP COLUMN "variants_as_tiles";
