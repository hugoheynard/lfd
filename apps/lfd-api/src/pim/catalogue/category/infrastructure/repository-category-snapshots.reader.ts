import { Injectable } from "@nestjs/common";

import type { CategorySnapshot } from "../domain/entities/category.js";
import { CategoryRepository } from "../domain/ports/category.repository.js";
import { CategorySnapshotsReader } from "../domain/ports/category-snapshots.reader.js";

/** L'adaptateur, **par le dépôt** : il suit la transaction ambiante. */
@Injectable()
export class RepositoryCategorySnapshotsReader extends CategorySnapshotsReader {
  constructor(private readonly categories: CategoryRepository) {
    super();
  }

  async byIds(ids: readonly string[]): Promise<CategorySnapshot[]> {
    const found: CategorySnapshot[] = [];
    for (const id of ids) {
      const category = await this.categories.findById(id);
      if (category !== null) {
        found.push(category.snapshot());
      }
    }
    return found;
  }
}
