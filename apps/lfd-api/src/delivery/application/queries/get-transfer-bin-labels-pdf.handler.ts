import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { DeliveryOrdersReader } from "../../channels/commerce/index.js";
import { InternalTransferNotFoundError } from "../../domain/errors/internal-transfer-errors.js";
import { DeliveryLoadingReader } from "../../domain/ports/delivery-loading.reader.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { binContextOf } from "../bin-context.js";
import { type BinLabelsFile, BinLabelsPrint } from "../bin-labels-print.js";
import { binViewsOf } from "../delivery-loading-view.js";
import { GetTransferBinLabelsPdfQuery } from "./get-transfer-bin-labels-pdf.query.js";

/**
 * **Les étiquettes des bacs d'un transfert interne, en PDF** (2026-10-25) —
 * titrées « Transfert <site> » : l'écran écrivait « → <site> », et la
 * flèche n'existe pas dans les polices du papier. Ni tournée ni couleur :
 * un transfert mêle des clientèles, comme sur la page qu'il remplace.
 *
 * @throws {InternalTransferNotFoundError}
 * @throws {BinLabelsNothingToPrintError} aucun bac vivant à imprimer.
 */
@QueryHandler(GetTransferBinLabelsPdfQuery)
export class GetTransferBinLabelsPdfHandler implements IQueryHandler<
  GetTransferBinLabelsPdfQuery,
  BinLabelsFile
> {
  constructor(
    private readonly transfers: InternalTransfersReader,
    private readonly loading: DeliveryLoadingReader,
    private readonly orders: DeliveryOrdersReader,
    private readonly printer: BinLabelsPrint,
  ) {}

  async execute(query: GetTransferBinLabelsPdfQuery): Promise<BinLabelsFile> {
    const transfer = await this.transfers.byId(query.transferId);
    if (transfer === null) {
      throw new InternalTransferNotFoundError(query.transferId);
    }
    const bins = await this.loading.transferBins(transfer.id);
    const context = await binContextOf(this.loading, this.orders, bins);
    return this.printer.print(
      {
        title: `Transfert ${transfer.siteLabel}`,
        bins: binViewsOf(bins, context),
        round: null,
        color: null,
      },
      query.binIds,
    );
  }
}
