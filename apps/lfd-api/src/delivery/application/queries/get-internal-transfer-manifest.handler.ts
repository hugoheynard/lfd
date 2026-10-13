import type { InternalTransferManifestView } from "@lfd/contracts";
import { type IQueryHandler, QueryHandler } from "@nestjs/cqrs";

import { TransferOrderContentsReader } from "../../channels/commerce/index.js";
import { InternalTransferNotFoundError } from "../../domain/errors/internal-transfer-errors.js";
import { InternalTransfersReader } from "../../domain/ports/internal-transfers.reader.js";
import { itemContentsOf } from "../transfer-contents.js";
import { GetInternalTransferManifestQuery } from "./get-internal-transfer-manifest.query.js";

/**
 * **Ce que transporte un transfert interne** (décision de Hugo du
 * 2026-10-13 ; plan du transfert interne, lot T1). Prévu : le contenu de ses
 * commandes est lu au commerce à l'instant. Parti : le manifeste FIGÉ au
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
  ) {}

  async execute(query: GetInternalTransferManifestQuery): Promise<InternalTransferManifestView> {
    const transfer = await this.transfers.byId(query.transferId);
    if (transfer === null) {
      throw new InternalTransferNotFoundError(query.transferId);
    }
    const frozen = transfer.departedAt !== null;
    const contents = frozen ? () => undefined : await itemContentsOf(this.contents, [transfer]);
    return {
      transferId: transfer.id,
      day: transfer.serviceDay,
      siteLabel: transfer.siteLabel,
      departedAt: transfer.departedAt?.toISOString() ?? null,
      frozen,
      ...transfer.manifest(contents),
    };
  }
}
