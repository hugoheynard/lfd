import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";
import type { ProductOptionGroupView } from "@lfd/pim-contracts";

import { OptionGroupOffers } from "../../../reference/product-options/domain/ports/option-group-offers.reader.js";
import { ProductOptionActivationsReader } from "../domain/ports/product-option-activations.reader.js";

/** Les groupes d'options actifs sur une fiche — l'onglet de la fiche. */
export class ListProductOptionGroupsQuery {
  constructor(readonly productId: string) {}
}

/**
 * Compose la lecture de la fiche (ses activations) et celle du référentiel
 * (le nom et l'archive de chaque groupe). Un groupe archivé reste listé,
 * marqué : l'activation tient, il ne se propose plus.
 */
@QueryHandler(ListProductOptionGroupsQuery)
export class ListProductOptionGroupsHandler implements IQueryHandler<
  ListProductOptionGroupsQuery,
  ProductOptionGroupView[]
> {
  constructor(
    private readonly activations: ProductOptionActivationsReader,
    private readonly offers: OptionGroupOffers,
  ) {}

  async execute(query: ListProductOptionGroupsQuery): Promise<ProductOptionGroupView[]> {
    const active = (await this.activations.activeOf([query.productId])).get(query.productId) ?? [];
    const groups = new Map(
      (await this.offers.describe(active.map((entry) => entry.groupId))).map((group) => [
        group.id,
        group,
      ]),
    );
    return active.flatMap((entry) => {
      const group = groups.get(entry.groupId);
      return group === undefined
        ? []
        : [
            {
              groupId: group.id,
              name: group.name,
              archived: group.archived,
              variantIds: entry.variantIds,
            },
          ];
    });
  }
}
