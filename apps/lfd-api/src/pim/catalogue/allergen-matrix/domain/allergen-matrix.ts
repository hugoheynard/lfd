import { ALLERGEN_MATRIX_WORDING, readLocalized, type Locale } from "@lfd/pim-contracts";

import type { AllergenCategoryView } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { IncoProjector } from "../../../allergens/domain/services/inco-projector.js";
import type { IncoCategory } from "../../../allergens/domain/value-objects/inco-category.js";
import { CategoryNotFoundError } from "../../category/domain/errors/category-errors.js";
import type {
  ProductRecord,
  VariantRecord,
} from "../../product/domain/ports/product.repository.js";
import type { LocalizedText } from "../../shared/domain/value-objects/localized-text.js";
import {
  judgeDeclaration,
  NAMED_CATEGORIES,
  type MatrixCell,
  type MatrixOthersCell,
  type MatrixRanking,
  type MatrixRowState,
} from "./matrix-row.js";
import type { MatrixFamilyRecord } from "./ports/allergen-matrix.source.js";

export type MatrixScope = "published" | "all";

export interface MatrixFilters {
  readonly locale: Locale;
  readonly scope: MatrixScope;
  readonly categoryId: string | null;
  readonly includeUndeclared: boolean;
}

export interface MatrixColumn {
  readonly category: IncoCategory;
  readonly label: string;
  /** Le nom courant de l'en-tête ; `label` quand le dictionnaire n'en a pas. */
  readonly header: string;
}

export interface MatrixRow {
  readonly productId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productName: string;
  readonly variantName: string | null;
  readonly state: MatrixRowState;
  readonly cells: readonly MatrixCell[];
  readonly others: MatrixOthersCell | null;
}

export interface MatrixFamily {
  readonly id: string;
  readonly name: string;
  readonly rows: readonly MatrixRow[];
}

export interface AllergenMatrix {
  readonly columns: readonly MatrixColumn[];
  readonly families: readonly MatrixFamily[];
  readonly mentionsTranslated: boolean;
}

export interface MatrixInput {
  readonly referential: readonly AllergenCategoryView[];
  readonly products: readonly ProductRecord[];
  readonly families: readonly MatrixFamilyRecord[];
  readonly filters: MatrixFilters;
}

/**
 * **La matrice des allergènes** — déclinaisons × catégories de l'annexe II,
 * pure (plan `documentation/pim/plan-matrice-des-allergenes.md`, lot AM1).
 *
 * Les colonnes sont les catégories que le référentiel ADMINISTRABLE range dans
 * l'annexe II, dans son ordre (`position`) — jamais la table figée. Les
 * archivées n'en sont pas ; aucune catégorie de l'annexe ne s'archive
 * aujourd'hui (l'agrégat et le trigger le refusent), le filtre tient le jour
 * où ce ne serait plus vrai.
 *
 * @throws {CategoryNotFoundError} le filtre, ou une fiche, vise une famille
 *   inconnue — un rattachement cassé ne se range pas en silence.
 */
export function buildAllergenMatrix(input: MatrixInput): AllergenMatrix {
  const { filters } = input;
  const columnViews = input.referential.filter(
    (category) => category.incoCategory !== null && category.archivedAt === null,
  );
  const ranking: MatrixRanking = {
    projector: IncoProjector.from(input.referential, filters.locale),
    columns: columnViews.flatMap((category) =>
      category.incoCategory === null ? [] : [category.incoCategory],
    ),
    entryNames: entryNamesOf(input.referential),
    locale: filters.locale,
  };
  const shortNames = ALLERGEN_MATRIX_WORDING[filters.locale].columnShortNames;
  const columns = columnViews.flatMap((category) => {
    if (category.incoCategory === null) {
      return [];
    }
    const label = readLocalized(category.name, filters.locale);
    return [
      {
        category: category.incoCategory,
        label,
        header: shortNames[category.incoCategory] ?? label,
      },
    ];
  });
  return {
    columns,
    families: familiesOf(input, ranking),
    mentionsTranslated: mentionsTranslated(columnViews, filters.locale),
  };
}

function entryNamesOf(referential: readonly AllergenCategoryView[]): Map<string, LocalizedText> {
  const names = new Map<string, LocalizedText>();
  for (const category of referential) {
    for (const entry of category.entries) {
      names.set(entry.code, entry.name);
    }
  }
  return names;
}

