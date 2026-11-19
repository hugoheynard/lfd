import { Injectable } from "@nestjs/common";

import { CategoryRepository } from "../domain/ports/category.repository.js";
import { FamilyVatReader } from "../domain/ports/family-vat.reader.js";

/**
 * L'adaptateur, **par le dépôt des familles** : la famille se relit par le
 * mapper qui l'écrit, et ses taux sont ceux que l'agrégat porte.
 */
@Injectable()
export class RepositoryFamilyVatReader extends FamilyVatReader {
  constructor(private readonly categories: CategoryRepository) {
    super();
  }

  async vatOf(categoryId: string): Promise<Readonly<Record<string, string>> | undefined> {
    const category = await this.categories.findById(categoryId);
    return category === null ? undefined : category.vatByContext;
  }
}
