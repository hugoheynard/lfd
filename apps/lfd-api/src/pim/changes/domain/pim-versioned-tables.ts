/**
 * **Les tables du référentiel qui font monter le numéro `pim`**
 * (`documentation/caching-usage/plan-lectures-du-pim.md`, § 4.1) : toutes
 * celles que lisent la liste des produits, les référentiels et le détail
 * d'une fiche. Chacune porte trois déclencheurs d'instruction qui écrivent
 * dans `pim.pim_change` (migration `20261112210000_le_journal_du_referentiel`) ;
 * un e2e vérifie que la base et cette liste disent la même chose.
 *
 * Hors numéro, et c'est voulu : les révisions et la réémission (leur propre
 * écran), les opérations, la liaison des canaux. Le détail d'une fiche ne lit
 * pas `catalog_revision_item` — sa filiation lit `product` et
 * `product_variant` (`prisma-detachment-lineage.reader.ts`, vérifié le
 * 2026-11-12).
 *
 * Une table ajoutée ici sans sa migration fait échouer l'e2e ; une table qu'un
 * lecteur servi lit sans être ici fait échouer `pim-versioned-tables.spec.ts`.
 */
export const PIM_VERSIONED_TABLES = [
  "product",
  "product_variant",
  "product_editorial",
  "product_media",
  "product_packaging",
  "product_readiness",
  "product_context_tva",
  "product_ingredient",
  "variant_allergens",
  "nutrition_values",
  "category",
  "category_editorial",
  "category_media",
  "category_context_tva",
  "tva_rate",
  "sales_context",
  "appellation",
  "ingredient",
  "ingredient_allergen",
  "allergen_category",
  "allergen_entry",
  "order_time_limit",
  "sku_registry",
] as const;

export type PimVersionedTable = (typeof PIM_VERSIONED_TABLES)[number];
