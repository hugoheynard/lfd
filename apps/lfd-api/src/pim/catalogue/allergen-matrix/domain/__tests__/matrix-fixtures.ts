import type { AllergenCategoryView } from "../../../../allergens/domain/ports/allergen-catalogue.reader.js";
import type { IncoCategory } from "../../../../allergens/domain/value-objects/inco-category.js";
import { Product, type ProductSnapshot } from "../../../product/domain/entities/product.js";
import type { VariantSnapshot } from "../../../product/domain/entities/variant.js";
import type { ProductRecord } from "../../../product/domain/ports/product.repository.js";
import type { MatrixFamilyRecord } from "../ports/allergen-matrix.source.js";

/**
 * Le décor des suites de la matrice : un référentiel réduit à ce qui
 * distingue les sorts d'un code, et des fiches passées par l'AGRÉGAT
 * (`Product.reconstitute(...).snapshot()`) — c'est lui qui résout
 * l'alignement, et un instantané forgé ne l'éprouverait pas.
 */

interface CategoryOptions {
  readonly label?: string;
  readonly it?: string;
  readonly archivedAt?: Date | null;
  readonly entryNames?: Readonly<Record<string, string>>;
  /** Semée et verrouillée ; une catégorie maison ne l'est jamais. */
  readonly official?: boolean;
}

function category(
  key: string,
  position: number,
  incoCategory: IncoCategory | null,
  codes: readonly string[],
  over: CategoryOptions = {},
): AllergenCategoryView {
  const label = over.label ?? key;
  return {
    id: `alg_cat_${key}`,
    key,
    name: over.it === undefined ? { fr: label, en: key } : { fr: label, en: key, it: over.it },
    incoCategory,
    official: over.official ?? true,
    position,
    archivedAt: over.archivedAt ?? null,
    entries: codes.map((code) => {
      const fr = over.entryNames?.[code] ?? code;
      return {
        id: `alg_${code}`,
        code,
        name: { fr, it: `${fr} (it)` },
        official: over.official ?? true,
        archivedAt: null,
      };
    }),
  };
}

/** Une instance d'archivage : sa valeur n'est jamais comparée à l'horloge. */
const SOME_ARCHIVAL = new Date(0);

export function referential(): readonly AllergenCategoryView[] {
  return [
    category("gluten", 1, "gluten", ["UW", "NR"], {
      label: "Céréales contenant du gluten",
      it: "Cereali contenenti glutine",
      entryNames: { UW: "Blé", NR: "Seigle" },
    }),
    category("milk", 2, "milk", ["ML"], { label: "Lait", it: "Latte" }),
    category("tree_nuts", 3, "tree_nuts", ["SA", "SH"], {
      label: "Fruits à coque",
      it: "Frutta a guscio",
      entryNames: { SA: "Amandes", SH: "Noisettes" },
    }),
    category("non_eu", 4, null, ["BWD"], {
      label: "Hors obligation UE",
      entryNames: { BWD: "Sarrasin" },
    }),
    // Maison, en service : son code se NOMME dans « Autres », sans code affiché.
    category("maison", 5, null, ["PERSO"], {
      official: false,
      entryNames: { PERSO: "Lupin doux" },
    }),
    // Maison, ARCHIVÉE : son code reste reconnu, il ne fait aucune colonne.
    category("maison-retiree", 6, null, ["MAISON"], {
      official: false,
      archivedAt: SOME_ARCHIVAL,
    }),
  ];
}

export const FAMILY_ID = "cat_viennoiseries";
export const OTHER_FAMILY_ID = "cat_pains";
export const SUB_FAMILY_ID = "cat_pains_speciaux";

export function families(): readonly MatrixFamilyRecord[] {
  return [
    { id: OTHER_FAMILY_ID, name: { fr: "Pains" }, parentId: null, position: 2, isArchived: false },
    {
      id: SUB_FAMILY_ID,
      name: { fr: "Pains spéciaux" },
      parentId: OTHER_FAMILY_ID,
      position: 0,
      isArchived: false,
    },
    {
      id: FAMILY_ID,
      name: { fr: "Viennoiseries", it: "Viennoiserie" },
      parentId: null,
      position: 1,
      isArchived: false,
    },
  ];
}

export function variant(id: string, over: Partial<VariantSnapshot> = {}): VariantSnapshot {
  return {
    id,
    sku: `SKU-${id}`,
    name: { fr: `Déclinaison ${id}` },
    options: {},
    isDefault: true,
    isDiscontinued: false,
    position: 0,
    priceCents: null,
    weightGrams: null,
    proPriceMillicents: null,
    regulatoryFollowsDefault: false,
    nutritionFollowsDefault: false,
    pricingFollowsDefault: false,
    allergenSheet: null,
    nutrition: null,
    ...over,
  };
}

/** Une fiche, résolue par l'agrégat. */
export function product(id: string, over: Partial<ProductSnapshot> = {}): ProductRecord {
  const snapshot: ProductSnapshot = {
    id,
    sku: `P-${id}`,
    name: { fr: `Produit ${id}` },
    slug: { fr: `produit-${id}` },
    kind: "daily",
    categoryId: FAMILY_ID,
    status: "published",
    variants: [variant(`${id}_v1`)],
    vatByContext: {},
    operationOnly: false,
    requiresCold: false,
    audience: null,
    ...over,
  };
  return Product.reconstitute(snapshot).snapshot();
}
