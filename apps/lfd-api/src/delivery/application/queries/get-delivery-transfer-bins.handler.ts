import type { DeliveryTransferBinsView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { InternalTransferNotFoundError } from "../../domain/errors/internal-transfer-errors.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { binContextOf } from "../bin-context.js";
import { binViewsOf } from "../delivery-loading-view.js";
import { GetDeliveryTransferBinsQuery } from "./get-delivery-transfer-bins.query.js";

/**
 * Les bacs d'un transfert interne, annulés compris (lot T3, Q-T4 révisée) —
 * ce que sert la page d'étiquettes du transfert. Une LECTURE : réimprimer ne
 * crée rien.
 *
 * @throws {InternalTransferNotFoundError}
 */
@QueryHandler(GetDeliveryTransferBinsQuery)
export class GetDeliveryTransferBinsHandler implements IQueryHandler<
  GetDeliveryTransferBinsQuery,
  DeliveryTransferBinsView
> {
  constructor(
    private readonly transfers: InternalTransfersReader,
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
  ) {}

  async execute(query: GetDeliveryTransferBinsQuery): Promise<DeliveryTransferBinsView> {
    const transfer = await this.transfers.byId(query.transferId);
    if (transfer === null) {
      throw new InternalTransferNotFoundError(query.transferId);
    }
    const bins = await this.loading.transferBins(transfer.id);
    const context = await binContextOf(this.loading, this.orders, bins);
    return {
      transferId: transfer.id,
      siteLabel: transfer.siteLabel,
      day: transfer.serviceDay,
      bins: binViewsOf(bins, context),
    };
  }
}