/** Une mention de la matrice manque-t-elle dans la langue demandée ? (Q4) */
function mentionsTranslated(columns: readonly AllergenCategoryView[], locale: Locale): boolean {
  return columns.every(
    (category) =>
      category.name[locale] !== undefined &&
      (category.incoCategory === null ||
        !NAMED_CATEGORIES.has(category.incoCategory) ||
        category.entries.every((entry) => entry.name[locale] !== undefined)),
  );
}

function inScope(
  product: ProductRecord,
  filters: MatrixFilters,
  wanted: ReadonlySet<string> | null,
): boolean {
  const statusOk = filters.scope === "all" || product.status === "published";
  const familyOk = wanted === null || wanted.has(product.categoryId);
  return product.status !== "archived" && statusOk && familyOk;
}

/** La famille demandée ET toutes ses descendantes ; `null` = pas de filtre. */
function familyTree(
  rootId: string | null,
  families: readonly MatrixFamilyRecord[],
): ReadonlySet<string> | null {
  if (rootId === null) {
    return null;
  }
  const tree = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const family of families) {
      if (family.parentId !== null && tree.has(family.parentId) && !tree.has(family.id)) {
        tree.add(family.id);
        grew = true;
      }
    }
  }
  return tree;
}

function familiesOf(input: MatrixInput, ranking: MatrixRanking): MatrixFamily[] {
  const { filters } = input;
  const byId = new Map(input.families.map((family) => [family.id, family]));
  const grouped = new Map<string, MatrixRow[]>();
  const products = retainedProducts(input).sort((a, b) =>
    nameOf(a.name, filters.locale).localeCompare(nameOf(b.name, filters.locale)),
  );
  for (const product of products) {
    if (!byId.has(product.categoryId)) {
      throw new CategoryNotFoundError(product.categoryId);
    }
    const rows = rowsOf(product, ranking).filter(
      (row) => filters.includeUndeclared || row.state !== "not_declared",
    );
    grouped.set(product.categoryId, [...(grouped.get(product.categoryId) ?? []), ...rows]);
  }
  return [...grouped.entries()]
    .filter(([, rows]) => rows.length > 0)
    .flatMap(([id, rows]) => {
      const family = byId.get(id);
      return family === undefined ? [] : [{ family, rows }];
    })
    .sort((a, b) => a.family.position - b.family.position || a.family.id.localeCompare(b.family.id))
    .map(({ family, rows }) => ({
      id: family.id,
      name: nameOf(family.name, filters.locale),
      rows,
    }));
}

/**
 * Les fiches que la matrice retient — exporté pour que l'application date la
 * matrice sur CES fiches-là, et pas sur un second filtre écrit à côté.
 *
 * @throws {CategoryNotFoundError} le filtre vise une famille inconnue.
 */
export function retainedProducts(input: MatrixInput): ProductRecord[] {
  const { filters } = input;
  if (filters.categoryId !== null && !input.families.some((f) => f.id === filters.categoryId)) {
    throw new CategoryNotFoundError(filters.categoryId);
  }
  const wanted = familyTree(filters.categoryId, input.families);
  return input.products.filter((product) => inScope(product, filters, wanted));
}

function nameOf(text: LocalizedText, locale: Locale): string {
  return readLocalized(text, locale);
}

/** Q1 : une ligne par déclinaison, dans l'ordre de la fiche. */
function rowsOf(product: ProductRecord, ranking: MatrixRanking): MatrixRow[] {
  const several = product.variants.length > 1;
  // Une déclinaison arrêtée ne se vend plus : elle sort de la matrice
  // (décision de Hugo, 2026-10-20, Q5 du plan).
  return product.variants
    .filter((variant) => !variant.isDiscontinued)
    .sort((a, b) => a.position - b.position)
    .map((variant: VariantRecord) => {
      const judgement = judgeDeclaration(variant.allergenSheet, ranking);
      return {
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        productName: nameOf(product.name, ranking.locale),
        variantName: several ? nameOf(variant.name, ranking.locale) : null,
        state: judgement.state,
        cells: judgement.cells,
        others: judgement.others,
      };
    });
}
