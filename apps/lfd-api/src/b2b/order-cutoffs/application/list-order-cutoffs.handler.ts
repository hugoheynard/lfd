import type { OrderCutoffView } from "@lfd/contracts";
import { QueryHandler, type IQueryHandler } from "@nestjs/cqrs";

import { OrderCutoffRepository } from "../domain/order-cutoff.repository.js";
import { ListOrderCutoffsQuery } from "./list-order-cutoffs.query.js";

/**
 * Liste les **règles d'heure limite**. Aucune logique ici : la priorité entre
 * règles est une fonction pure du contrat (`resolveOrderCutoff`), et l'unicité
 * est tenue par la base. Le handler ne fait que passer le plat.
 */
@QueryHandler(ListOrderCutoffsQuery)
export class ListOrderCutoffsHandler implements IQueryHandler<
  ListOrderCutoffsQuery,
  readonly OrderCutoffView[]
> {
  constructor(private readonly repository: OrderCutoffRepository) {}

  async execute(): Promise<readonly OrderCutoffView[]> {
    return this.repository.list();
  }
}
