import type { PurchaseScenariosView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PurchaseScenariosReader } from "../../domain/ports/purchase-scenarios.reader.js";
import { ListPurchaseScenariosQuery } from "./list-purchase-scenarios.query.js";

/** La liste de l'onglet Tableau — visible de toute l'équipe qui lit les tournées. */
@QueryHandler(ListPurchaseScenariosQuery)
export class ListPurchaseScenariosHandler implements IQueryHandler<
  ListPurchaseScenariosQuery,
  PurchaseScenariosView
> {
  constructor(private readonly reader: PurchaseScenariosReader) {}

  async execute({ includeArchived }: ListPurchaseScenariosQuery): Promise<PurchaseScenariosView> {
    return { scenarios: await this.reader.list(includeArchived) };
  }
}
