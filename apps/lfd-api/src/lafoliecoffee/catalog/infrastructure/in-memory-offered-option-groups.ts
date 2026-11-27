import {
  optionGroupsOfferedTo,
  type CatalogOptionGroup,
  type OfferedOptionGroup,
} from "../domain/option-groups/catalog-option-groups.js";
import type { ShopAudience } from "../domain/ports/catalog.reader.js";
import { OfferedOptionGroupsReader } from "../domain/ports/offered-option-groups.reader.js";

/**
 * Les groupes d'options en mémoire, par SKU — pour les suites, et filtrés par
 * la MÊME règle que l'adaptateur Prisma (`optionGroupsOfferedTo`) : un double
 * qui ignorerait l'audience ne serait plus substituable à la source.
 */
export class InMemoryOfferedOptionGroups extends OfferedOptionGroupsReader {
  /** Les SKU demandés à chaque lecture — une suite vérifie qu'un panier sans option ne lit rien. */
  readonly reads: (readonly string[])[] = [];

  constructor(
    private readonly groups: ReadonlyMap<string, readonly CatalogOptionGroup[]> = new Map(),
  ) {
    super();
  }

  offeredFor(
    skus: readonly string[],
    audience: ShopAudience,
  ): Promise<ReadonlyMap<string, readonly OfferedOptionGroup[]>> {
    this.reads.push([...skus]);
    const offered = new Map<string, readonly OfferedOptionGroup[]>();
    for (const sku of skus) {
      const groups = optionGroupsOfferedTo(this.groups.get(sku) ?? [], audience);
      if (groups.length > 0) {
        offered.set(sku, groups);
      }
    }
    return Promise.resolve(offered);
  }
}
