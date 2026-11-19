import { Injectable } from "@nestjs/common";

import { AllCategoriesReader } from "../../category/domain/ports/all-categories.reader.js";
import { AllergenFreshnessReader } from "../../product/domain/ports/allergen-freshness.reader.js";
import { AllergenListingReader } from "../../product/domain/ports/allergen-listing.reader.js";
import {
  AllergenMatrixSource,
  type MatrixFamilyRecord,
  type MatrixProductRecord,
} from "../domain/ports/allergen-matrix.source.js";

/**
 * L'adaptateur, qui ne lit aucune table : il compose ce que la fiche publie
 * (les fiches vivantes et leurs allergènes résolus, la date de leur dernière
 * mise à jour) et ce que la famille publie (toutes les familles).
 */
@Injectable()
export class RepositoryAllergenMatrixSource extends AllergenMatrixSource {
  constructor(
    private readonly categories: AllCategoriesReader,
    private readonly listing: AllergenListingReader,
    private readonly freshness: AllergenFreshnessReader,
  ) {
    super();
  }

  products(): Promise<readonly MatrixProductRecord[]> {
    return this.listing.liveProducts();
  }

  async families(): Promise<readonly MatrixFamilyRecord[]> {
    const all = await this.categories.all();
    return all.map((category) => ({
      id: category.id,
      name: category.name,
      parentId: category.parentId,
      position: category.position,
      isArchived: category.isArchived,
    }));
  }

  lastModifiedAt(productIds: readonly string[]): Promise<Date | null> {
    return this.freshness.lastModifiedAt(productIds);
  }
}
