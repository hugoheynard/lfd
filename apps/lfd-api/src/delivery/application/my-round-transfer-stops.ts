import type { DriverTransferStopView } from "@lfd/contracts";

import type { TransferOrderContentsReader } from "../channels/commerce/index.js";
import type { InternalTransfer } from "../domain/entities/internal-transfer.js";
import type { DriverTransferStopRow } from "../domain/ports/driver-rounds.reader.js";
import type { InternalTransfersReader } from "../domain/ports/internal-transfers.reader.js";
import { itemContentsOf } from "./transfer-contents.js";

/**
 * **Les arrêts de transfert de « Ma tournée »** (plan du transfert interne,
 * lot T2) : le site, les commandes portées, la réception, et ce que l'arrêt
 * transporte — le manifeste figé s'il est parti, calculé sinon, totalisé par
 * SKU. Une lecture du contenu pour tous les transferts encore prévus.
 */
export async function driverTransferStopsOf(
  rows: readonly DriverTransferStopRow[],
  transfers: InternalTransfersReader,
  contents: TransferOrderContentsReader,
): Promise<readonly DriverTransferStopView[]> {
  if (rows.length === 0) {
    return [];
  }
  const loaded = new Map<string, InternalTransfer>();
  for (const row of rows) {
    const transfer = await transfers.byId(row.transferId);
    if (transfer !== null) {
      loaded.set(transfer.id, transfer);
    }
  }
  const unfrozen = [...loaded.values()].filter((transfer) => transfer.departedAt === null);
  const itemContents = await itemContentsOf(contents, unfrozen);
  return rows.map((row) => ({
    stopId: row.stopId,
    transferId: row.transferId,
    position: row.position,
    closedAt: row.closedAt?.toISOString() ?? null,
    siteLabel: row.siteLabel,
    orderCount: row.orderCount,
    receivedAt: row.receivedAt?.toISOString() ?? null,
    totals: loaded.get(row.transferId)?.manifest(itemContents).totals ?? [],
  }));
}
