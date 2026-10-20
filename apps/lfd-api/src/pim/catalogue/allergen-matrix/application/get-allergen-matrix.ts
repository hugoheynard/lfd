import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { AllergenMatrixView } from "@lfd/pim-contracts";

import { Clock } from "../../../../platform/time/clock.js";
import { AllergenCatalogueReader } from "../../../allergens/domain/ports/allergen-catalogue.reader.js";
import { familyChoices } from "../domain/family-choices.js";
import type { MatrixFilters } from "../domain/allergen-matrix.js";
import { AllergenMatrixSource } from "../domain/ports/allergen-matrix.source.js";
import { loadAllergenMatrix } from "./allergen-matrix-support.js";

/** La matrice des allergènes, filtrée — lot AM1 du plan. */
export class GetAllergenMatrixQuery {
  constructor(readonly filters: MatrixFilters) {}
}

/**
 * **Lit la matrice** : chaque déclinaison des fiches retenues, rangée par
 * `IncoProjector` sur le référentiel en base, en trois états par case et un
 * état par ligne. Datée par le `Clock` : c'est un instantané.
 */
@QueryHandler(GetAllergenMatrixQuery)
export class GetAllergenMatrixHandler implements IQueryHandler<
  GetAllergenMatrixQuery,
  AllergenMatrixView
> {
  constructor(
    private readonly referential: AllergenCatalogueReader,
    private readonly source: AllergenMatrixSource,
    private readonly clock: Clock,
  ) {}

  async execute({ filters }: GetAllergenMatrixQuery): Promise<AllergenMatrixView> {
    const { matrix, productIds, families } = await loadAllergenMatrix(
      this.referential,
      this.source,
      filters,
    );
    const lastModifiedAt = await this.source.lastModifiedAt(productIds);
    return {
      locale: filters.locale,
      scope: filters.scope,
      categoryId: filters.categoryId,
      includeUndeclared: filters.includeUndeclared,
      generatedAt: this.clock.now().toISOString(),
      lastModifiedAt: lastModifiedAt === null ? null : lastModifiedAt.toISOString(),
      mentionsTranslated: matrix.mentionsTranslated,
      columns: matrix.columns,
      families: matrix.families,
      familyChoices: familyChoices(families, filters.locale),
    };
  }
}
