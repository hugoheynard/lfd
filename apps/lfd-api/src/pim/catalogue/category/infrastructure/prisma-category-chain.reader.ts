import { Injectable } from "@nestjs/common";

import { PimPrismaService } from "../../../infra/database/pim-prisma.service.js";
import { readLocalizedColumn } from "../../../shared/json-readers.js";
import {
  CategoryChainReader,
  type CategoryChainLink,
} from "../domain/ports/category-chain.reader.js";

/** Un arbre de familles n'a pas cette profondeur ; une boucle en base, si. */
const MAX_CATEGORY_DEPTH = 32;

interface CategoryRow {
  readonly id: string;
  readonly name: unknown;
  readonly parentId: string | null;
}

/**
 * L'adaptateur, en UNE requête (CTE récursive) plutôt qu'une par ancêtre. La
 * profondeur est bornée en SQL, et la chaîne s'arrête au premier identifiant
 * déjà vu.
 */
@Injectable()
export class PrismaCategoryChainReader extends CategoryChainReader {
  constructor(private readonly prisma: PimPrismaService) {
    super();
  }

  async chainOf(categoryId: string): Promise<readonly CategoryChainLink[]> {
    const rows = await this.prisma.$queryRaw<CategoryRow[]>`
      WITH RECURSIVE chain AS (
        SELECT id, name, parent_id, 1 AS depth FROM pim.category WHERE id = ${categoryId}
        UNION ALL
        SELECT c.id, c.name, c.parent_id, chain.depth + 1
          FROM pim.category c JOIN chain ON c.id = chain.parent_id
         WHERE chain.depth < ${MAX_CATEGORY_DEPTH}
      )
      SELECT id, name, parent_id AS "parentId" FROM chain ORDER BY depth`;
    const chain: CategoryChainLink[] = [];
    const seen = new Set<string>();
    for (const row of rows) {
      if (seen.has(row.id)) {
        break;
      }
      seen.add(row.id);
      chain.push({ id: row.id, name: readLocalizedColumn(row.name, "category.name") });
    }
    return chain;
  }
}
