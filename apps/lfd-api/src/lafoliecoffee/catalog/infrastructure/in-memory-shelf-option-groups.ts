import {
  optionGroupsOfferedTo,
  type CatalogOptionGroup,
  type OfferedOptionGroup,
} from "../domain/option-groups/catalog-option-groups.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";
import { ShelfOptionGroupsReader } from "../domain/ports/shelf-option-groups.reader.js";

/**
 * Le miroir des options en mémoire, pour les suites — filtré par la MÊME
 * règle que l'adaptateur Prisma (`optionGroupsOfferedTo`) : un double qui
 * ignorerait l'audience ne serait plus substituable à la source.
 */
export class InMemoryShelfOptionGroups extends ShelfOptionGroupsReader {
  /** Les audiences lues, dans l'ordre — une suite vérifie celle que le serveur a résolue. */
  readonly audiences: ShopAudience[] = [];

  constructor(
    private readonly groups: ReadonlyMap<string, readonly CatalogOptionGroup[]> = new Map(),
  ) {
    super();
  }

  offeredTo(audience: ShopAudience): Promise<ReadonlyMap<string, readonly OfferedOptionGroup[]>> {
    this.audiences.push(audience);
    const offered = new Map<string, readonly OfferedOptionGroup[]>();
    for (const [sku, groups] of this.groups) {
      const kept = optionGroupsOfferedTo(groups, audience);
      if (kept.length > 0) {
        offered.set(sku, kept);
      }
    }
    return Promise.resolve(offered);
  }
}
