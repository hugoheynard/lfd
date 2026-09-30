import type { PurchaseVehicleCandidatesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { PurchaseVehicleCandidatesReader } from "../../domain/ports/purchase-vehicle-candidates.reader.js";
import { ListPurchaseVehicleCandidatesQuery } from "./list-purchase-vehicle-candidates.query.js";

/** La bibliothèque d'achat, côté véhicules : par nom, les archivés sur demande. */
@QueryHandler(ListPurchaseVehicleCandidatesQuery)
export class ListPurchaseVehicleCandidatesHandler implements IQueryHandler<
  ListPurchaseVehicleCandidatesQuery,
  PurchaseVehicleCandidatesView
> {
  constructor(private readonly reader: PurchaseVehicleCandidatesReader) {}

  async execute(query: ListPurchaseVehicleCandidatesQuery): Promise<PurchaseVehicleCandidatesView> {
    return { candidates: await this.reader.list(query.includeArchived) };
  }
}
