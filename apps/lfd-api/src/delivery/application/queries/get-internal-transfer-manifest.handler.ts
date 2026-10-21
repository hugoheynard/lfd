import type { InternalTransferManifestView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { TransferOrderContentsReader } from "../../channels/commerce/index.js";
import { InternalTransferNotFoundError } from "../../domain/errors/internal-transfer-errors.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { transferClientelesOf, withClienteles } from "../transfer-categories.js";
import { itemContentsOf } from "../transfer-contents.js";
import { GetInternalTransferManifestQuery } from "./get-internal-transfer-manifest.query.js";
import { TransferResupplyContents } from "../transfer-resupply-contents.js";

/**
 * **Ce que transporte un transfert interne** (décision de Hugo du
 * 2026-10-13 ; plan du transfert interne, lot T1). Prévu : le contenu de ses
 * commandes est lu au commerce à l'instant, celui de ses réassorts dans leur
 * copie figée à l'arrêt — l'emballé si la fiche du colisage est close, sinon
 * le demandé (lot R3c du réassort). Parti : le manifeste FIGÉ au
 * départ fait foi, et le commerce n'est pas relu — une commande modifiée
 * depuis ne change pas ce qui est dans le camion.
 *
 * @throws {InternalTransferNotFoundError}
 */
@QueryHandler(GetInternalTransferManifestQuery)
export class GetInternalTransferManifestHandler implements IQueryHandler<
  GetInternalTransferManifestQuery,
  InternalTransferManifestView
> {
  constructor(
    private readonly transfers: InternalTransfersReader,
    private readonly contents: TransferOrderContentsReader,
    private readonly resupplies: TransferResupplyContents,
  ) {}

  async execute(query: GetInternalTransferManifestQuery): Promise<InternalTransferManifestView> {
    const transfer = await this.transfers.byId(query.transferId);
    if (transfer === null) {
      throw new InternalTransferNotFoundError(query.transferId);
    }
    const frozen = transfer.departedAt !== null;
    const [contents, clienteles] = await Promise.all([
      frozen ? () => undefined : itemContentsOf(this.contents, this.resupplies, [transfer]),
      transferClientelesOf(this.contents, [transfer]),
    ]);
    const manifest = transfer.manifest(contents);
    return {
      transferId: transfer.id,
      day: transfer.serviceDay,
      siteLabel: transfer.siteLabel,
      siteId: transfer.siteId,
      departedAt: transfer.departedAt?.toISOString() ?? null,
      frozen,
      ...manifest,
      orders: withClienteles(manifest.orders, clienteles),
    };
  }
}
