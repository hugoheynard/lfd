import type { DeliveryBinFreeHalfView, DeliveryBinFreeHalvesView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { type DeliveryOrderFacts, DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import type { FreeHalfRow } from "../../domain/services/free-halves.js";
import { declarableReference } from "../delivery-loading-support.js";
import { freeHalvesOfOrder } from "../free-halves-support.js";
import { GetDeliveryBinFreeHalvesQuery } from "./get-delivery-bin-free-halves.query.js";

/**
 * **Les moitiés libres autour d'une commande** (lot 4 bis, v2-4) — ce que le
 * poste de colisage propose de partager, en dernier recours. Remplace la
 * recherche de l'écran « une requête par tournée ». Une LECTURE.
 *
 * La commande doit pouvoir recevoir des bacs, comme au partage : sinon, le
 * même refus.
 *
 * @throws {BinsNotDeclarableError}
 */
@QueryHandler(GetDeliveryBinFreeHalvesQuery)
export class GetDeliveryBinFreeHalvesHandler implements IQueryHandler<
  GetDeliveryBinFreeHalvesQuery,
  DeliveryBinFreeHalvesView
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryBinFreeHalvesQuery): Promise<DeliveryBinFreeHalvesView> {
    const reference = await declarableReference(this.orders, query.orderId);
    const { round, halves } = await freeHalvesOfOrder(this.loading, query.orderId);
    const facts = await this.orders.byIds([...new Set(halves.map((half) => half.bin.orderId))]);
    const byId = new Map(facts.map((fact) => [fact.orderId, fact]));
    return {
      orderId: query.orderId,
      reference,
      round,
      halves: halves
        .map((half) => freeHalfView(half, byId.get(half.bin.orderId)))
        .sort((a, b) => a.position - b.position || (a.binId < b.binId ? -1 : 1)),
    };
  }
}

function freeHalfView(
  { bin, stop, freeHalf }: FreeHalfRow,
  order: DeliveryOrderFacts | undefined,
): DeliveryBinFreeHalfView {
  return {
    binId: bin.id,
    code: bin.code,
    orderId: bin.orderId,
    // Une commande que le commerce ne connaît plus garde son identifiant nu.
    reference: order?.reference ?? bin.orderId,
    customerLabel: order?.customerLabel ?? "",
    position: stop.position,
    binTypeId: bin.binType.id,
    binTypeName: bin.binType.name,
    isotherm: bin.binType.isotherm,
    freeHalf,
  };
}
