import type { DeliveryBinFreeHalvesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BinDesk } from "../../channels/delivery/index.js";
import { GetShareableHalvesQuery } from "./get-shareable-halves.query.js";

/**
 * **Les moitiés libres partageables, depuis le colisage** (suite de K2b,
 * `colisage/plan-les-bacs-au-colisage.md` §7) — une LECTURE, servie par la
 * livraison derrière `BinDesk` : la règle d'adjacence (arrêts consécutifs d'une
 * tournée non partie) reste la sienne. Partager ensuite, c'est créer un
 * contenant `{ nature: "bin", partnerBinId }`.
 *
 * @throws {BinsNotDeclarableError} commande inconnue, annulée ou en retrait.
 */
@QueryHandler(GetShareableHalvesQuery)
export class GetShareableHalvesHandler implements IQueryHandler<
  GetShareableHalvesQuery,
  DeliveryBinFreeHalvesView
> {
  constructor(private readonly desk: BinDesk) {}

  async execute(query: GetShareableHalvesQuery): Promise<DeliveryBinFreeHalvesView> {
    return this.desk.freeHalves(query.orderId);
  }
}
