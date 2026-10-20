import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";

import { BrandLogoUnavailableError } from "../../../../../platform/brand/brand-logo-unavailable.error.js";
import { BrandLogoSource } from "../../../../../platform/brand/brand-logo.source.js";
import { pdfPages } from "../../../../../platform/pdf/__tests__/pdf-text.js";
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
import {
  FAMILY_ID,
  families,
  product,
  referential,
  variant,
} from "../../domain/__tests__/matrix-fixtures.js";
import {
  ExportAllergenMatrixCsvHandler,
  ExportAllergenMatrixCsvQuery,
} from "../export-allergen-matrix-csv.js";
import {
  ExportAllergenMatrixPdfHandler,
  ExportAllergenMatrixPdfQuery,
} from "../export-allergen-matrix-pdf.js";
import { GetAllergenMatrixHandler, GetAllergenMatrixQuery } from "../get-allergen-matrix.js";

/** Le vrai logo du dépôt, tendu par le port. */
class RepositoryLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.resolve(
      readFileSync(
        new URL("../../../../../../assets/logo-la-folie-coffee-noir-et-blanc.png", import.meta.url),
      ),
    );
  }
}

/** Un dossier `assets/` qui n'a pas été déployé. */
class MissingLogo extends BrandLogoSource {
  load(): Promise<Buffer> {
    return Promise.reject(new BrandLogoUnavailableError("assets/logo.png", null));
  }
}

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

describe("ExportAllergenMatrixPdfHandler", () => {
  it("imprime la matrice dans sa langue, nomme la famille filtrée, et la date de l'horloge", async () => {
    const handler = new ExportAllergenMatrixPdfHandler(
      new FixedReferential(referential()),
      new FixedSource(RECORDS),
      new RepositoryLogo(),
      new FixedClock(GENERATED_AT),
    );

    const file = await handler.execute(
      new ExportAllergenMatrixPdfQuery({ ...FILTERS, categoryId: FAMILY_ID }),
    );
    const text = pdfPages(Buffer.from(file.bytes)).join(" ").replace(/\s+/gu, " ");

    expect(file.fileName).toBe("matrice-allergenes-it.pdf");
    expect(text).toContain("Famiglia: Viennoiserie");
    expect(text).toContain("Generata il 1 gennaio 1970 alle 01:00");
    expect(text).toContain("Ultima modifica di una scheda: 1 gennaio 1970 alle 01:00");
  });

  it("laisse passer le refus du logo manquant", async () => {
    const handler = new ExportAllergenMatrixPdfHandler(
      new FixedReferential(referential()),
      new FixedSource(RECORDS),
      new MissingLogo(),
      new FixedClock(GENERATED_AT),
    );

    await expect(handler.execute(new ExportAllergenMatrixPdfQuery(FILTERS))).rejects.toBeInstanceOf(
      BrandLogoUnavailableError,
    );
  });
});
