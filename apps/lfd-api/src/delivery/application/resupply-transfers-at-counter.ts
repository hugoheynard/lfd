import { Injectable } from "@nestjs/common";

import {
  type ResupplyOnlyTransferStatus,
  ResupplyTransfersReader,
} from "../channels/handover/index.js";
import { ResupplyOnlyTransfers } from "../domain/ports/resupply-only-transfers.reader.js";
import { TransferBinCounts } from "../domain/ports/transfer-bin-counts.reader.js";

/**
 * **Les transferts de réassort seul, vus du comptoir** (R3c, R3e) —
 * l'implémentation, par la livraison, du port qu'elle publie pour le retrait.
 * Deux lectures pour la journée : les transferts, puis leurs bacs non annulés.
 */
@Injectable()
export class ResupplyTransfersAtCounter extends ResupplyTransfersReader {
  constructor(
    private readonly transfers: ResupplyOnlyTransfers,
    private readonly bins: TransferBinCounts,
  ) {
    super();
  }

  async resupplyOnlyOn(serviceDay: string): Promise<readonly ResupplyOnlyTransferStatus[]> {
    const rows = await this.transfers.resupplyOnlyOn(serviceDay);
    const counts = await this.bins.liveBinCounts(rows.map((row) => row.transferId));
    return rows.map((row) => ({ ...row, binCount: counts.get(row.transferId) ?? 0 }));
  }
}
