import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { BinLabelColorsReader, DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { binContextOf } from "../bin-context.js";
import { type BinLabelsFile, BinLabelsPrint } from "../bin-labels-print.js";
import { orderBinsView } from "../delivery-loading-view.js";
import { orderStopOf, roundPlaceView } from "../order-round-place.js";
import { GetOrderBinLabelsPdfQuery } from "./get-order-bin-labels-pdf.query.js";

/**
 * **Les étiquettes des bacs d'une commande, en PDF** (2026-10-25, Hugo :
 * « imprimer l'étiquette devrait donner un beau PDF ») — les mêmes lectures
 * que la liste des bacs (`GetDeliveryOrderBinsHandler`), plus la couleur de
 * la commande, lue au commerce au moment du tirage. Une LECTURE : réimprimer
 * ne crée rien, n'écrit rien.
 *
 * @throws {BinLabelsNothingToPrintError} aucun bac vivant à imprimer.
 */
@QueryHandler(GetOrderBinLabelsPdfQuery)
export class GetOrderBinLabelsPdfHandler implements IQueryHandler<
  GetOrderBinLabelsPdfQuery,
  BinLabelsFile
> {
  constructor(
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly colors: BinLabelColorsReader,
    private readonly printer: BinLabelsPrint,
  ) {}

  async execute(query: GetOrderBinLabelsPdfQuery): Promise<BinLabelsFile> {
    const bins = await this.loading.orderBins(query.orderId);
    const [context, stop, color] = await Promise.all([
      binContextOf(this.loading, this.orders, bins, [query.orderId]),
      orderStopOf(this.loading, query.orderId),
      this.colors.colorOf(query.orderId),
    ]);
    const view = orderBinsView(query.orderId, bins, context);
    return this.printer.print(
      { title: view.reference, bins: view.bins, round: roundPlaceView(stop), color },
      query.binIds,
    );
  }
}
