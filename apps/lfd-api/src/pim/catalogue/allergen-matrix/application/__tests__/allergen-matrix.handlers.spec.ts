import { FixedClock } from "../../../../../platform/time/fixed-clock.js";
import {
  AllergenCatalogueReader,
  type AllergenCategoryView,
} from "../../../../allergens/domain/ports/allergen-catalogue.reader.js";
import type { ProductRecord } from "../../../product/domain/ports/product.repository.js";
import type { MatrixFilters } from "../../domain/allergen-matrix.js";
import {
  AllergenMatrixSource,
  type MatrixFamilyRecord,
} from "../../domain/ports/allergen-matrix.source.js";
import { families, product, referential, variant } from "../../domain/__tests__/matrix-fixtures.js";
import {
  ExportAllergenMatrixCsvHandler,
  ExportAllergenMatrixCsvQuery,
} from "../export-allergen-matrix-csv.js";
import { GetAllergenMatrixHandler, GetAllergenMatrixQuery } from "../get-allergen-matrix.js";

/** Le référentiel, servi tel quel. */
class FixedReferential extends AllergenCatalogueReader {
  constructor(private readonly categories: readonly AllergenCategoryView[]) {
    super();
  }
  catalogue(): Promise<readonly AllergenCategoryView[]> {
    return Promise.resolve(this.categories);
  }
  knownCodes(): Promise<ReadonlySet<string>> {
    return Promise.resolve(
      new Set(this.categories.flatMap((category) => category.entries.map((entry) => entry.code))),
    );
  }
}

/** Les fiches et les familles, servies telles quelles. */
class FixedSource extends AllergenMatrixSource {
  constructor(private readonly records: readonly ProductRecord[]) {
    super();
  }
  products(): Promise<readonly ProductRecord[]> {
    return Promise.resolve(this.records);
  }
  families(): Promise<readonly MatrixFamilyRecord[]> {
    return Promise.resolve(families());
  }
  lastModifiedAt(productIds: readonly string[]): Promise<Date | null> {
    return Promise.resolve(productIds.length === 0 ? null : LAST_MODIFIED_AT);
  }
}

/** L'instant de la génération : il n'est comparé qu'à lui-même. */
const GENERATED_AT = new Date(0);
/** L'instant que la source rend : il ne traverse que tel quel. */
const LAST_MODIFIED_AT = new Date(1_000);

const FILTERS: MatrixFilters = {
  locale: "it",
  scope: "published",
  categoryId: null,
  includeUndeclared: true,
};

const RECORDS = [
  product("p", {
    variants: [variant("p_v1", { allergenSheet: { declared: ["UW"], mayContain: [] } })],
  }),
];

describe("GetAllergenMatrixHandler", () => {
  it("rend la matrice datée par l'horloge, avec les filtres qu'il a appliqués", async () => {
    const handler = new GetAllergenMatrixHandler(
      new FixedReferential(referential()),
      new FixedSource(RECORDS),
      new FixedClock(GENERATED_AT),
    );

    const view = await handler.execute(new GetAllergenMatrixQuery(FILTERS));

    expect(view).toMatchObject({
      locale: "it",
      scope: "published",
      categoryId: null,
      includeUndeclared: true,
      generatedAt: GENERATED_AT.toISOString(),
      lastModifiedAt: LAST_MODIFIED_AT.toISOString(),
      mentionsTranslated: true,
    });
    expect(view.families[0]?.name).toBe("Viennoiserie");
    expect(view.families[0]?.rows[0]?.cells[0]).toEqual({
      category: "gluten",
      presence: "contains",
      contains: ["Blé (it)"],
      traces: [],
    });
  });
});

describe("ExportAllergenMatrixCsvHandler", () => {
  it("rend le tableur et un nom de fichier qui dit la langue", async () => {
    const handler = new ExportAllergenMatrixCsvHandler(
      new FixedReferential(referential()),
      new FixedSource(RECORDS),
    );

    const file = await handler.execute(new ExportAllergenMatrixCsvQuery(FILTERS));

    expect(file.fileName).toBe("matrice-allergenes-it.csv");
    expect(file.csv).toContain('"Cereali contenenti glutine"');
    expect(file.csv).toContain('"contiene : Blé (it)"');
    expect(file.csv).toContain('"Altri"');
  });
});
