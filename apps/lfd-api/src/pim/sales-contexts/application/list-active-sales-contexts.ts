import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { SalesContextView } from "@lfd/pim-contracts";

import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";

export class ListActiveSalesContextsQuery {}

/**
 * Les contextes **en service**, en vue maigre — ce que tous les écrans lisent
 * pour dessiner les colonnes d'une matrice.
 *
 * Distinct de {@link ListSalesContextsQuery} : celle-là rend aussi les
 * contextes hors service et compte ce qui les retient, trois `groupBy` dont un
 * écran de matrice n'a que faire.
 */
@QueryHandler(ListActiveSalesContextsQuery)
export class ListActiveSalesContextsHandler implements IQueryHandler<
  ListActiveSalesContextsQuery,
  SalesContextView[]
> {
  constructor(private readonly contexts: SalesContextRegistry) {}

  async execute(): Promise<SalesContextView[]> {
    const contexts = await this.contexts.active();
    return contexts.map((context) => ({
      key: context.key,
      label: context.label,
      position: context.position,
    }));
  }
}
