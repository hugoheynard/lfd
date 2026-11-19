-- LA LIMITE QUE L'ÉQUIPE PEUT PASSER — plan
-- documentation/limites-de-commande/plan-passer-outre-la-limite-produit.md, lot O1.
--
-- La limite de commande d'un produit porte une case « l'équipe peut passer
-- outre », du référentiel jusqu'au commerce. Additive : deux colonnes NOT NULL
-- DEFAULT false — toutes les limites existantes restent infranchissables.
--
-- Le déclencheur des versions de `catalog_items` est redéfini pour LIRE la
-- nouvelle colonne : l'instantané du catalogue la lit, et une écriture sur elle
-- doit faire monter la version du contexte (`lint:context-version-columns`).
--
-- Aucun droit accordé ici.

ALTER TABLE "pim"."order_time_limit"
  ADD COLUMN "staff_may_exceed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "public"."catalog_items"
  ADD COLUMN "order_limit_staff_may_exceed" BOOLEAN NOT NULL DEFAULT false;

DROP TRIGGER IF EXISTS "catalog_items_context_version" ON "public"."catalog_items";

CREATE TRIGGER "catalog_items_context_version"
  BEFORE INSERT OR DELETE OR UPDATE OF "sku", "product_id", "product_sku", "name", "category_id", "price_millicents", "is_default", "position", "vat_rate_percent", "pro_price_per_kg_millicents", "public_price_per_kg_ttc_cents", "sale_unit", "weight_min_grams", "weight_step_grams", "pro_min_quantity", "public_min_quantity", "public_by_context", "allergens", "allergen_labels", "allergens_precautionary", "allergen_texts", "note", "name_translations", "note_translations", "image_url", "image_alt", "image_width", "image_height", "image_focal_x", "image_focal_y", "thumbnail_url", "thumbnail_alt", "thumbnail_width", "thumbnail_height", "thumbnail_focal_x", "thumbnail_focal_y", "order_limit_days_before", "order_limit_time", "order_limit_grace_minutes", "withdrawn_at", "operation_only", "variants_as_tiles", "product_name", "custom_recipe", "detached_from_sku", "detached_from_variant_sku", "audience", "public_review_pending", "pro_review_pending", "order_limit_staff_may_exceed"
  ON "public"."catalog_items"
  FOR EACH STATEMENT EXECUTE FUNCTION "public"."catalog_version_bump"();
