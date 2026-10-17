import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";
import type { SalesContextAdminView } from "@lfd/pim-contracts";

import { isRootContext } from "../domain/value-objects/bootstrap-contexts.js";
import { SalesContextRegistry } from "../domain/ports/sales-context.registry.js";
import { SalesContextRepository } from "../domain/ports/sales-context.repository.js";

export class ListSalesContextsQuery {}

/**
 * Le registre **complet**, hors-service compris, avec ce qui retient chaque
 * contexte. Une donnée qu'on ne peut pas voir n'est pas pilotable.
 */
@QueryHandler(ListSalesContextsQuery)
export class ListSalesContextsHandler implements IQueryHandler<
  ListSalesContextsQuery,
  SalesContextAdminView[]
> {
  constructor(
    private readonly contexts: SalesContextRegistry,
    private readonly repository: SalesContextRepository,
  ) {}

  async execute(): Promise<SalesContextAdminView[]> {
    const [contexts, usage] = await Promise.all([
      this.contexts.all(),
      this.repository.usageByKey(),
    ]);
    return contexts.map((context) => ({
      key: context.key,
      label: context.label,
      position: context.position,
      active: context.active,
      root: isRootContext(context.key),
      // Ce qui le RETIENT — l'écran doit le dire avant le geste, plutôt que de
      // laisser le refus l'apprendre après le clic.
      ratedBy: usage.get(context.key)?.ratedBy ?? 0,
    }));
  }
}
