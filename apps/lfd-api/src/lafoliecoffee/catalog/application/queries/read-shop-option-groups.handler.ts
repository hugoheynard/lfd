import type { OfferedOptionGroupView, ShopOptionGroupsView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { viewerAudience } from "../../domain/catalog-viewer.js";
import type { OfferedOptionGroup } from "../../domain/option-groups/catalog-option-groups.js";
import type { ShopAudience } from "../../domain/ports/catalog.reader.js";
import { ShelfOptionGroupsReader } from "../../domain/ports/shelf-option-groups.reader.js";
import { CatalogViewers } from "../catalog-viewers.service.js";
import { ReadShopOptionGroupsQuery } from "./read-shop-option-groups.query.js";

/**
 * Les options du rayon, **à la clientèle que le serveur résout** : un client
 * reconnu lit celle de sa société (la décision « pro ou pas » de
 * {@link CatalogViewers}, la même que son rayon et sa passation) ; un visiteur
 * lit la vitrine que sa route nomme. Un choix réservé à une autre clientèle
 * n'est jamais servi — « chaque audience, son information ».
 */
@QueryHandler(ReadShopOptionGroupsQuery)
export class ReadShopOptionGroupsHandler implements IQueryHandler<
  ReadShopOptionGroupsQuery,
  ShopOptionGroupsView
> {
  constructor(
    private readonly options: ShelfOptionGroupsReader,
    private readonly viewers: CatalogViewers,
  ) {}

  async execute({ caller }: ReadShopOptionGroupsQuery): Promise<ShopOptionGroupsView> {
    const audience: ShopAudience =
      caller.kind === "visitor"
        ? caller.audience
        : viewerAudience(await this.viewers.forCompany(caller.companyId));
    return shopOptionGroupsViewOf(await this.options.offeredTo(audience));
  }
}

/** La table du miroir, en vue : triée par SKU pour qu'une réponse se compare. */
export function shopOptionGroupsViewOf(
  offered: ReadonlyMap<string, readonly OfferedOptionGroup[]>,
): ShopOptionGroupsView {
  return {
    items: [...offered]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sku, groups]) => ({ sku, groups: groups.map(optionGroupViewOf) })),
  };
}

/** Un groupe proposé, recopié champ à champ : la vue ne prête pas l'objet du domaine. */
export function optionGroupViewOf(group: OfferedOptionGroup): OfferedOptionGroupView {
  return {
    id: group.id,
    name: group.name,
    choices: group.choices.map((choice) => ({ key: choice.key, label: choice.label })),
  };
}
